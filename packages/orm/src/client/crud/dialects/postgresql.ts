import { invariant } from '@zenstackhq/common-helpers';
import Decimal from 'decimal.js';
import {
    expressionBuilder,
    sql,
    type AliasableExpression,
    type Expression,
    type SelectQueryBuilder,
    type SqlBool,
} from 'kysely';
import { parse as parsePostgresArray } from 'postgres-array';
import { match } from 'ts-pattern';
import { AnyNullClass, DbNullClass, JsonNullClass } from '../../../common-types';
import type { BuiltinType, FieldDef, SchemaDef } from '../../../schema';
import type { SortOrder } from '../../crud-types';
import { createInvalidInputError } from '../../errors';
import type { ClientOptions } from '../../options';
import { isEnum, isTypeDef } from '../../query-utils';
import { LateralJoinDialectBase } from './lateral-join-dialect-base';

export class PostgresCrudDialect<Schema extends SchemaDef> extends LateralJoinDialectBase<Schema> {
    private static typeParserOverrideApplied = false;

    constructor(schema: Schema, options: ClientOptions<Schema>) {
        super(schema, options);
        this.overrideTypeParsers();
    }

    override get provider() {
        return 'postgresql' as const;
    }

    private overrideTypeParsers() {
        if (this.options.fixPostgresTimezone !== false && !PostgresCrudDialect.typeParserOverrideApplied) {
            PostgresCrudDialect.typeParserOverrideApplied = true;

            // override node-pg's default type parser to resolve the timezone handling issue
            // with "TIMESTAMP WITHOUT TIME ZONE" fields
            // https://github.com/brianc/node-postgres/issues/429
            import('pg')
                .then((pg) => {
                    pg.types.setTypeParser(pg.types.builtins.TIMESTAMP, (value) => {
                        if (typeof value !== 'string') {
                            return value;
                        }
                        if (!this.hasTimezoneOffset(value)) {
                            // force UTC if no offset
                            value += 'Z';
                        }
                        const result = new Date(value);
                        return isNaN(result.getTime())
                            ? value // fallback to original value if parsing fails
                            : result;
                    });
                })
                .catch(() => {
                    // ignore
                });
        }
    }

    // #region capabilities

    override get supportsUpdateWithLimit(): boolean {
        return false;
    }

    override get supportsDeleteWithLimit(): boolean {
        return false;
    }

    override get supportsDistinctOn(): boolean {
        return true;
    }

    override get supportsReturning(): boolean {
        return true;
    }

    override get supportsDefaultAsFieldValue() {
        return true;
    }

    override get supportsInsertDefaultValues(): boolean {
        return true;
    }

    override get insertIgnoreMethod() {
        return 'onConflict' as const;
    }

    // #endregion

    // #region value transformation

    override transformInput(value: unknown, type: BuiltinType, forArrayField: boolean): unknown {
        if (value === undefined) {
            return value;
        }

        // Handle special null classes for JSON fields
        if (value instanceof JsonNullClass) {
            return 'null';
        } else if (value instanceof DbNullClass) {
            return null;
        } else if (value instanceof AnyNullClass) {
            invariant(false, 'should not reach here: AnyNull is not a valid input value');
        }

        // node-pg incorrectly handles array values passed to non-array JSON fields,
        // the workaround is to JSON stringify the value
        // https://github.com/brianc/node-postgres/issues/374

        if (isTypeDef(this.schema, type)) {
            // type-def fields (regardless array or scalar) are stored as scalar `Json` and
            // their input values need to be stringified if not already (i.e., provided in
            // default values)
            if (typeof value !== 'string') {
                return JSON.stringify(value);
            } else {
                return value;
            }
        } else if (Array.isArray(value)) {
            if (type === 'Json' && !forArrayField) {
                // scalar `Json` fields need their input stringified
                return JSON.stringify(value);
            } else {
                return value.map((v) => this.transformInput(v, type, false));
            }
        } else {
            return match(type)
                .with('DateTime', () =>
                    value instanceof Date
                        ? value.toISOString()
                        : typeof value === 'string'
                          ? new Date(value).toISOString()
                          : value,
                )
                .with('Decimal', () => (value !== null ? value.toString() : value))
                .with('Json', () => {
                    if (
                        value === null ||
                        typeof value === 'string' ||
                        typeof value === 'number' ||
                        typeof value === 'boolean'
                    ) {
                        // postgres requires simple JSON values to be stringified
                        return JSON.stringify(value);
                    } else {
                        return value;
                    }
                })
                .otherwise(() => value);
        }
    }

    override transformOutput(value: unknown, type: BuiltinType, array: boolean) {
        if (value === null || value === undefined) {
            return value;
        }
        return match(type)
            .with('DateTime', () => this.transformOutputDate(value))
            .with('Bytes', () => this.transformOutputBytes(value))
            .with('BigInt', () => this.transformOutputBigInt(value))
            .with('Decimal', () => this.transformDecimal(value))
            .when(
                (type) => isEnum(this.schema, type),
                () => this.transformOutputEnum(value, array),
            )
            .otherwise(() => super.transformOutput(value, type, array));
    }

    private transformOutputBigInt(value: unknown) {
        if (typeof value === 'bigint') {
            return value;
        }
        invariant(
            typeof value === 'string' || typeof value === 'number',
            `Expected string or number, got ${typeof value}`,
        );
        return BigInt(value);
    }

    private transformDecimal(value: unknown) {
        if (value instanceof Decimal) {
            return value;
        }
        invariant(
            typeof value === 'string' || typeof value === 'number' || value instanceof Decimal,
            `Expected string, number or Decimal, got ${typeof value}`,
        );
        return new Decimal(value);
    }

    private transformOutputDate(value: unknown) {
        if (typeof value === 'string') {
            // PostgreSQL's jsonb_build_object serializes timestamp as ISO 8601 strings,
            // we force interpret them as UTC dates here if the value does not carry timezone
            // offset (this happens with "TIMESTAMP WITHOUT TIME ZONE" field type)
            const normalized = this.hasTimezoneOffset(value) ? value : `${value}Z`;
            const parsed = new Date(normalized);
            return Number.isNaN(parsed.getTime())
                ? value // fallback to original value if parsing fails
                : parsed;
        } else {
            return value;
        }
    }

    private hasTimezoneOffset(value: string) {
        return value.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(value);
    }

    private transformOutputBytes(value: unknown) {
        return Buffer.isBuffer(value)
            ? Uint8Array.from(value)
            : // node-pg encode bytea as hex string prefixed with \x when embedded in JSON
              typeof value === 'string' && value.startsWith('\\x')
              ? Uint8Array.from(Buffer.from(value.slice(2), 'hex'))
              : value;
    }

    private transformOutputEnum(value: unknown, array: boolean) {
        if (array && typeof value === 'string') {
            try {
                // postgres returns enum arrays as `{"val 1",val2}` strings, parse them back
                // to string arrays here
                return parsePostgresArray(value);
            } catch {
                // fall through - return as-is if parsing fails
            }
        }
        return value;
    }

    // #endregion

    // #region other overrides

    protected buildArrayAgg(arg: Expression<any>) {
        return this.eb.fn.coalesce(sql`jsonb_agg(${arg})`, sql`'[]'::jsonb`);
    }

    override buildSkipTake(
        query: SelectQueryBuilder<any, any, any>,
        skip: number | undefined,
        take: number | undefined,
    ) {
        if (take !== undefined) {
            query = query.limit(take);
        }
        if (skip !== undefined) {
            query = query.offset(skip);
        }
        return query;
    }

    override buildJsonObject(value: Record<string, Expression<unknown>>) {
        return this.eb.fn(
            'jsonb_build_object',
            Object.entries(value).flatMap(([key, value]) => [sql.lit(key), value]),
        );
    }

    override castInt<T extends Expression<any>>(expression: T): T {
        return this.eb.cast(expression, 'integer') as unknown as T;
    }

    override castText<T extends Expression<any>>(expression: T): T {
        return this.eb.cast(expression, 'text') as unknown as T;
    }

    override trimTextQuotes<T extends Expression<string>>(expression: T): T {
        return this.eb.fn('trim', [expression, sql.lit('"')]) as unknown as T;
    }

    override buildArrayLength(array: Expression<unknown>): AliasableExpression<number> {
        return this.eb.fn('array_length', [array]);
    }

    override buildArrayValue(values: Expression<unknown>[], elemType: string): AliasableExpression<unknown> {
        const arr = sql`ARRAY[${sql.join(values, sql.raw(','))}]`;
        const mappedType = this.getSqlType(elemType);
        if (mappedType) {
            return this.eb.cast(arr, sql`${sql.raw(mappedType)}[]`);
        } else {
            return arr;
        }
    }

    override buildArrayContains(
        field: Expression<unknown>,
        value: Expression<unknown>,
        elemType?: string,
    ): AliasableExpression<SqlBool> {
        // PostgreSQL @> operator expects array on both sides, so wrap single value in a typed array
        const arrayExpr = sql`ARRAY[${value}]`;
        if (elemType) {
            const mappedType = this.getSqlType(elemType);
            const typedArray = mappedType ? this.eb.cast(arrayExpr, sql`${sql.raw(mappedType)}[]`) : arrayExpr;
            return this.eb(field, '@>', typedArray);
        } else {
            return this.eb(field, '@>', arrayExpr);
        }
    }

    override buildArrayHasEvery(field: Expression<unknown>, values: Expression<unknown>): AliasableExpression<SqlBool> {
        // PostgreSQL @> operator: field contains all elements in values
        return this.eb(field, '@>', values);
    }

    override buildArrayHasSome(field: Expression<unknown>, values: Expression<unknown>): AliasableExpression<SqlBool> {
        // PostgreSQL && operator: arrays have any elements in common
        return this.eb(field, '&&', values);
    }

    protected override buildJsonPathSelection(receiver: Expression<any>, path: string | undefined) {
        if (path) {
            return this.eb.fn('jsonb_path_query_first', [receiver, this.eb.val(path)]);
        } else {
            return receiver;
        }
    }

    protected override buildJsonArrayFilter(
        lhs: Expression<any>,
        operation: 'array_contains' | 'array_starts_with' | 'array_ends_with',
        value: unknown,
    ) {
        return match(operation)
            .with('array_contains', () => {
                const v = Array.isArray(value) ? value : [value];
                return sql<SqlBool>`${lhs} @> ${sql.val(JSON.stringify(v))}::jsonb`;
            })
            .with('array_starts_with', () =>
                this.eb(
                    this.eb.fn('jsonb_extract_path', [lhs, this.eb.val('0')]),
                    '=',
                    this.transformInput(value, 'Json', false),
                ),
            )
            .with('array_ends_with', () =>
                this.eb(
                    this.eb.fn('jsonb_extract_path', [lhs, sql`(jsonb_array_length(${lhs}) - 1)::text`]),
                    '=',
                    this.transformInput(value, 'Json', false),
                ),
            )
            .exhaustive();
    }

    protected override buildJsonArrayExistsPredicate(
        receiver: Expression<any>,
        buildFilter: (elem: Expression<any>) => Expression<SqlBool>,
    ) {
        return this.eb.exists(
            this.eb
                .selectFrom(this.eb.fn('jsonb_array_elements', [receiver]).as('$items'))
                .select(this.eb.lit(1).as('_'))
                .where(buildFilter(this.eb.ref('$items.value'))),
        );
    }

    protected override getSqlType(zmodelType: string) {
        if (isEnum(this.schema, zmodelType)) {
            // reduce enum to text for type compatibility
            return 'text';
        } else {
            return match(zmodelType)
                .with('String', () => 'text')
                .with('Boolean', () => 'boolean')
                .with('Int', () => 'integer')
                .with('BigInt', () => 'bigint')
                .with('Float', () => 'double precision')
                .with('Decimal', () => 'decimal(65,30)')
                .with('DateTime', () => 'timestamp(3)')
                .with('Bytes', () => 'bytea')
                .with('Json', () => 'jsonb')
                .otherwise(() => undefined);
        }
    }

    override getStringCasingBehavior() {
        // Postgres `LIKE` is case-sensitive, `ILIKE` is case-insensitive
        return { supportsILike: true, likeCaseSensitive: true };
    }

    override buildValuesTableSelect(fields: FieldDef[], rows: unknown[][]) {
        if (rows.length === 0) {
            throw createInvalidInputError('At least one row is required to build values table');
        }

        // check all rows have the same length
        const rowLength = rows[0]!.length;

        if (fields.length !== rowLength) {
            throw createInvalidInputError('Number of fields must match number of columns in each row');
        }

        for (const row of rows) {
            if (row.length !== rowLength) {
                throw createInvalidInputError('All rows must have the same number of columns');
            }
        }

        const eb = expressionBuilder<any, any>();

        return eb
            .selectFrom(
                sql`(VALUES ${sql.join(
                    rows.map((row) => sql`(${sql.join(row.map((v) => sql.val(v)))})`),
                    sql.raw(', '),
                )})`.as('$values'),
            )
            .select(
                fields.map((f, i) => {
                    const mappedType = this.getSqlType(f.type);
                    if (mappedType) {
                        const castType = f.array ? sql`${sql.raw(mappedType)}[]` : sql.raw(mappedType);
                        return this.eb.cast(sql.ref(`$values.column${i + 1}`), castType).as(f.name);
                    } else {
                        return sql.ref(`$values.column${i + 1}`).as(f.name);
                    }
                }),
            );
    }

    protected override buildOrderByField(
        query: SelectQueryBuilder<any, any, any>,
        field: Expression<unknown>,
        sort: SortOrder,
        nulls: 'first' | 'last',
    ) {
        return query.orderBy(field, (ob) => {
            ob = sort === 'asc' ? ob.asc() : ob.desc();
            ob = nulls === 'first' ? ob.nullsFirst() : ob.nullsLast();
            return ob;
        });
    }

    // #endregion
}
