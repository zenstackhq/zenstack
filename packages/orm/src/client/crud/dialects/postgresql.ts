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
import { AnyNullClass, DbNullClass, JsonNullClass } from '../../../common-types';
import type { BuiltinType, FieldDef, SchemaDef } from '../../../schema';
import type { NullsOrder, SortOrder } from '../../crud-types';
import { createInvalidInputError } from '../../errors';
import type { ClientOptions } from '../../options';
import { isEnum, isTypeDef } from '../../query-utils';
import { LateralJoinDialectBase } from './lateral-join-dialect-base';

export class PostgresCrudDialect<Schema extends SchemaDef> extends LateralJoinDialectBase<Schema> {
    private static typeParserOverrideApplied = false;

    private readonly zmodelToSqlTypeMap: Record<string, string> = {
        String: 'text',
        Boolean: 'boolean',
        Int: 'integer',
        BigInt: 'bigint',
        Float: 'double precision',
        Decimal: 'decimal',
        DateTime: 'timestamp',
        Bytes: 'bytea',
        Json: 'jsonb',
    };

    // Maps @db.* attribute names to PostgreSQL SQL types for use in VALUES table casts
    private static readonly dbAttributeToSqlTypeMap: Record<string, string> = {
        '@db.Uuid': 'uuid',
        '@db.Citext': 'citext',
        '@db.Inet': 'inet',
        '@db.Bit': 'bit',
        '@db.VarBit': 'varbit',
        '@db.Xml': 'xml',
        '@db.Json': 'json',
        '@db.JsonB': 'jsonb',
        '@db.ByteA': 'bytea',
        '@db.Text': 'text',
        '@db.Char': 'bpchar',
        '@db.VarChar': 'varchar',
        '@db.Date': 'date',
        '@db.Time': 'time',
        '@db.Timetz': 'timetz',
        '@db.Timestamp': 'timestamp',
        '@db.Timestamptz': 'timestamptz',
        '@db.SmallInt': 'smallint',
        '@db.Integer': 'integer',
        '@db.BigInt': 'bigint',
        '@db.Real': 'real',
        '@db.DoublePrecision': 'double precision',
        '@db.Decimal': 'decimal',
        '@db.Boolean': 'boolean',
    };

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

            const fixTimezone = (value: unknown) => {
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
            };

            // override node-pg's default type parser to resolve the timezone handling issue
            // with "TIMESTAMP WITHOUT TIME ZONE" fields
            // https://github.com/brianc/node-postgres/issues/429
            import(/* webpackIgnore: true */ 'pg') // suppress bundler analysis warnings
                .then((pg) => {
                    // timestamp
                    pg.types.setTypeParser(pg.types.builtins.TIMESTAMP, fixTimezone);
                    pg.types.setTypeParser(1115, (value) => {
                        // timestamp array
                        if (typeof value !== 'string') {
                            return value;
                        }
                        try {
                            const arr = parsePostgresArray(value);
                            return arr.map(fixTimezone);
                        } catch {
                            // fallback to original value if parsing fails
                            return value;
                        }
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
            switch (type) {
                case 'DateTime':
                    return value instanceof Date
                        ? value.toISOString()
                        : typeof value === 'string'
                          ? new Date(value).toISOString()
                          : value;
                case 'Decimal':
                    return value !== null ? value.toString() : value;
                case 'Json':
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
                default:
                    return value;
            }
        }
    }

    override transformOutput(value: unknown, type: BuiltinType, array: boolean) {
        if (value === null || value === undefined) {
            return value;
        }

        switch (type) {
            case 'DateTime':
                return this.transformOutputDate(value);
            case 'Bytes':
                return this.transformOutputBytes(value);
            case 'BigInt':
                return this.transformOutputBigInt(value);
            case 'Decimal':
                return this.transformDecimal(value);
            default:
                if (isEnum(this.schema, type)) {
                    return this.transformOutputEnum(value, array);
                } else {
                    return super.transformOutput(value, type, array);
                }
        }
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

    protected buildArrayAgg(
        arg: Expression<any>,
        orderBy?: { expr: Expression<any>; sort: SortOrder; nulls?: NullsOrder }[],
    ) {
        if (!orderBy || orderBy.length === 0) {
            return this.eb.fn.coalesce(sql`jsonb_agg(${arg})`, sql`'[]'::jsonb`);
        }

        const orderBySql = sql.join(
            orderBy.map(({ expr, sort, nulls }) => {
                const dir = sql.raw(sort.toUpperCase());
                const nullsSql = nulls ? sql` NULLS ${sql.raw(nulls.toUpperCase())}` : sql``;
                return sql`${expr} ${dir}${nullsSql}`;
            }),
            sql.raw(', '),
        );

        return this.eb.fn.coalesce(sql`jsonb_agg(${arg} ORDER BY ${orderBySql})`, sql`'[]'::jsonb`);
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
        const entries = Object.entries(value);

        // PostgreSQL's FUNC_MAX_ARGS limit is 100. jsonb_build_object takes key-value pairs,
        // so at most 50 pairs (100 args) fit in one call. Split larger objects and merge with ||.
        const MAX_PAIRS = 50;

        const buildChunk = (chunk: [string, Expression<unknown>][]) =>
            this.eb.fn('jsonb_build_object', chunk.flatMap(([k, v]) => [sql.lit(k), v]));

        if (entries.length <= MAX_PAIRS) {
            return buildChunk(entries);
        }

        const chunks: Expression<unknown>[] = [];
        for (let i = 0; i < entries.length; i += MAX_PAIRS) {
            chunks.push(buildChunk(entries.slice(i, i + MAX_PAIRS)));
        }

        return chunks.reduce((acc, chunk) => sql`${acc} || ${chunk}`) as AliasableExpression<unknown>;
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
        return this.eb.cast(arr, sql`${sql.raw(mappedType)}[]`);
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
            const typedArray = this.eb.cast(arrayExpr, sql`${sql.raw(mappedType)}[]`);
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
        switch (operation) {
            case 'array_contains': {
                const v = Array.isArray(value) ? value : [value];
                return sql<SqlBool>`${lhs} @> ${sql.val(JSON.stringify(v))}::jsonb`;
            }
            case 'array_starts_with':
                return this.eb(
                    this.eb.fn('jsonb_extract_path', [lhs, this.eb.val('0')]),
                    '=',
                    this.transformInput(value, 'Json', false),
                );
            case 'array_ends_with':
                return this.eb(
                    this.eb.fn('jsonb_extract_path', [lhs, sql`(jsonb_array_length(${lhs}) - 1)::text`]),
                    '=',
                    this.transformInput(value, 'Json', false),
                );
        }
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

    private getSqlType(zmodelType: string, attributes?: FieldDef['attributes']) {
        // Check @db.* attributes first — they specify the exact native PostgreSQL type
        if (attributes) {
            for (const attr of attributes) {
                const mapped = PostgresCrudDialect.dbAttributeToSqlTypeMap[attr.name];
                if (mapped) {
                    return mapped;
                }
            }
        }
        if (isEnum(this.schema, zmodelType)) {
            // reduce enum to text for type compatibility
            return 'text';
        } else {
            return this.zmodelToSqlTypeMap[zmodelType] ?? 'text';
        }
    }

    // Resolves the effective SQL type for a field: the native type from any @db.* attribute,
    // or the base ZModel SQL type if no attribute is present, or undefined if the field is unknown.
    private resolveFieldSqlType(fieldDef: FieldDef | undefined): { sqlType: string | undefined; hasDbOverride: boolean } {
        if (!fieldDef) {
            return { sqlType: undefined, hasDbOverride: false };
        }
        const dbAttr = fieldDef.attributes?.find((a) => a.name.startsWith('@db.'));
        if (dbAttr) {
            return { sqlType: PostgresCrudDialect.dbAttributeToSqlTypeMap[dbAttr.name], hasDbOverride: true };
        }
        return { sqlType: this.getSqlType(fieldDef.type), hasDbOverride: false };
    }

    override buildComparison(
        left: Expression<unknown>,
        leftFieldDef: FieldDef | undefined,
        op: string,
        right: Expression<unknown>,
        rightFieldDef: FieldDef | undefined,
    ) {
        const leftResolved = this.resolveFieldSqlType(leftFieldDef);
        const rightResolved = this.resolveFieldSqlType(rightFieldDef);
        // If the resolved SQL types differ and at least one side carries a @db.* native type override,
        // cast that side back to its base ZModel SQL type so PostgreSQL doesn't reject the comparison
        // (e.g. "operator does not exist: uuid = text").
        if (leftResolved.sqlType !== rightResolved.sqlType && (leftResolved.hasDbOverride || rightResolved.hasDbOverride)) {
            if (leftResolved.hasDbOverride) {
                left = this.eb.cast(left, sql.raw(this.getSqlType(leftFieldDef!.type)));
            }
            if (rightResolved.hasDbOverride) {
                right = this.eb.cast(right, sql.raw(this.getSqlType(rightFieldDef!.type)));
            }
        }
        return super.buildComparison(left, leftFieldDef, op, right, rightFieldDef);
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
                    const mappedType = this.getSqlType(f.type, f.attributes);
                    const castType = f.array ? sql`${sql.raw(mappedType)}[]` : sql.raw(mappedType);
                    return this.eb.cast(sql.ref(`$values.column${i + 1}`), castType).as(f.name);
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
