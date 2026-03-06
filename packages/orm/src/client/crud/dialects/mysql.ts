import { invariant } from '@zenstackhq/common-helpers';
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
import { match } from 'ts-pattern';
import { AnyNullClass, DbNullClass, JsonNullClass } from '../../../common-types';
import type { BuiltinType, FieldDef, SchemaDef } from '../../../schema';
import type { SortOrder } from '../../crud-types';
import { createInvalidInputError, createNotSupportedError } from '../../errors';
import type { ClientOptions } from '../../options';
import { isTypeDef } from '../../query-utils';
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
            return match(type)
                .with('Boolean', () => (value ? 1 : 0)) // MySQL uses 1/0 for boolean like SQLite
                .with('DateTime', () => {
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
                })
                .with('Decimal', () => (value !== null ? value.toString() : value))
                .with('Json', () => {
                    return this.eb.cast(this.eb.val(JSON.stringify(value)), 'json');
                })
                .with('Bytes', () =>
                    Buffer.isBuffer(value) ? value : value instanceof Uint8Array ? Buffer.from(value) : value,
                )
                .otherwise(() => value);
        }
    }

    override transformOutput(value: unknown, type: BuiltinType, array: boolean) {
        if (value === null || value === undefined) {
            return value;
        }
        return match(type)
            .with('Boolean', () => this.transformOutputBoolean(value))
            .with('DateTime', () => this.transformOutputDate(value))
            .with('Bytes', () => this.transformOutputBytes(value))
            .with('BigInt', () => this.transformOutputBigInt(value))
            .with('Decimal', () => this.transformDecimal(value))
            .otherwise(() => super.transformOutput(value, type, array));
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
        if (typeof value === 'string') {
            // MySQL DateTime columns are returned as strings (non-ISO but parsable as JS Date),
            // convert to ISO Date by appending 'Z' if not present
            return new Date(!value.endsWith('Z') ? value + 'Z' : value);
        } else if (value instanceof Date) {
            return value;
        } else {
            return value;
        }
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

    protected buildArrayAgg(arg: Expression<any>): AliasableExpression<any> {
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
        return match(operation)
            .with('array_contains', () => {
                const v = Array.isArray(value) ? value : [value];
                return sql<SqlBool>`JSON_CONTAINS(${lhs}, ${sql.val(JSON.stringify(v))})`;
            })
            .with('array_starts_with', () =>
                this.eb(
                    this.eb.fn('JSON_EXTRACT', [lhs, this.eb.val('$[0]')]),
                    '=',
                    this.transformInput(value, 'Json', false),
                ),
            )
            .with('array_ends_with', () =>
                this.eb(
                    sql`JSON_EXTRACT(${lhs}, CONCAT('$[', JSON_LENGTH(${lhs}) - 1, ']'))`,
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
}
