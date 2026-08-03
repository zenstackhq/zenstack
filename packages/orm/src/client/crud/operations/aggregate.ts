import type { SchemaDef } from '@zenstackhq/schema';
import { match } from 'ts-pattern';
import { createInvalidInputError } from '../../errors';
import { getField } from '../../query-utils';
import { BaseOperationHandler } from './base';

// stable key for comparing two `args` payloads (bigint-safe)
const argsKey = (v: unknown) => JSON.stringify(v, (_k, val) => (typeof val === 'bigint' ? `${val}n` : val));

export class AggregateOperationHandler<Schema extends SchemaDef> extends BaseOperationHandler<Schema> {
    async handle(_operation: 'aggregate', args: unknown | undefined) {
        // normalize args to strip `undefined` fields
        const normalizedArgs = this.normalizeArgs(args);

        // parse args
        const parsedArgs = this.inputValidator.validateAggregateArgs(this.model, normalizedArgs);

        let query = this.kysely.selectFrom((eb) => {
            // nested query for filtering and pagination

            // table and where
            let subQuery = this.dialect
                .buildSelectModel(this.model, this.model)
                .where(() => this.dialect.buildFilter(this.model, this.model, parsedArgs?.where));

            // select fields: collect fields (and any parameterized-computed `args`) from the
            // aggregation bodies. The field is materialized once into `$sub`; a parameterized
            // computed field carries a `{ args }` value instead of `true`.
            const selectedFields: string[] = [];
            const computedArgsByField: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(parsedArgs)) {
                if (key.startsWith('_') && value && typeof value === 'object') {
                    Object.entries(value)
                        .filter(([field]) => field !== '_all')
                        .forEach(([field, val]) => {
                            const args =
                                val && typeof val === 'object' && 'args' in val ? (val as any).args : undefined;
                            if (val !== true && args === undefined) {
                                return;
                            }
                            if (!selectedFields.includes(field)) selectedFields.push(field);
                            if (args !== undefined) {
                                // the field is materialized once into `$sub`, so every aggregation
                                // of it must agree on `args` — otherwise the result would silently
                                // use whichever `args` was seen last
                                const prev = computedArgsByField[field];
                                if (prev !== undefined && argsKey(prev) !== argsKey(args)) {
                                    throw createInvalidInputError(
                                        `computed field "${field}" is aggregated with conflicting "args"; ` +
                                            `the same field can only be aggregated with one set of arguments per query`,
                                    );
                                }
                                computedArgsByField[field] = args;
                            }
                        });
                }
            }
            if (selectedFields.length > 0) {
                for (const field of selectedFields) {
                    subQuery = this.dialect.buildSelectField(
                        subQuery,
                        this.model,
                        this.model,
                        field,
                        computedArgsByField[field],
                    );
                }
            } else {
                // if no field is explicitly selected, just do a `select 1` so `_count` works
                subQuery = subQuery.select(() => eb.lit(1).as('_all'));
            }

            // skip & take
            const skip = parsedArgs?.skip;
            let take = parsedArgs?.take;
            let negateOrderBy = false;
            if (take !== undefined && take < 0) {
                negateOrderBy = true;
                take = -take;
            }
            subQuery = this.dialect.buildSkipTake(subQuery, skip, take);

            // orderBy
            subQuery = this.dialect.buildOrderBy(
                subQuery,
                this.model,
                this.model,
                parsedArgs.orderBy,
                negateOrderBy,
                take,
            );

            return subQuery.as('$sub');
        });

        // aggregations
        for (const [key, value] of Object.entries(parsedArgs)) {
            switch (key) {
                case '_count': {
                    if (value === true) {
                        query = query.select((eb) => this.dialect.castInt(eb.fn.countAll()).as('_count'));
                    } else {
                        Object.entries(value).forEach(([field, val]) => {
                            if (val === true || (val && typeof val === 'object' && 'args' in val)) {
                                if (field === '_all') {
                                    query = query.select((eb) =>
                                        this.dialect.castInt(eb.fn.countAll()).as(`_count._all`),
                                    );
                                } else {
                                    query = query.select((eb) =>
                                        this.dialect
                                            .castInt(eb.fn.count(eb.ref(`$sub.${field}`)))
                                            .as(`${key}.${field}`),
                                    );
                                }
                            }
                        });
                    }
                    break;
                }

                case '_sum':
                case '_avg':
                case '_max':
                case '_min': {
                    Object.entries(value).forEach(([field, val]) => {
                        if (val === true || (val && typeof val === 'object' && 'args' in val)) {
                            query = query.select((eb) => {
                                const fn = match(key)
                                    .with('_sum', () => eb.fn.sum)
                                    .with('_avg', () => eb.fn.avg)
                                    .with('_max', () => eb.fn.max)
                                    .with('_min', () => eb.fn.min)
                                    .exhaustive();
                                return fn(eb.ref(`$sub.${field}`)).as(`${key}.${field}`);
                            });
                        }
                    });
                    break;
                }
            }
        }

        const result = await this.executeQuery(this.kysely, query, 'aggregate');
        const ret: any = {};

        // postprocess result to convert flat fields into nested objects
        for (const [key, value] of Object.entries(result.rows[0] as object)) {
            if (key === '_count') {
                ret[key] = value;
                continue;
            }
            const parts = key.split('.');
            if (parts.length < 2) {
                continue;
            }

            const op = parts[0]!;
            const field = [...parts.slice(1)].join('.');

            let val: any = value;
            if (typeof value === 'string') {
                const fieldDef = getField(this.schema, this.model, field);
                if (fieldDef) {
                    const type = fieldDef.type;
                    if (op === '_avg') {
                        val = parseFloat(val);
                    } else {
                        if (op === '_sum' || op === '_min' || op === '_max') {
                            val = match(type)
                                .with('Int', () => parseInt(value, 10))
                                .with('BigInt', () => BigInt(value))
                                .with('Float', () => parseFloat(value))
                                .with('Decimal', () => parseFloat(value))
                                .otherwise(() => value);
                        }
                    }
                }
            }

            ret[op] = {
                ...ret[op],
                [field]: val,
            };
        }

        return ret;
    }
}
