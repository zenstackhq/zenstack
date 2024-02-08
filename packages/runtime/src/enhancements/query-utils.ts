/* eslint-disable @typescript-eslint/no-explicit-any */
import {
    FieldInfo,
    NestedWriteVisitorContext,
    getIdFields,
    getModelInfo,
    getUniqueConstraints,
    resolveField,
} from '../cross';
import { DbClientContract, DbOperations } from '../types';
import { getVersion } from '../version';
import { EnhancementOptions } from './create-enhancement';
import { prismaClientUnknownRequestError, prismaClientValidationError } from './utils';

export class QueryUtils {
    constructor(private readonly prisma: DbClientContract, private readonly options: EnhancementOptions) {}

    getIdFields(model: string) {
        return getIdFields(this.options.modelMeta, model, true);
    }

    makeIdSelection(model: string) {
        const idFields = this.getIdFields(model);
        return Object.assign({}, ...idFields.map((f) => ({ [f.name]: true })));
    }

    getEntityIds(model: string, entityData: any) {
        const idFields = this.getIdFields(model);
        const result: Record<string, unknown> = {};
        for (const idField of idFields) {
            result[idField.name] = entityData[idField.name];
        }
        return result;
    }

    /**
     * Initiates a transaction.
     */
    transaction<T>(db: Record<string, DbOperations>, action: (tx: Record<string, DbOperations>) => Promise<T>) {
        const fullDb = db as DbClientContract;
        if (fullDb['$transaction']) {
            return fullDb.$transaction(
                (tx) => {
                    (tx as any)[Symbol.for('nodejs.util.inspect.custom')] = 'PrismaClient$tx';
                    return action(tx);
                },
                {
                    maxWait: this.options.transactionMaxWait,
                    timeout: this.options.transactionTimeout,
                    isolationLevel: this.options.transactionIsolationLevel,
                }
            );
        } else {
            // already in transaction, don't nest
            return action(db);
        }
    }

    buildReversedQuery(context: NestedWriteVisitorContext, mutating = false, unsafeOperation = false) {
        let result, currQuery: any;
        let currField: FieldInfo | undefined;

        for (let i = context.nestingPath.length - 1; i >= 0; i--) {
            const { field, model, where } = context.nestingPath[i];

            // never modify the original where because it's shared in the structure
            const visitWhere = { ...where };
            if (model && where) {
                // make sure composite unique condition is flattened
                this.flattenGeneratedUniqueField(model, visitWhere);
            }

            if (!result) {
                // first segment (bottom), just use its where clause
                result = currQuery = { ...visitWhere };
                currField = field;
            } else {
                if (!currField) {
                    throw this.unknownError(`missing field in nested path`);
                }
                if (!currField.backLink) {
                    throw this.unknownError(`field ${currField.type}.${currField.name} doesn't have a backLink`);
                }

                const backLinkField = this.getModelField(currField.type, currField.backLink);
                if (!backLinkField) {
                    throw this.unknownError(`missing backLink field ${currField.backLink} in ${currField.type}`);
                }

                if (backLinkField.isArray && !mutating) {
                    // many-side of relationship, wrap with "some" query
                    currQuery[currField.backLink] = { some: { ...visitWhere } };
                    currQuery = currQuery[currField.backLink].some;
                } else {
                    const fkMapping = where && backLinkField.isRelationOwner && backLinkField.foreignKeyMapping;

                    // calculate if we should preserve the relation condition (e.g., { user: { id: 1 } })
                    const shouldPreserveRelationCondition =
                        // doing a mutation
                        mutating &&
                        // and it's a safe mutate
                        !unsafeOperation &&
                        // and the current segment is the direct parent (the last one is the mutate itself),
                        // the relation condition should be preserved and will be converted to a "connect" later
                        i === context.nestingPath.length - 2;

                    if (fkMapping && !shouldPreserveRelationCondition) {
                        // turn relation condition into foreign key condition, e.g.:
                        //     { user: { id: 1 } } => { userId: 1 }
                        for (const [r, fk] of Object.entries<string>(fkMapping)) {
                            currQuery[fk] = visitWhere[r];
                        }

                        if (i > 0) {
                            // prepare for the next segment
                            currQuery[currField.backLink] = {};
                        }
                    } else {
                        // preserve the original structure
                        currQuery[currField.backLink] = { ...visitWhere };
                    }
                    currQuery = currQuery[currField.backLink];
                }
                currField = field;
            }
        }
        return result;
    }

    flattenGeneratedUniqueField(model: string, args: any) {
        // e.g.: { a_b: { a: '1', b: '1' } } => { a: '1', b: '1' }
        const uniqueConstraints = getUniqueConstraints(this.options.modelMeta, model);
        if (uniqueConstraints && Object.keys(uniqueConstraints).length > 0) {
            for (const [field, value] of Object.entries<any>(args)) {
                if (
                    uniqueConstraints[field] &&
                    uniqueConstraints[field].fields.length > 1 &&
                    typeof value === 'object'
                ) {
                    // multi-field unique constraint, flatten it
                    delete args[field];
                    if (value) {
                        for (const [f, v] of Object.entries(value)) {
                            args[f] = v;
                        }
                    }
                }
            }
        }
    }

    validationError(message: string) {
        return prismaClientValidationError(this.prisma, this.options.prismaModule, message);
    }

    unknownError(message: string) {
        return prismaClientUnknownRequestError(this.prisma, this.options.prismaModule, message, {
            clientVersion: getVersion(),
        });
    }

    getModelFields(model: string) {
        return getModelInfo(this.options.modelMeta, model)?.fields;
    }

    /**
     * Gets information for a specific model field.
     */
    getModelField(model: string, field: string) {
        return resolveField(this.options.modelMeta, model, field);
    }
}
