import type { BetterAuthOptions } from '@better-auth/core';
import type { DBAdapter, DBAdapterDebugLogOption, Where } from '@better-auth/core/db/adapter';
import { BetterAuthError } from '@better-auth/core/error';
import type { ClientContract, ModelOperations, UpdateInput } from '@zenstackhq/orm';
import type { GetModels, SchemaDef } from '@zenstackhq/orm/schema';
import {
    createAdapterFactory,
    type AdapterFactoryCustomizeAdapterCreator,
    type AdapterFactoryOptions,
} from 'better-auth/adapters';
import { generateSchema } from './schema-generator';

/**
 * Options for the ZenStack adapter factory.
 */
export interface AdapterConfig {
    /**
     * Database provider
     */
    provider: 'sqlite' | 'postgresql';

    /**
     * Enable debug logs for the adapter
     *
     * @default false
     */
    debugLogs?: DBAdapterDebugLogOption | undefined;

    /**
     * Use plural table names
     *
     * @default false
     */
    usePlural?: boolean | undefined;
}

/**
 * Create a Better-Auth adapter for ZenStack ORM.
 * @param db ZenStack ORM client instance
 * @param config adapter configuration options
 */
export const zenstackAdapter = <Schema extends SchemaDef>(db: ClientContract<Schema>, config: AdapterConfig) => {
    let lazyOptions: BetterAuthOptions | null = null;
    const createCustomAdapter =
        (db: ClientContract<Schema>): AdapterFactoryCustomizeAdapterCreator =>
        ({ getFieldName, options }) => {
            const convertSelect = (select?: string[], model?: string) => {
                if (!select || !model) return undefined;
                return select.reduce((prev, cur) => {
                    return {
                        ...prev,
                        [getFieldName({ model, field: cur })]: true,
                    };
                }, {});
            };
            function operatorToORMOperator(operator: string) {
                switch (operator) {
                    case 'starts_with':
                        return 'startsWith';
                    case 'ends_with':
                        return 'endsWith';
                    case 'ne':
                        return 'not';
                    case 'not_in':
                        return 'notIn';
                    default:
                        return operator;
                }
            }
            const convertWhereClause = (model: string, where?: Where[]): any => {
                if (!where || !where.length) return {};
                if (where.length === 1) {
                    const w = where[0]!;
                    if (!w) {
                        throw new BetterAuthError('Invalid where clause');
                    }
                    return {
                        [getFieldName({ model, field: w.field })]:
                            w.operator === 'eq' || !w.operator
                                ? w.value
                                : {
                                      [operatorToORMOperator(w.operator)]: w.value,
                                  },
                    };
                }
                const and = where.filter((w) => w.connector === 'AND' || !w.connector);
                const or = where.filter((w) => w.connector === 'OR');
                const andClause = and.map((w) => {
                    return {
                        [getFieldName({ model, field: w.field })]:
                            w.operator === 'eq' || !w.operator
                                ? w.value
                                : {
                                      [operatorToORMOperator(w.operator)]: w.value,
                                  },
                    };
                });
                const orClause = or.map((w) => {
                    return {
                        [getFieldName({ model, field: w.field })]:
                            w.operator === 'eq' || !w.operator
                                ? w.value
                                : {
                                      [operatorToORMOperator(w.operator)]: w.value,
                                  },
                    };
                });

                return {
                    ...(andClause.length ? { AND: andClause } : {}),
                    ...(orClause.length ? { OR: orClause } : {}),
                };
            };

            function requireModelDb(db: ClientContract<Schema>, model: string) {
                const modelDb = db[model as keyof typeof db];
                if (!modelDb) {
                    throw new BetterAuthError(
                        `Model ${model} does not exist in the database. If you haven't generated the ZenStack schema, you need to run 'npx zen generate'`,
                    );
                }
                return modelDb as unknown as ModelOperations<SchemaDef, GetModels<SchemaDef>>;
            }

            return {
                async create({ model, data: values, select }): Promise<any> {
                    const modelDb = requireModelDb(db, model);
                    return await modelDb.create({
                        data: values,
                        select: convertSelect(select, model),
                    });
                },

                async findOne({ model, where, select }): Promise<any> {
                    const modelDb = requireModelDb(db, model);
                    const whereClause = convertWhereClause(model, where);
                    return await modelDb.findFirst({
                        where: whereClause,
                        select: convertSelect(select, model),
                    });
                },

                async findMany({ model, where, limit, offset, sortBy }): Promise<any[]> {
                    const modelDb = requireModelDb(db, model);
                    const whereClause = convertWhereClause(model, where);
                    return await modelDb.findMany({
                        where: whereClause,
                        take: limit || 100,
                        skip: offset || 0,
                        ...(sortBy?.field
                            ? {
                                  orderBy: {
                                      [getFieldName({ model, field: sortBy.field })]:
                                          sortBy.direction === 'desc' ? 'desc' : 'asc',
                                  } as any,
                              }
                            : {}),
                    });
                },

                async count({ model, where }) {
                    const modelDb = requireModelDb(db, model);
                    const whereClause = convertWhereClause(model, where);
                    return await modelDb.count({
                        where: whereClause,
                    });
                },

                async update({ model, where, update }): Promise<any> {
                    const modelDb = requireModelDb(db, model);
                    const whereClause = convertWhereClause(model, where);
                    return await modelDb.update({
                        where: whereClause,
                        data: update as UpdateInput<SchemaDef, GetModels<SchemaDef>, any>,
                    });
                },

                async updateMany({ model, where, update }) {
                    const modelDb = requireModelDb(db, model);
                    const whereClause = convertWhereClause(model, where);
                    const result = await modelDb.updateMany({
                        where: whereClause,
                        data: update,
                    });
                    return result ? (result.count as number) : 0;
                },

                async delete({ model, where }): Promise<any> {
                    const modelDb = requireModelDb(db, model);
                    const whereClause = convertWhereClause(model, where);
                    try {
                        await modelDb.delete({
                            where: whereClause,
                        });
                    } catch {
                        // If the record doesn't exist, we don't want to throw an error
                    }
                },

                async deleteMany({ model, where }) {
                    const modelDb = requireModelDb(db, model);
                    const whereClause = convertWhereClause(model, where);
                    const result = await modelDb.deleteMany({
                        where: whereClause,
                    });
                    return result ? (result.count as number) : 0;
                },

                options: config,

                createSchema: async ({ file, tables }) => {
                    return generateSchema(file, tables, config, options);
                },
            };
        };

    const adapterOptions: AdapterFactoryOptions = {
        config: {
            adapterId: 'zenstack',
            adapterName: 'ZenStack Adapter',
            usePlural: config.usePlural ?? false,
            debugLogs: config.debugLogs ?? false,
            transaction: (cb) =>
                db.$transaction((tx) => {
                    const adapter = createAdapterFactory({
                        config: adapterOptions!.config,
                        adapter: createCustomAdapter(tx as ClientContract<Schema>),
                    })(lazyOptions!);
                    return cb(adapter);
                }),
        },
        adapter: createCustomAdapter(db),
    };

    const adapter = createAdapterFactory(adapterOptions);
    return (options: BetterAuthOptions): DBAdapter<BetterAuthOptions> => {
        lazyOptions = options;
        return adapter(options);
    };
};
