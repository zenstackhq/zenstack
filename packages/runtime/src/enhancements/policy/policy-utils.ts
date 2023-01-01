/* eslint-disable @typescript-eslint/no-explicit-any */

import { PrismaClientKnownRequestError, PrismaClientUnknownRequestError } from '@prisma/client/runtime';
import { camelCase } from 'change-case';
import cuid from 'cuid';
import deepcopy from 'deepcopy';
import { format } from 'util';
import { AUXILIARY_FIELDS, TRANSACTION_FIELD_NAME } from '../../constants';
import { AuthUser, DbClientContract, DbOperations, PolicyOperationKind, PrismaWriteActionType } from '../../types';
import { getVersion } from '../../version';
import { resolveField } from '../model-meta';
import { NestedWriteVisitor, VisitorContext } from '../nested-write-vistor';
import { ModelMeta, PolicyDef, PolicyFunc } from '../types';
import { enumerate } from '../utils';
import { Logger } from './logger';

/**
 * Access policy enforcement utilities
 */
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

    /**
     * Gets pregenerated authorization guard object for a given model and operation.
     *
     * @returns true if operation is unconditionally allowed, false if unconditionally denied,
     * otherwise returns a guard object
     */
    async getAuthGuard(model: string, operation: PolicyOperationKind): Promise<boolean | object> {
        const guard = this.policy.guard[camelCase(model)];
        if (!guard) {
            throw this.unknownError(model);
        }

        if (guard.allowAll === true) {
            return true;
        }

        if (guard.denyAll === true) {
            return false;
        }

        const provider: PolicyFunc | undefined = guard[operation];
        if (!provider) {
            throw this.unknownError(`zenstack: unable to load authorization guard for ${model}`);
        }
        return provider({ user: this.user });
    }

    /**
     * Injects model auth guard as where clause.
     */
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
     * an error is thrown.
     */
    async readWithCheck(model: string, args: any): Promise<unknown[]> {
        args = this.clone(args);
        await this.injectAuthGuard(args, model, 'read');

        // recursively inject read guard conditions into the query args
        await this.injectNestedReadConditions(model, args);

        this.logger.info(`Reading with validation for ${model}: ${format(args)}`);
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
     * Post processing checks for read model entities. Validates to-one relations
     * (which can't be trimmed at query time) and removes fields that should be
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

    /**
     * Process Prisma write actions.
     */
    async processWrite(
        model: string,
        action: PrismaWriteActionType,
        args: any,
        db: Record<string, DbOperations>,
        writeAction: () => Promise<unknown>
    ) {
        // record model types for which new entities are created
        // so we can post-check if they satisfy 'create' policies
        const createdModels = new Set<string>();

        if (args.select && !args.select.id) {
            // make sure 'id' field is selected, we need it to
            // read back the updated entity
            args.select.id = true;
        }

        // use a transaction to conduct write, so in case any create or nested create
        // fails access policies, we can roll back the entire operation
        const transactionId = cuid();

        // args processor for create
        const processCreate = async (model: string, args: any) => {
            const guard = await this.getAuthGuard(model, 'create');
            if (guard === false) {
                throw this.deniedByPolicy(model, 'create');
            } else if (guard !== true) {
                // mark the create with a transaction tag so we can check them later
                args[TRANSACTION_FIELD_NAME] = `${transactionId}:create`;
                createdModels.add(model);
            }
        };

        const buildReversedQuery = async (context: VisitorContext) => {
            const subQuery: any = {};
            let curr = subQuery;
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            let currField = context.field!;

            for (const up of context.updateStack.slice().reverse()) {
                // backLink field represents the field on the opposite side of the
                // to-one relation
                if (currField.backLink) {
                    curr[currField.backLink] = { ...up.where };
                    curr = curr[currField.backLink];
                    currField = await resolveField(this.modelMeta, currField.type, currField.backLink);
                } else {
                    throw this.unknownError(`Field ${currField.type}.${currField.name} doens't have a backLink`);
                }
            }
            return subQuery;
        };

        // args processor for update/upsert
        const processUpdate = async (model: string, args: any, context: VisitorContext) => {
            const guard = await this.getAuthGuard(model, 'update');
            if (guard === false) {
                throw this.deniedByPolicy(model, 'update');
            } else if (guard !== true) {
                const isToOneUpdate = context.field?.isDataModel && !context.field.isArray;

                if (isToOneUpdate) {
                    // To-one relation field is complicated because there's no way to
                    // filter it during update (args doesn't carry a 'where' clause).
                    //
                    // We need to recursively walk up its hierarcy in the query args
                    // to construct a reversed query to identify the nested entity
                    // under update, and then check if it satisfies policy.
                    //
                    // E.g.:
                    // A - B - C
                    //
                    // update A with:
                    // {
                    //   where: { id: 'aId' },
                    //   data: {
                    //     b: {
                    //       c: { value: 1 }
                    //     }
                    //   }
                    // }
                    //
                    // To check if the update to 'c' field is permitted, we
                    // reverse the query stack into a filter for C model, like:
                    // {
                    //   where: {
                    //     b: { a: { id: 'aId' } }
                    //   }
                    // }
                    // , and with this we can filter out the C entity that's going
                    // to be nestedly updated, and check if it's allowed

                    const subQuery = await buildReversedQuery(context);
                    await this.checkPolicyForFilter(model, subQuery, 'update', db);
                } else {
                    // non-nested update, check policies directly
                    if (!args.where) {
                        throw this.unknownError(`Missing 'where' in update args`);
                    }
                    await this.checkPolicyForFilter(model, args.where, 'update', db);
                }
            }
        };

        // args processor for updateMany
        const processUpdateMany = async (model: string, args: any) => {
            const guard = await this.getAuthGuard(model, 'update');
            if (guard === false) {
                throw this.deniedByPolicy(model, 'update');
            } else if (guard !== true) {
                // inject policy filter
                await this.injectAuthGuard(args, model, 'update');
            }
        };

        // args processor for delete
        const processDelete = async (model: string, args: any, context: VisitorContext) => {
            const guard = await this.getAuthGuard(model, 'delete');
            if (guard === false) {
                throw this.deniedByPolicy(model, 'delete');
            } else if (guard !== true) {
                const isToOneDelete = context.field?.isDataModel && !context.field.isArray;

                if (isToOneDelete) {
                    const subQuery = await buildReversedQuery(context);
                    await this.checkPolicyForFilter(model, subQuery, 'delete', db);
                } else {
                    await this.checkPolicyForFilter(model, args, 'delete', db);
                }
            }
        };

        // use a visitor to process args before conducting the write action
        const visitor = new NestedWriteVisitor(this.modelMeta, {
            create: async (model, args) => {
                for (const oneArgs of enumerate(args)) {
                    await processCreate(model, oneArgs);
                }
            },

            connectOrCreate: async (model, args) => {
                for (const oneArgs of enumerate(args)) {
                    if (oneArgs.create) {
                        await processCreate(model, oneArgs.create);
                    }
                }
            },

            update: async (model, args, context) => {
                for (const oneArgs of enumerate(args)) {
                    await processUpdate(model, oneArgs, context);
                }
            },

            updateMany: async (model, args) => {
                for (const oneArgs of enumerate(args)) {
                    await processUpdateMany(model, oneArgs);
                }
            },

            upsert: async (model, args, context) => {
                for (const oneArgs of enumerate(args)) {
                    if (oneArgs.create) {
                        await processCreate(model, oneArgs.create);
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

        // proceed with the update (with args processed)
        const result = await writeAction();

        // do post-check on created entities
        if (createdModels.size > 0) {
            await Promise.all(
                [...createdModels].map((model) =>
                    this.checkPolicyForFilter(
                        model,
                        { [TRANSACTION_FIELD_NAME]: `${transactionId}:create` },
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

    unknownError(message: string) {
        return new PrismaClientUnknownRequestError(message, {
            clientVersion: getVersion(),
        });
    }

    /**
     * Given a filter, check if applying access policy filtering will result
     * in data being trimmed, and if so, throw an error.
     */
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
    }

    /**
     * Clones an object and makes sure it's not empty.
     */
    clone(value: unknown) {
        return value ? deepcopy(value) : {};
    }
}
