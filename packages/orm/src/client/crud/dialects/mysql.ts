import { invariant } from '@zenstackhq/common-helpers';
import type { BuiltinType, FieldDef, SchemaDef } from '@zenstackhq/schema';
import Decimal from 'decimal.js';
import type { AliasableExpression, TableExpression } from 'kysely';
import {
    expressionBuilder,
    ExpressionWrapper,
    sql,
    ValueListNode,
    type Expression,
    type SelectQueryBuilder,
    type SqlBool,
} from 'kysely';
import { AnyNullClass, DbNullClass, JsonNullClass } from '../../../common-types';
import type { NullsOrder, SortOrder } from '../../crud-types';
import { createInvalidInputError, createNotSupportedError } from '../../errors';
import type { ClientOptions } from '../../options';
import { isTypeDef } from '../../query-utils';
import type { FuzzyFilterOptions } from './base-dialect';
import { LateralJoinDialectBase } from './lateral-join-dialect-base';

export class MySqlCrudDialect<Schema extends SchemaDef> extends LateralJoinDialectBase<Schema> {
    constructor(schema: Schema, options: ClientOptions<Schema>) {
        super(schema, options);
    }

    override get provider() {
        return 'mysql' as const;
    }

    // #region capabilities

    override get supportsUpdateWithLimit(): boolean {
        return true;
    }

    override get supportsDeleteWithLimit(): boolean {
        return true;
    }

    override get supportsDistinctOn(): boolean {
        return false;
    }

    override get supportsReturning(): boolean {
        return false;
    }

    override get supportsInsertDefaultValues(): boolean {
        return false;
    }

    override get supportsDefaultAsFieldValue() {
        return true;
    }

    override get insertIgnoreMethod() {
        return 'ignore' as const;
    }

    // #endregion

    // #region value transformation

    override transformInput(value: unknown, type: BuiltinType, forArrayField: boolean): unknown {
        if (value === undefined) {
            return value;
        }

        // Handle special null classes for JSON fields
        if (value instanceof JsonNullClass) {
            return this.eb.cast(sql.lit('null'), 'json');
        } else if (value instanceof DbNullClass) {
            return null;
        } else if (value instanceof AnyNullClass) {
            invariant(false, 'should not reach here: AnyNull is not a valid input value');
        }

        if (isTypeDef(this.schema, type)) {
            // type-def fields (regardless array or scalar) are stored as scalar `Json` and
            // their input values need to be stringified if not already (i.e., provided in
            // default values)
            if (typeof value !== 'string') {
                return this.transformInput(value, 'Json', forArrayField);
            } else {
                return value;
            }
        } else if (Array.isArray(value)) {
            if (type === 'Json') {
                // type-def arrays reach here
                return JSON.stringify(value);
            } else {
                throw createNotSupportedError(`MySQL does not support array literals`);
            }
        } else {
            switch (type) {
                case 'Boolean':
                    return value ? 1 : 0;
                case 'DateTime':
                    // MySQL DATETIME format: 'YYYY-MM-DD HH:MM:SS.mmm'
                    if (value instanceof Date) {
                        // force UTC
                        return value.toISOString().replace('Z', '+00:00');
                    } else if (typeof value === 'string') {
                        // parse and force UTC
                        return new Date(value).toISOString().replace('Z', '+00:00');
                    } else {
                        return value;
                    }
                case 'Decimal':
                    return value !== null ? value.toString() : value;
                case 'Json':
                    return this.eb.cast(this.eb.val(JSON.stringify(value)), 'json');
                case 'Bytes':
                    return Buffer.isBuffer(value) ? value : value instanceof Uint8Array ? Buffer.from(value) : value;
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
            case 'Boolean':
                return this.transformOutputBoolean(value);
            case 'DateTime':
                return this.transformOutputDate(value);
            case 'Bytes':
                return this.transformOutputBytes(value);
            case 'BigInt':
                return this.transformOutputBigInt(value);
            case 'Decimal':
                return this.transformDecimal(value);
            default:
                return super.transformOutput(value, type, array);
        }
    }

    private transformOutputBoolean(value: unknown) {
        return !!value;
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
        if (typeof value !== 'string') {
            return value;
        }

        // MySQL `TIME` columns return bare time strings ("09:30:00") that `new Date`
        // can't parse on their own — anchor at the Unix epoch. Detect by shape rather
        // than the schema attribute so the runtime stays decoupled from `@db.*`
        // (which is migration/db-push only): TIME starts with `HH:`, DATE/DATETIME
        // values always start with `YYYY-`.
        const anchored = /^\d{2}:/.test(value) ? `1970-01-01T${value}` : value;

        // MySQL DateTime columns are returned as strings (non-ISO but parsable as JS Date),
        // convert to ISO Date by appending 'Z' if not present
        return new Date(!anchored.endsWith('Z') ? anchored + 'Z' : anchored);
    }

    private transformOutputBytes(value: unknown) {
        return Buffer.isBuffer(value) ? Uint8Array.from(value) : value;
    }

    // #endregion

    // #region other overrides

    protected override buildExistsExpression(innerQuery: SelectQueryBuilder<any, any, any>): Expression<SqlBool> {
        // MySQL doesn't allow referencing the target table of a DELETE/UPDATE in a subquery
        // directly within the same statement. Wrapping in a derived table materializes the
        // subquery, making it a separate virtual table that MySQL accepts.
        return this.eb.exists(this.eb.selectFrom(innerQuery.as('$exists_sub')).select(this.eb.lit(1).as('_')));
    }

    protected buildArrayAgg(
        arg: Expression<any>,
        _orderBy?: { expr: Expression<any>; sort: SortOrder; nulls?: NullsOrder }[],
    ): AliasableExpression<any> {
        // MySQL doesn't support ORDER BY inside JSON_ARRAYAGG.
        // For relation queries that need deterministic ordering, ordering is applied
        // by the input subquery before aggregation.
        return this.eb.fn.coalesce(sql`JSON_ARRAYAGG(${arg})`, sql`JSON_ARRAY()`);
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
            if (take === undefined) {
                // MySQL requires offset to be used with limit
                query = query.limit(Number.MAX_SAFE_INTEGER);
            }
        }
        return query;
    }

    override buildJsonObject(value: Record<string, Expression<unknown>>) {
        return this.eb.fn(
            'JSON_OBJECT',
            Object.entries(value).flatMap(([key, value]) => [sql.lit(key), value]),
        );
    }

    override castInt<T extends Expression<any>>(expression: T): T {
        return this.eb.cast(expression, sql.raw('unsigned')) as unknown as T;
    }

    override castText<T extends Expression<any>>(expression: T): T {
        // Use utf8mb4 character set collation to match MySQL 8.0+ default and avoid
        // collation conflicts when comparing with VALUES ROW columns
        return sql`CAST(${expression} AS CHAR CHARACTER SET utf8mb4)` as unknown as T;
    }

    override trimTextQuotes<T extends Expression<string>>(expression: T): T {
        return sql`TRIM(BOTH ${sql.lit('"')} FROM ${expression})` as unknown as T;
    }

    override buildArrayLength(array: Expression<unknown>): AliasableExpression<number> {
        return this.eb.fn('JSON_LENGTH', [array]);
    }

    override buildArrayValue(values: Expression<unknown>[], _elemType: string): AliasableExpression<unknown> {
        return new ExpressionWrapper(ValueListNode.create(values.map((v) => v.toOperationNode())));
    }

    override buildArrayContains(
        _field: Expression<unknown>,
        _value: Expression<unknown>,
        _elemType?: string,
    ): AliasableExpression<SqlBool> {
        throw createNotSupportedError('MySQL does not support native array operations');
    }

    override buildArrayHasEvery(
        _field: Expression<unknown>,
        _values: Expression<unknown>,
    ): AliasableExpression<SqlBool> {
        throw createNotSupportedError('MySQL does not support native array operations');
    }

    override buildArrayHasSome(
        _field: Expression<unknown>,
        _values: Expression<unknown>,
    ): AliasableExpression<SqlBool> {
        throw createNotSupportedError('MySQL does not support native array operations');
    }

    protected override buildJsonEqualityFilter(
        lhs: Expression<any>,
        rhs: unknown,
    ): ExpressionWrapper<any, any, SqlBool> {
        // MySQL's JSON equality comparison is key-order sensitive, use bi-directional JSON_CONTAINS
        // instead to achieve key-order insensitive comparison
        return this.eb.and([
            this.eb.fn('JSON_CONTAINS', [lhs, this.eb.val(JSON.stringify(rhs))]),
            this.eb.fn('JSON_CONTAINS', [this.eb.val(JSON.stringify(rhs)), lhs]),
        ]);
    }

    protected override buildJsonPathSelection(receiver: Expression<any>, path: string | undefined) {
        if (path) {
            return this.eb.fn('JSON_EXTRACT', [receiver, this.eb.val(path)]);
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
                return sql<SqlBool>`JSON_CONTAINS(${lhs}, ${sql.val(JSON.stringify(v))})`;
            }

            case 'array_starts_with': {
                return this.eb(
                    this.eb.fn('JSON_EXTRACT', [lhs, this.eb.val('$[0]')]),
                    '=',
                    this.transformInput(value, 'Json', false),
                );
            }

            case 'array_ends_with': {
                return this.eb(
                    sql`JSON_EXTRACT(${lhs}, CONCAT('$[', JSON_LENGTH(${lhs}) - 1, ']'))`,
                    '=',
                    this.transformInput(value, 'Json', false),
                );
            }

            default:
                throw createInvalidInputError(`Unsupported array filter operation: ${operation}`);
        }
    }

    protected override buildJsonArrayExistsPredicate(
        receiver: Expression<any>,
        buildFilter: (elem: Expression<any>) => Expression<SqlBool>,
    ) {
        // MySQL doesn't have a direct json_array_elements, we need to use JSON_TABLE or a different approach
        // For simplicity, we'll use EXISTS with a subquery that unnests the JSON array
        return this.eb.exists(
            this.eb
                .selectFrom(sql`JSON_TABLE(${receiver}, '$[*]' COLUMNS(value JSON PATH '$'))`.as('$items'))
                .select(this.eb.lit(1).as('_'))
                .where(buildFilter(this.eb.ref('$items.value'))),
        );
    }

    override getStringCasingBehavior() {
        // MySQL LIKE is case-insensitive by default (depends on collation), no ILIKE support
        return { supportsILike: false, likeCaseSensitive: false };
    }

    override buildValuesTableSelect(fields: FieldDef[], rows: unknown[][]) {
        const cols = rows[0]?.length ?? 0;

        if (fields.length !== cols) {
            throw createInvalidInputError('Number of fields must match number of columns in each row');
        }

        // check all rows have the same length
        for (const row of rows) {
            if (row.length !== cols) {
                throw createInvalidInputError('All rows must have the same number of columns');
            }
        }

        // build final alias name as `$values(f1, f2, ...)`
        const aliasWithColumns = `$values(${fields.map((f) => f.name).join(', ')})`;

        const eb = expressionBuilder<any, any>();

        return eb
            .selectFrom(
                sql`(VALUES ${sql.join(
                    rows.map((row) => sql`ROW(${sql.join(row.map((v) => sql.val(v)))})`),
                    sql.raw(', '),
                )}) as ${sql.raw(aliasWithColumns)}` as unknown as TableExpression<any, any>,
            )
            .selectAll();
    }

    protected override buildOrderByField(
        query: SelectQueryBuilder<any, any, any>,
        field: Expression<unknown>,
        sort: SortOrder,
        nulls: 'first' | 'last',
    ) {
        let result = query;
        if (nulls === 'first') {
            // NULLS FIRST: order by IS NULL DESC (nulls=1 first), then the actual field
            result = result.orderBy(sql`${field} IS NULL`, 'desc');
            result = result.orderBy(field, sort);
        } else {
            // NULLS LAST: order by IS NULL ASC (nulls=0 last), then the actual field
            result = result.orderBy(sql`${field} IS NULL`, 'asc');
            result = result.orderBy(field, sort);
        }
        return result;
    }

    // #endregion

    // #region fuzzy search

    override buildFuzzyFilter(_fieldRef: Expression<any>, _options: FuzzyFilterOptions): Expression<SqlBool> {
        throw createNotSupportedError('"fuzzy" filter is not supported by the "mysql" provider');
    }

    override buildFuzzyRelevanceOrderBy(
        _query: SelectQueryBuilder<any, any, any>,
        _fieldRefs: Expression<any>[],
        _search: string,
        _sort: SortOrder,
    ): SelectQueryBuilder<any, any, any> {
        throw createNotSupportedError('"_fuzzyRelevance" ordering is not supported by the "mysql" provider');
    }

    // #endregion
}
