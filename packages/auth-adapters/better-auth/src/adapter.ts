import type { BetterAuthOptions, Where } from 'better-auth';
import { BetterAuthError } from '@better-auth/core/error';
import { ORMErrorReason, QueryUtils } from '@zenstackhq/orm';
import type { ClientContract, ModelOperations, UpdateInput } from '@zenstackhq/orm';
import type { GetModels, SchemaDef } from '@zenstackhq/orm/schema';
import {
    createAdapterFactory,
    type AdapterFactoryCustomizeAdapterCreator,
    type AdapterFactoryOptions,
} from 'better-auth/adapters';
import { getSupportsArrays, type AdapterConfig } from './config';

export type { AdapterConfig } from './config';

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
            const isEqualityCondition = (w: Where) => w.operator === 'eq' || !w.operator;
            const convertWhereCondition = (model: string, w: Where) => ({
                [getFieldName({ model, field: w.field })]: isEqualityCondition(w)
                    ? w.value
                    : {
                          [operatorToORMOperator(w.operator!)]: w.value,
                      },
            });
            const convertWhereClause = (model: string, where?: Where[]): any => {
                if (!where || !where.length) return {};
                if (where.length === 1) {
                    const w = where[0]!;
                    if (!w) {
                        throw new BetterAuthError('Invalid where clause');
                    }
                    return convertWhereCondition(model, w);
                }
                const and = where.filter((w) => w.connector === 'AND' || !w.connector);
                const or = where.filter((w) => w.connector === 'OR');
                const andClause = and.map((w) => convertWhereCondition(model, w));
                const orClause = or.map((w) => convertWhereCondition(model, w));

                return {
                    ...(andClause.length ? { AND: andClause } : {}),
                    ...(orClause.length ? { OR: orClause } : {}),
                };
            };

            // ORM `update()` and `delete()` need a unique field at the top level of `where`, so AND-ed
            // equality conditions are lifted to the top level there, and the remaining conditions are
            // kept as filters. `isUnique` tells whether a single-field unique key ended up at the top level
            // (compound unique keys are left to the non-unique path).
            const convertUniqueWhereClause = (model: string, where: Where[]) => {
                const result: Record<string, unknown> = {};
                const and: Record<string, unknown>[] = [];
                const or: Record<string, unknown>[] = [];
                for (const w of where) {
                    const field = getFieldName({ model, field: w.field });
                    if (w.connector === 'OR') {
                        or.push(convertWhereCondition(model, w));
                    } else if (isEqualityCondition(w) && !(field in result)) {
                        result[field] = w.value;
                    } else {
                        and.push(convertWhereCondition(model, w));
                    }
                }
                if (and.length) result['AND'] = and;
                if (or.length) result['OR'] = or;

                const isUnique = QueryUtils.getUniqueFields(db.$schema, model).some(
                    (unique) => 'def' in unique && result[unique.name] !== undefined && result[unique.name] !== null,
                );
                return { where: result, isUnique };
            };

            // checked by `reason` rather than `instanceof ORMError`, in case the app loads another copy of the ORM
            const isNotFoundError = (err: unknown) =>
                (err as { reason?: unknown } | null)?.reason === ORMErrorReason.NOT_FOUND;

            function requireModelDb(db: ClientContract<Schema>, model: string) {
                const modelDb = db[model as keyof typeof db];
                if (!modelDb) {
                    throw new BetterAuthError(
                        `Model ${model} does not exist in the database. If you haven't generated the ZenStack schema, you need to run 'npx zen generate'`,
                    );
                }
                return modelDb as unknown as ModelOperations<SchemaDef, GetModels<SchemaDef>>;
            }

            // plain filter on the id field(s) of `row`, usable in any `where`
            const getIdFilter = (model: string, row: Record<string, unknown>) =>
                Object.fromEntries(QueryUtils.requireIdFields(db.$schema, model).map((f) => [f, row[f]]));

            // unique `where` that selects `row` by its id field(s); a compound id goes under its unique key name
            // (`a_b` by default, or the name given in `@@id(..., name: ...)`), as `update()`/`delete()` require
            const getIdWhere = (model: string, row: Record<string, unknown>) => {
                const idFields = QueryUtils.requireIdFields(db.$schema, model);
                const idFilter = getIdFilter(model, row);
                if (idFields.length === 1) return idFilter;
                const key =
                    QueryUtils.getUniqueFields(db.$schema, model).find(
                        (u) =>
                            'defs' in u &&
                            Object.keys(u.defs).length === idFields.length &&
                            idFields.every((f) => f in u.defs),
                    )?.name ?? idFields.join('_');
                return { [key]: idFilter };
            };

            const selectIdFields = (model: string) =>
                Object.fromEntries(QueryUtils.requireIdFields(db.$schema, model).map((f) => [f, true]));

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
                    const data = update as UpdateInput<SchemaDef, GetModels<SchemaDef>, any>;
                    const uniqueWhere = convertUniqueWhereClause(model, where);
                    let updateWhere = uniqueWhere.where;
                    if (!uniqueWhere.isUnique) {
                        // No unique field to select the row by: find a matching row, then update it by its id,
                        // keeping the original conditions as a guard in case the row changed in between.
                        const filter = convertWhereClause(model, where);
                        const found: any = await modelDb.findFirst({ where: filter, select: selectIdFields(model) });
                        if (!found) return null;
                        updateWhere = { ...getIdWhere(model, found), AND: [filter] };
                    }
                    try {
                        return await modelDb.update({ where: updateWhere as any, data });
                    } catch (err) {
                        // better-auth expects `null` when no row matches
                        if (isNotFoundError(err)) return null;
                        throw err;
                    }
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
                    const uniqueWhere = convertUniqueWhereClause(model, where);
                    if (!uniqueWhere.isUnique) {
                        await modelDb.deleteMany({ where: convertWhereClause(model, where) });
                        return;
                    }
                    try {
                        await modelDb.delete({ where: uniqueWhere.where as any });
                    } catch (err) {
                        // If the record doesn't exist, we don't want to throw an error
                        if (!isNotFoundError(err)) throw err;
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

                // Deletes one row matching `where` and returns it (single-use tokens, codes, etc.), or `null`.
                // The row is located first, then deleted by its id with the original conditions kept in the
                // DELETE's filter, so concurrent callers can't both consume it and no other matching row is touched.
                // (For plain models the conditions are evaluated by the DELETE statement itself; better-auth's
                // tables are never polymorphic.)
                async consumeOne({ model, where }): Promise<any> {
                    requireModelDb(db, model);
                    const filter = convertWhereClause(model, where);
                    return db.$transaction(async (tx) => {
                        const txModelDb = requireModelDb(tx as ClientContract<Schema>, model);
                        const found: any = await txModelDb.findFirst({ where: filter });
                        if (!found) return null;
                        const { count } = await txModelDb.deleteMany({
                            where: { ...getIdFilter(model, found), AND: [filter] } as any,
                        });
                        return count > 0 ? found : null;
                    });
                },

                // Applies `field = field + delta` (plus absolute `set` values) to one row matching `where`, which
                // is both the selector and the guard, and returns the updated row, or `null`. The guarded write is
                // an `updateMany`, so for plain models the conditions stay in the UPDATE statement on every dialect
                // (`update()` swaps them for the loaded ids where RETURNING isn't supported, e.g. MySQL).
                // As in better-auth's Prisma adapter, a null counter stays null (SQL `NULL + n`).
                async incrementOne({ model, where, increment, set }): Promise<any> {
                    requireModelDb(db, model);
                    const filter = convertWhereClause(model, where);
                    const data: Record<string, unknown> = { ...set };
                    for (const [field, delta] of Object.entries(increment)) {
                        data[field] = { increment: delta };
                    }
                    return db.$transaction(async (tx) => {
                        const txModelDb = requireModelDb(tx as ClientContract<Schema>, model);
                        const found: any = await txModelDb.findFirst({ where: filter, select: selectIdFields(model) });
                        if (!found) return null;
                        const idFilter = getIdFilter(model, found);
                        const { count } = await txModelDb.updateMany({
                            where: { ...idFilter, AND: [filter] } as any,
                            data,
                        });
                        if (count === 0) return null;
                        return txModelDb.findFirst({ where: idFilter as any });
                    });
                },

                options: config,

                createSchema: async ({ file, tables }) => {
                    // Self-import via package subpath (not a relative './schema-generator') so the
                    // bundler treats it as external and keeps it lazy in the CJS output — see tsdown.config.ts.
                    const generateSchema = (await import('@zenstackhq/better-auth/schema-generator')).generateSchema;
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
            supportsArrays: getSupportsArrays(config),
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
    return (options: BetterAuthOptions) => {
        lazyOptions = options;
        return adapter(options);
    };
};
