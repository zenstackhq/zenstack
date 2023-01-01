/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { PrismaClientKnownRequestError, PrismaClientUnknownRequestError } from '@prisma/client/runtime';
import { camelCase } from 'change-case';
import deepcopy from 'deepcopy';
import superjson from 'superjson';
import { AUXILIARY_FIELDS, TRANSACTION_FIELD_NAME } from '../constants';
import { resolveField } from '../enhancements/model-meta';
import { NestedWriteVisitor, VisitorContext } from '../enhancements/nested-write-vistor';
import { ModelMeta, PolicyDef, PolicyFunc } from '../enhancements/types';
import { enumerate } from '../enhancements/utils';
import { AuthUser, DbClientContract, DbOperations, PolicyOperationKind, PrismaWriteActionType } from '../types';
import { getVersion } from '../version';
import { Logger } from './logger';

//#region General helpers

export class PolicyUtil {
    private readonly logger: Logger;

    constructor(
        private readonly db: DbClientContract,
        private readonly modelMeta: ModelMeta,
        private readonly policy: PolicyDef,
        private readonly user?: AuthUser
    ) {
        this.logger = new Logger(db);
    }

    /**
     * Creates a conjunction of a list of query conditions.
     */
    and(...conditions: (boolean | object)[]): any {
        if (conditions.includes(false)) {
            // always false
            return { id: { in: [] } };
        }

        const filtered = conditions.filter((c): c is object => typeof c === 'object' && !!c);
        if (filtered.length === 0) {
            return undefined;
        } else if (filtered.length === 1) {
            return filtered[0];
        } else {
            return { AND: filtered };
        }
    }

    /**
     * Creates a disjunction of a list of query conditions.
     */
    or(...conditions: (boolean | object)[]): any {
        if (conditions.includes(true)) {
            // always true
            return { id: { notIn: [] } };
        }

        const filtered = conditions.filter((c): c is object => typeof c === 'object' && !!c);
        if (filtered.length === 0) {
            return undefined;
        } else if (filtered.length === 1) {
            return filtered[0];
        } else {
            return { OR: filtered };
        }
    }

    async getAuthGuard(model: string, operation: PolicyOperationKind): Promise<boolean | object> {
        const guard = this.policy.guard[camelCase(model)];
        if (!guard) {
            throw new PrismaClientUnknownRequestError(`zenstack: unable to load authorization guard for ${model}`, {
                clientVersion: getVersion(),
            });
        }

        if (guard.allowAll === true) {
            return true;
        }

        if (guard.denyAll === true) {
            return false;
        }

        const provider: PolicyFunc | undefined = guard[operation];
        if (!provider) {
            throw new PrismaClientUnknownRequestError(`zenstack: unable to load authorization query for ${model}`, {
                clientVersion: getVersion(),
            });
        }
        return provider({ user: this.user });
    }

    async injectAuthGuard(args: any, model: string, operation: PolicyOperationKind) {
        const guard = await this.getAuthGuard(model, operation);
        args.where = this.and(args.where, guard);
    }

    /**
     * Read model entities w.r.t the given query args. The result list
     * are guaranteed to fully satisfy 'read' policy rules recursively.
     *
     * For to-many relations involved, items not satisfying policy are
     * silently trimmed. For to-one relation, if relation data fails policy
     * an CRUDError is thrown.
     *
     * @param model the model to query for
     * @param args the Prisma query args
     * @param service the ZenStack service
     * @param context the query context
     * @param db the db (or transaction)
     * @returns
     */
    async readWithCheck(model: string, args: any): Promise<unknown[]> {
        args = this.clone(args);
        await this.injectAuthGuard(args, model, 'read');

        // recursively inject read guard conditions into the query args
        await this.injectNestedReadConditions(model, args);

        this.logger.info(`Reading with validation for ${model}: ${superjson.stringify(args)}`);
        const result: any[] = await this.db[model].findMany(args);

        await Promise.all(result.map((item) => this.postProcessForRead(item, model, args, 'read')));

        return result;
    }

    private async injectNestedReadConditions(model: string, args: any) {
        const injectTarget = args.select ?? args.include;
        if (!injectTarget) {
            return;
        }

        for (const field of this.getModelFields(injectTarget)) {
            const fieldInfo = resolveField(this.modelMeta, model, field);
            if (!fieldInfo || !fieldInfo.isDataModel) {
                // only care about relation fields
                continue;
            }

            if (fieldInfo.isArray) {
                if (typeof injectTarget[field] !== 'object') {
                    injectTarget[field] = {};
                }
                // inject extra condition for to-many relation
                const guard = await this.getAuthGuard(fieldInfo.type, 'read');
                injectTarget[field].where = this.and(injectTarget.where, guard);
            } else {
                // there's no way of injecting condition for to-one relation, so we
                // make sure 'id' field is selected and check them against query result
                if (injectTarget[field]?.select && injectTarget[field]?.select?.id !== true) {
                    injectTarget[field].select.id = true;
                }
            }

            // recurse
            await this.injectNestedReadConditions(fieldInfo.type, injectTarget[field]);
        }
    }

    private getModelFields(data: any) {
        return Object.keys(data).filter((f) => !AUXILIARY_FIELDS.includes(f));
    }

    /**
     * Post processing checks for read model entities.
     * Validates to-one relations (which can't be trimmed
     * at query time) and removes fields that should be
     * omitted.
     */
    async postProcessForRead(entityData: any, model: string, args: any, operation: PolicyOperationKind) {
        if (!entityData?.id) {
            return;
        }

        const injectTarget = args.select ?? args.include;
        if (!injectTarget) {
            return;
        }

        // to-one relation data cannot be trimmed by injected guards, we have to
        // post-check them
        for (const field of this.getModelFields(injectTarget)) {
            const fieldInfo = resolveField(this.modelMeta, model, field);
            if (!fieldInfo || !fieldInfo.isDataModel || fieldInfo.isArray || !entityData?.[field]?.id) {
                continue;
            }

            this.logger.info(`Validating read of to-one relation: ${fieldInfo.type}#${entityData[field].id}`);

            await this.checkPolicyForFilter(fieldInfo.type, { id: entityData[field].id }, operation, this.db);

            // recurse
            await this.postProcessForRead(entityData[field], fieldInfo.type, injectTarget[field], operation);
        }
    }

    async processWritePayload(
        model: string,
        action: PrismaWriteActionType,
        args: any,
        db: Record<string, DbOperations>,
        transactionId: string,
        writeAction: () => Promise<unknown>
    ) {
        const createdModels = new Set<string>();
        // const updateModels = new Map<string, Map<string, any>>();
        // const deletedModels = new Set<string>();

        if (args.select && !args.select.id) {
            // make sure 'id' field is selected
            args.select.id = true;
        }

        const processCreate = async (model: string, args: any, context: VisitorContext) => {
            const guard = await this.getAuthGuard(model, 'create');
            if (guard === false) {
                throw this.deniedByPolicy(model, 'create');
            } else if (guard !== true) {
                if (!context.field) {
                    // toplevel create, mark
                    args[TRANSACTION_FIELD_NAME] = `${transactionId}:create`;
                } else {
                    // non-toplevel create, mark
                    args[TRANSACTION_FIELD_NAME] = `${transactionId}:create`;
                }
                createdModels.add(model);
            }
        };

        const processUpdate = async (model: string, args: any, context: VisitorContext) => {
            const guard = await this.getAuthGuard(model, 'update');
            if (guard === false) {
                throw this.deniedByPolicy(model, 'update');
            } else if (guard !== true) {
                const isToOneUpdate = context.field?.isDataModel && !context.field.isArray;

                if (isToOneUpdate) {
                    const subQuery: any = {};
                    let curr = subQuery;
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    let currField = context.field!;

                    for (const up of [...context.updateStack].reverse()) {
                        if (currField.backLink) {
                            curr[currField.backLink] = { ...up.where };
                            curr = curr[currField.backLink];
                            currField = await resolveField(this.modelMeta, currField.type, currField.backLink);
                        } else {
                            throw new Error('unexpected update stack');
                        }
                    }
                    await this.checkPolicyForFilter(model, subQuery, 'update', db);
                } else {
                    if (!args.where) {
                        throw new Error(`Missing 'where' in update args`);
                    }
                    await this.checkPolicyForFilter(model, args.where, 'update', db);
                }
            }
        };

        const processUpdateMany = async (model: string, args: any, _context: VisitorContext) => {
            const guard = await this.getAuthGuard(model, 'update');
            if (guard === false) {
                throw this.deniedByPolicy(model, 'update');
            } else if (guard !== true) {
                await this.injectAuthGuard(args, model, 'update');
                // args.data = { ...args.data, [TRANSACTION_FIELD_NAME]: `${transactionId}:update` };
            }
        };

        const processDelete = async (model: string, args: any, context: VisitorContext) => {
            const guard = await this.getAuthGuard(model, 'delete');
            if (guard === false) {
                throw this.deniedByPolicy(model, 'delete');
            } else if (guard !== true) {
                const isToOneDelete = context.field?.isDataModel && !context.field.isArray;

                if (isToOneDelete) {
                    const subQuery: any = {};
                    let curr = subQuery;
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    let currField = context.field!;

                    for (const up of [...context.updateStack].reverse()) {
                        if (currField.backLink) {
                            curr[currField.backLink] = { ...up.where };
                            curr = curr[currField.backLink];
                            currField = await resolveField(this.modelMeta, currField.type, currField.backLink);
                        } else {
                            throw new Error('unexpected update stack');
                        }
                    }
                    await this.checkPolicyForFilter(model, subQuery, 'delete', db);
                } else {
                    await this.checkPolicyForFilter(model, args, 'delete', db);
                }
            }
        };

        const visitor = new NestedWriteVisitor(this.modelMeta, {
            create: async (model, args, context) => {
                for (const oneArgs of enumerate(args)) {
                    await processCreate(model, oneArgs, context);
                }
            },

            connectOrCreate: async (model, args, context) => {
                for (const oneArgs of enumerate(args)) {
                    if (oneArgs.create) {
                        await processCreate(model, oneArgs.create, context);
                    }
                }
            },

            update: async (model, args, context) => {
                for (const oneArgs of enumerate(args)) {
                    await processUpdate(model, oneArgs, context);
                }
            },

            updateMany: async (model, args, context) => {
                for (const oneArgs of enumerate(args)) {
                    await processUpdateMany(model, oneArgs, context);
                }
            },

            upsert: async (model, args, context) => {
                for (const oneArgs of enumerate(args)) {
                    if (oneArgs.create) {
                        await processCreate(model, oneArgs.create, context);
                    }

                    if (oneArgs.update) {
                        await processUpdate(model, { where: oneArgs.where, data: oneArgs.update }, context);
                    }
                }
            },

            delete: async (model, args, context) => {
                for (const oneArgs of enumerate(args)) {
                    await processDelete(model, oneArgs, context);
                }
            },

            deleteMany: async (model, args, context) => {
                const guard = await this.getAuthGuard(model, 'delete');
                if (guard === false) {
                    throw this.deniedByPolicy(model, 'delete');
                } else if (guard !== true) {
                    if (Array.isArray(args)) {
                        context.parent.deleteMany = args.map((oneArgs) => this.and(oneArgs, guard));
                    } else {
                        context.parent.deleteMany = this.and(args, guard);
                    }
                }
            },
        });

        await visitor.visit(model, action, args);

        const result = await writeAction();

        if (createdModels.size > 0) {
            await Promise.all(
                [...createdModels].map((model) =>
                    this.checkPolicyForFilter(
                        model,
                        {
                            [TRANSACTION_FIELD_NAME]: {
                                in: [`${transactionId}:create`],
                            },
                        },
                        'create',
                        db
                    )
                )
            );
        }
        return result;
    }

    deniedByPolicy(model: string, operation: PolicyOperationKind, extra?: string) {
        return new PrismaClientKnownRequestError(
            `denied by policy: entities failed '${operation}' check, ${model}${extra ? ', ' + extra : ''}`,
            { clientVersion: getVersion(), code: 'P2004' }
        );
    }

    notFound(model: string) {
        return new PrismaClientKnownRequestError(`entity not found for model ${model}`, {
            clientVersion: getVersion(),
            code: 'P2025',
        });
    }

    async checkPolicyForFilter(
        model: string,
        filter: any,
        operation: PolicyOperationKind,
        db: Record<string, DbOperations>
    ) {
        this.logger.info(`Checking policy for ${model}#${JSON.stringify(filter)} for ${operation}`);

        const count = (await db[model].count({ where: filter })) as number;
        const guard = await this.getAuthGuard(model, operation);

        // build a query condition with policy injected
        const guardedQuery = { where: this.and(filter, guard) };

        // query with policy injected
        const guardedCount = (await db[model].count(guardedQuery)) as number;

        // see if we get fewer items with policy, if so, reject with an throw
        if (guardedCount < count) {
            this.logger.info(`entity ${model} failed policy check for operation ${operation}`);
            throw this.deniedByPolicy(model, operation, `${count - guardedCount} entities failed policy check`);
        }

        return count;
    }

    clone(value: unknown) {
        return value ? deepcopy(value) : {};
    }
}
