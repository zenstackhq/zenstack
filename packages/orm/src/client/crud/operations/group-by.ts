import type { SchemaDef } from '@zenstackhq/schema';
import { sql } from 'kysely';
import { match } from 'ts-pattern';
import { aggregate, getField } from '../../query-utils';
import { BaseOperationHandler } from './base';

export class GroupByOperationHandler<Schema extends SchemaDef> extends BaseOperationHandler<Schema> {
    async handle(_operation: 'groupBy', args: unknown | undefined) {
        // normalize args to strip `undefined` fields
        const normalizedArgs = this.normalizeArgs(args);

        // parse args
        const parsedArgs = this.inputValidator.validateGroupByArgs(this.model, normalizedArgs);

        let query = this.kysely
            .selectFrom(this.model as string)
            .where(() => this.dialect.buildFilter(this.model, this.model, parsedArgs?.where));

        // `computedArgs` is set when aggregating a parameterized computed field; the model name
        // is passed as the alias so a computed field that references `ctx.modelAlias` resolves
        // against the grouped table
        const fieldRef = (field: string, computedArgs?: unknown) =>
            this.dialect.fieldRef(this.model, field, this.model, true, computedArgs);

        // groupBy — a parameterized computed field is a `{ field, args }` entry; others are names
        const rawBys = Array.isArray(parsedArgs.by) ? parsedArgs.by : [parsedArgs.by];
        const byEntries = rawBys.map((by: any) =>
            typeof by === 'string'
                ? { field: by as string, args: undefined as unknown }
                : { field: by.field as string, args: by.args as unknown },
        );
        query = query.groupBy(
            byEntries.map((e) => {
                const fieldDef = getField(this.schema, this.model, e.field);
                // group a computed field by its SELECT output alias so GROUP BY and the projected
                // expression stay identical (re-inlining a parameterized computer binds its args as
                // separate placeholders, which Postgres treats as distinct expressions)
                // (only parameterized computed fields carry `args`, and they take the branch above)
                return fieldDef?.computed ? sql.ref(e.field) : fieldRef(e.field);
            }),
        );

        // skip & take
        const skip = parsedArgs?.skip;
        let take = parsedArgs?.take;
        let negateOrderBy = false;
        if (take !== undefined && take < 0) {
            negateOrderBy = true;
            take = -take;
        }
        query = this.dialect.buildSkipTake(query, skip, take);

        // orderBy
        query = this.dialect.buildOrderBy(query, this.model, this.model, parsedArgs.orderBy, negateOrderBy, take);

        // having
        if (parsedArgs.having) {
            query = query.having(() => this.dialect.buildFilter(this.model, this.model, parsedArgs.having));
        }

        // select all by fields
        for (const e of byEntries) {
            query = query.select(() => fieldRef(e.field, e.args).as(e.field));
        }

        // aggregations
        for (const [key, value] of Object.entries(parsedArgs)) {
            switch (key) {
                case '_count': {
                    if (value === true) {
                        query = query.select((eb) => this.dialect.castInt(eb.fn.countAll()).as('_count'));
                    } else {
                        Object.entries(value).forEach(([field, val]) => {
                            const args = val && typeof val === 'object' && 'args' in val ? (val as any).args : undefined;
                            if (val === true || args !== undefined) {
                                if (field === '_all') {
                                    query = query.select((eb) =>
                                        this.dialect.castInt(eb.fn.countAll()).as(`_count._all`),
                                    );
                                } else {
                                    query = query.select((eb) =>
                                        this.dialect.castInt(eb.fn.count(fieldRef(field, args))).as(`${key}.${field}`),
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
                        const args = val && typeof val === 'object' && 'args' in val ? (val as any).args : undefined;
                        if (val === true || args !== undefined) {
                            query = query.select((eb) => aggregate(eb, fieldRef(field, args), key).as(`${key}.${field}`));
                        }
                    });
                    break;
                }
            }
        }

        const result = await this.executeQuery(this.kysely, query, 'groupBy');
        return result.rows.map((row) => this.postProcessRow(row));
    }

    private postProcessRow(row: any) {
        const ret: any = {};

        // postprocess result to convert flat fields into nested objects
        for (const [key, value] of Object.entries(row)) {
            if (key === '_count') {
                ret[key] = value;
                continue;
            }
            const parts = key.split('.');
            if (parts.length < 2) {
                ret[key] = value;
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
