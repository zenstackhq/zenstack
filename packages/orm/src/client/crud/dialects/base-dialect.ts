import { enumerate, invariant, isPlainObject } from '@zenstackhq/common-helpers';
import type { AliasableExpression, Expression, ExpressionBuilder, ExpressionWrapper, SqlBool, ValueNode } from 'kysely';
import { expressionBuilder, sql, type SelectQueryBuilder } from 'kysely';
import { match, P } from 'ts-pattern';
import { AnyNullClass, DbNullClass, JsonNullClass } from '../../../common-types';
import type { BuiltinType, DataSourceProviderType, FieldDef, GetModels, ModelDef, SchemaDef } from '../../../schema';
import type { OrArray } from '../../../utils/type-utils';
import { AggregateOperators, DELEGATE_JOINED_FIELD_PREFIX, LOGICAL_COMBINATORS } from '../../constants';
import type {
    BooleanFilter,
    BytesFilter,
    DateTimeFilter,
    FindArgs,
    OrderBy,
    SortOrder,
    StringFilter,
} from '../../crud-types';
import { createConfigError, createInvalidInputError, createNotSupportedError } from '../../errors';
import type { ClientOptions } from '../../options';
import {
    aggregate,
    buildJoinPairs,
    ensureArray,
    flattenCompoundUniqueFilters,
    getDelegateDescendantModels,
    getManyToManyRelation,
    getRelationForeignKeyFieldPairs,
    isEnum,
    isInheritedField,
    isRelationField,
    isTypeDef,
    makeDefaultOrderBy,
    requireField,
    requireIdFields,
    requireModel,
    requireTypeDef,
} from '../../query-utils';

export abstract class BaseCrudDialect<Schema extends SchemaDef> {
    protected eb = expressionBuilder<any, any>();

    constructor(
        protected readonly schema: Schema,
        protected readonly options: ClientOptions<Schema>,
    ) {}

    // #region capability flags

    /**
     * Whether the dialect supports updating with a limit on the number of updated rows.
     */
    abstract get supportsUpdateWithLimit(): boolean;

    /**
     * Whether the dialect supports deleting with a limit on the number of deleted rows.
     */
    abstract get supportsDeleteWithLimit(): boolean;

    /**
     * Whether the dialect supports DISTINCT ON.
     */
    abstract get supportsDistinctOn(): boolean;

    /**
     * Whether the dialect support inserting with `DEFAULT` as field value.
     */
    abstract get supportsDefaultAsFieldValue(): boolean;

    /**
     * Whether the dialect supports the RETURNING clause in INSERT/UPDATE/DELETE statements.
     */
    abstract get supportsReturning(): boolean;

    /**
     * Whether the dialect supports `INSERT INTO ... DEFAULT VALUES` syntax.
     */
    abstract get supportsInsertDefaultValues(): boolean;

    /**
     * How to perform insert ignore operation.
     */
    abstract get insertIgnoreMethod(): 'onConflict' | 'ignore';

    // #endregion

    // #region value transformation

    /**
     * Transforms input value before sending to database.
     */
    transformInput(value: unknown, _type: BuiltinType, _forArrayField: boolean) {
        return value;
    }

    /**
     * Transforms output value received from database.
     */
    transformOutput(value: unknown, _type: BuiltinType, _array: boolean) {
        return value;
    }

    // #endregion

    // #region common query builders

    buildSelectModel(model: string, modelAlias: string) {
        const modelDef = requireModel(this.schema, model);
        let result = this.eb.selectFrom(model === modelAlias ? model : `${model} as ${modelAlias}`);
        // join all delegate bases
        let joinBase = modelDef.baseModel;
        while (joinBase) {
            result = this.buildDelegateJoin(model, modelAlias, joinBase, result);
            joinBase = requireModel(this.schema, joinBase).baseModel;
        }
        return result;
    }

    buildFilterSortTake(
        model: string,
        args: FindArgs<Schema, GetModels<Schema>, any, true>,
        query: SelectQueryBuilder<any, any, {}>,
        modelAlias: string,
    ) {
        let result = query;

        // where
        if (args.where) {
            result = result.where(() => this.buildFilter(model, modelAlias, args?.where));
        }

        // skip && take
        let negateOrderBy = false;
        const skip = args.skip;
        let take = args.take;
        if (take !== undefined && take < 0) {
            negateOrderBy = true;
            take = -take;
        }
        result = this.buildSkipTake(result, skip, take);

        // orderBy
        result = this.buildOrderBy(result, model, modelAlias, args.orderBy, negateOrderBy, take);

        // distinct
        if ('distinct' in args && (args as any).distinct) {
            const distinct = ensureArray((args as any).distinct) as string[];
            if (this.supportsDistinctOn) {
                result = result.distinctOn(distinct.map((f) => this.eb.ref(`${modelAlias}.${f}`)));
            } else {
                throw createNotSupportedError(`"distinct" is not supported by "${this.schema.provider.type}" provider`);
            }
        }

        if (args.cursor) {
            result = this.buildCursorFilter(model, result, args.cursor, args.orderBy, negateOrderBy, modelAlias);
        }
        return result;
    }

    buildFilter(model: string, modelAlias: string, where: boolean | object | undefined) {
        if (where === true || where === undefined) {
            return this.true();
        }

        if (where === false) {
            return this.false();
        }

        let result = this.true();
        const _where = flattenCompoundUniqueFilters(this.schema, model, where);

        for (const [key, payload] of Object.entries(_where)) {
            if (payload === undefined) {
                continue;
            }

            if (key.startsWith('$')) {
                continue;
            }

            if (this.isLogicalCombinator(key)) {
                result = this.and(result, this.buildCompositeFilter(model, modelAlias, key, payload));
                continue;
            }

            const fieldDef = requireField(this.schema, model, key);

            if (fieldDef.relation) {
                result = this.and(result, this.buildRelationFilter(model, modelAlias, key, fieldDef, payload));
            } else {
                // if the field is from a base model, build a reference from that model
                const fieldRef = this.fieldRef(fieldDef.originModel ?? model, key, fieldDef.originModel ?? modelAlias);
                if (fieldDef.array) {
                    result = this.and(result, this.buildArrayFilter(fieldRef, fieldDef, payload));
                } else {
                    result = this.and(result, this.buildPrimitiveFilter(fieldRef, fieldDef, payload));
                }
            }
        }

        // call expression builder and combine the results
        if ('$expr' in _where && typeof _where['$expr'] === 'function') {
            result = this.and(result, _where['$expr'](this.eb));
        }

        return result;
    }

    private buildCursorFilter(
        model: string,
        query: SelectQueryBuilder<any, any, any>,
        cursor: object,
        orderBy: OrArray<Record<string, SortOrder>> | undefined,
        negateOrderBy: boolean,
        modelAlias: string,
    ) {
        const _orderBy = orderBy ?? makeDefaultOrderBy(this.schema, model);

        const orderByItems = ensureArray(_orderBy).flatMap((obj) => Object.entries<SortOrder>(obj));

        const subQueryAlias = `${model}$cursor$sub`;
        const cursorFilter = this.buildFilter(model, subQueryAlias, cursor);

        let result = query;
        const filters: ExpressionWrapper<any, any, any>[] = [];

        for (let i = orderByItems.length - 1; i >= 0; i--) {
            const andFilters: ExpressionWrapper<any, any, any>[] = [];

            for (let j = 0; j <= i; j++) {
                const [field, order] = orderByItems[j]!;
                const _order = negateOrderBy ? (order === 'asc' ? 'desc' : 'asc') : order;
                const op = j === i ? (_order === 'asc' ? '>=' : '<=') : '=';
                andFilters.push(
                    this.eb(
                        this.eb.ref(`${modelAlias}.${field}`),
                        op,
                        this.buildSelectModel(model, subQueryAlias)
                            .select(`${subQueryAlias}.${field}`)
                            .where(cursorFilter),
                    ),
                );
            }

            filters.push(this.eb.and(andFilters));
        }

        result = result.where((eb) => eb.or(filters));

        return result;
    }

    private isLogicalCombinator(key: string): key is (typeof LOGICAL_COMBINATORS)[number] {
        return LOGICAL_COMBINATORS.includes(key as any);
    }

    protected buildCompositeFilter(
        model: string,
        modelAlias: string,
        key: (typeof LOGICAL_COMBINATORS)[number],
        payload: any,
    ): Expression<SqlBool> {
        return match(key)
            .with('AND', () =>
                this.and(...enumerate(payload).map((subPayload) => this.buildFilter(model, modelAlias, subPayload))),
            )
            .with('OR', () =>
                this.or(...enumerate(payload).map((subPayload) => this.buildFilter(model, modelAlias, subPayload))),
            )
            .with('NOT', () => this.eb.not(this.buildCompositeFilter(model, modelAlias, 'AND', payload)))
            .exhaustive();
    }

    private buildRelationFilter(model: string, modelAlias: string, field: string, fieldDef: FieldDef, payload: any) {
        if (!fieldDef.array) {
            return this.buildToOneRelationFilter(model, modelAlias, field, fieldDef, payload);
        } else {
            return this.buildToManyRelationFilter(model, modelAlias, field, fieldDef, payload);
        }
    }

    private buildToOneRelationFilter(
        model: string,
        modelAlias: string,
        field: string,
        fieldDef: FieldDef,
        payload: any,
    ): Expression<SqlBool> {
        if (payload === null) {
            const { ownedByModel, keyPairs } = getRelationForeignKeyFieldPairs(this.schema, model, field);

            if (ownedByModel && !fieldDef.originModel) {
                // can be short-circuited to FK null check
                return this.and(...keyPairs.map(({ fk }) => this.eb(this.eb.ref(`${modelAlias}.${fk}`), 'is', null)));
            } else {
                // translate it to `{ is: null }` filter
                return this.buildToOneRelationFilter(model, modelAlias, field, fieldDef, { is: null });
            }
        }

        const joinAlias = `${modelAlias}$${field}`;
        const joinPairs = buildJoinPairs(
            this.schema,
            model,
            // if field is from a base, use the base model to join
            fieldDef.originModel ?? modelAlias,
            field,
            joinAlias,
        );
        const filterResultField = `${field}$filter`;

        const joinSelect = this.eb
            .selectFrom(`${fieldDef.type} as ${joinAlias}`)
            .where(() =>
                this.and(...joinPairs.map(([left, right]) => this.eb(this.eb.ref(left), '=', this.eb.ref(right)))),
            )
            .select(() => this.eb.fn.count(this.eb.lit(1)).as(filterResultField));

        const conditions: Expression<SqlBool>[] = [];

        if ('is' in payload || 'isNot' in payload) {
            if ('is' in payload) {
                if (payload.is === null) {
                    // check if not found
                    conditions.push(this.eb(joinSelect, '=', 0));
                } else {
                    // check if found
                    conditions.push(
                        this.eb(
                            joinSelect.where(() => this.buildFilter(fieldDef.type, joinAlias, payload.is)),
                            '>',
                            0,
                        ),
                    );
                }
            }

            if ('isNot' in payload) {
                if (payload.isNot === null) {
                    // check if found
                    conditions.push(this.eb(joinSelect, '>', 0));
                } else {
                    conditions.push(
                        this.or(
                            // is null
                            this.eb(joinSelect, '=', 0),
                            // found one that matches the filter
                            this.eb(
                                joinSelect.where(() => this.buildFilter(fieldDef.type, joinAlias, payload.isNot)),
                                '=',
                                0,
                            ),
                        ),
                    );
                }
            }
        } else {
            conditions.push(
                this.eb(
                    joinSelect.where(() => this.buildFilter(fieldDef.type, joinAlias, payload)),
                    '>',
                    0,
                ),
            );
        }

        return this.and(...conditions);
    }

    private buildToManyRelationFilter(
        model: string,
        modelAlias: string,
        field: string,
        fieldDef: FieldDef,
        payload: any,
    ) {
        // null check needs to be converted to fk "is null" checks
        if (payload === null) {
            return this.eb(this.eb.ref(`${modelAlias}.${field}`), 'is', null);
        }

        const relationModel = fieldDef.type;

        // evaluating the filter involves creating an inner select,
        // give it an alias to avoid conflict
        const relationFilterSelectAlias = `${modelAlias}$${field}$filter`;

        const buildPkFkWhereRefs = (eb: ExpressionBuilder<any, any>) => {
            const m2m = getManyToManyRelation(this.schema, model, field);
            if (m2m) {
                // many-to-many relation

                const modelIdFields = requireIdFields(this.schema, model);
                invariant(modelIdFields.length === 1, 'many-to-many relation must have exactly one id field');
                const relationIdFields = requireIdFields(this.schema, relationModel);
                invariant(relationIdFields.length === 1, 'many-to-many relation must have exactly one id field');

                return eb(
                    this.eb.ref(`${relationFilterSelectAlias}.${relationIdFields[0]}`),
                    'in',
                    eb
                        .selectFrom(m2m.joinTable)
                        .select(`${m2m.joinTable}.${m2m.otherFkName}`)
                        .whereRef(
                            this.eb.ref(`${m2m.joinTable}.${m2m.parentFkName}`),
                            '=',
                            this.eb.ref(`${modelAlias}.${modelIdFields[0]}`),
                        ),
                );
            } else {
                const relationKeyPairs = getRelationForeignKeyFieldPairs(this.schema, model, field);

                let result = this.true();
                for (const { fk, pk } of relationKeyPairs.keyPairs) {
                    if (relationKeyPairs.ownedByModel) {
                        result = this.and(
                            result,
                            eb(
                                this.eb.ref(`${modelAlias}.${fk}`),
                                '=',
                                this.eb.ref(`${relationFilterSelectAlias}.${pk}`),
                            ),
                        );
                    } else {
                        result = this.and(
                            result,
                            eb(
                                this.eb.ref(`${modelAlias}.${pk}`),
                                '=',
                                this.eb.ref(`${relationFilterSelectAlias}.${fk}`),
                            ),
                        );
                    }
                }
                return result;
            }
        };

        let result = this.true();

        for (const [key, subPayload] of Object.entries(payload)) {
            if (!subPayload) {
                continue;
            }

            const countSelect = (negate: boolean) => {
                const filter = this.buildFilter(relationModel, relationFilterSelectAlias, subPayload);
                return (
                    this.eb
                        // the outer select is needed to avoid mysql's scope issue
                        .selectFrom(
                            this.buildSelectModel(relationModel, relationFilterSelectAlias)
                                .select(() => this.eb.fn.count(this.eb.lit(1)).as('$count'))
                                .where(buildPkFkWhereRefs(this.eb))
                                .where(() => (negate ? this.eb.not(filter) : filter))
                                .as('$sub'),
                        )
                        .select('$count')
                );
            };

            switch (key) {
                case 'some': {
                    result = this.and(result, this.eb(countSelect(false), '>', 0));
                    break;
                }

                case 'every': {
                    result = this.and(result, this.eb(countSelect(true), '=', 0));
                    break;
                }

                case 'none': {
                    result = this.and(result, this.eb(countSelect(false), '=', 0));
                    break;
                }
            }
        }

        return result;
    }

    private buildArrayFilter(fieldRef: Expression<any>, fieldDef: FieldDef, payload: any) {
        const clauses: Expression<SqlBool>[] = [];
        const fieldType = fieldDef.type as BuiltinType;

        for (const [key, _value] of Object.entries(payload)) {
            if (_value === undefined) {
                continue;
            }

            invariant(fieldDef.array, 'Field must be an array type to build array filter');
            const value = this.transformInput(_value, fieldType, true);

            let receiver = fieldRef;
            if (isEnum(this.schema, fieldType)) {
                // cast enum array to `text[]` for type compatibility
                receiver = this.eb.cast(fieldRef, sql.raw('text[]'));
            }

            const buildArray = (value: unknown) => {
                invariant(Array.isArray(value), 'Array filter value must be an array');
                return this.buildArrayValue(
                    value.map((v) => this.eb.val(v)),
                    fieldType,
                );
            };

            switch (key) {
                case 'equals': {
                    clauses.push(this.eb(receiver, '=', buildArray(value)));
                    break;
                }

                case 'has': {
                    clauses.push(this.buildArrayContains(receiver, this.eb.val(value), fieldType));
                    break;
                }

                case 'hasEvery': {
                    clauses.push(this.buildArrayHasEvery(receiver, buildArray(value)));
                    break;
                }

                case 'hasSome': {
                    clauses.push(this.buildArrayHasSome(receiver, buildArray(value)));
                    break;
                }

                case 'isEmpty': {
                    clauses.push(this.eb(fieldRef, value === true ? '=' : '!=', this.eb.val([])));
                    break;
                }

                default: {
                    throw createInvalidInputError(`Invalid array filter key: ${key}`);
                }
            }
        }

        return this.and(...clauses);
    }

    buildPrimitiveFilter(fieldRef: Expression<any>, fieldDef: FieldDef, payload: any) {
        if (payload === null) {
            return this.eb(fieldRef, 'is', null);
        }

        if (isEnum(this.schema, fieldDef.type)) {
            return this.buildEnumFilter(fieldRef, fieldDef, payload);
        }

        if (isTypeDef(this.schema, fieldDef.type)) {
            return this.buildJsonFilter(fieldRef, payload, fieldDef);
        }

        return match(fieldDef.type as BuiltinType)
            .with('String', () => this.buildStringFilter(fieldRef, payload))
            .with(P.union('Int', 'Float', 'Decimal', 'BigInt'), (type) =>
                this.buildNumberFilter(fieldRef, type, payload),
            )
            .with('Boolean', () => this.buildBooleanFilter(fieldRef, payload))
            .with('DateTime', () => this.buildDateTimeFilter(fieldRef, payload))
            .with('Bytes', () => this.buildBytesFilter(fieldRef, payload))
            .with('Json', () => this.buildJsonFilter(fieldRef, payload, fieldDef))
            .with('Unsupported', () => {
                throw createInvalidInputError(`Unsupported field cannot be used in filters`);
            })
            .exhaustive();
    }

    private buildJsonFilter(receiver: Expression<any>, filter: any, fieldDef: FieldDef): any {
        invariant(filter && typeof filter === 'object', 'Json filter payload must be an object');

        if (
            [
                'path',
                'equals',
                'not',
                'string_contains',
                'string_starts_with',
                'string_ends_with',
                'array_contains',
                'array_starts_with',
                'array_ends_with',
            ].some((k) => k in filter)
        ) {
            return this.buildPlainJsonFilter(receiver, filter);
        } else if (isTypeDef(this.schema, fieldDef.type)) {
            return this.buildTypedJsonFilter(receiver, filter, fieldDef.type, !!fieldDef.array);
        } else {
            throw createInvalidInputError(`Invalid JSON filter payload`);
        }
    }

    private buildPlainJsonFilter(receiver: Expression<any>, filter: any) {
        const clauses: Expression<SqlBool>[] = [];

        const path = filter.path;
        const jsonReceiver = this.buildJsonPathSelection(receiver, path);
        const stringReceiver = this.castText(jsonReceiver);

        const mode = filter.mode ?? 'default';
        invariant(mode === 'default' || mode === 'insensitive', 'Invalid JSON filter mode');

        for (const [key, value] of Object.entries(filter)) {
            switch (key) {
                case 'equals': {
                    clauses.push(this.buildJsonValueFilterClause(jsonReceiver, value));
                    break;
                }
                case 'not': {
                    clauses.push(this.eb.not(this.buildJsonValueFilterClause(jsonReceiver, value)));
                    break;
                }
                case 'string_contains': {
                    invariant(typeof value === 'string', 'string_contains value must be a string');
                    clauses.push(this.buildJsonStringFilter(stringReceiver, key, value, mode));
                    break;
                }
                case 'string_starts_with': {
                    invariant(typeof value === 'string', 'string_starts_with value must be a string');
                    clauses.push(this.buildJsonStringFilter(stringReceiver, key, value, mode));
                    break;
                }
                case 'string_ends_with': {
                    invariant(typeof value === 'string', 'string_ends_with value must be a string');
                    clauses.push(this.buildJsonStringFilter(stringReceiver, key, value, mode));
                    break;
                }
                case 'array_contains': {
                    clauses.push(this.buildJsonArrayFilter(jsonReceiver, key, value));
                    break;
                }
                case 'array_starts_with': {
                    clauses.push(this.buildJsonArrayFilter(jsonReceiver, key, value));
                    break;
                }
                case 'array_ends_with': {
                    clauses.push(this.buildJsonArrayFilter(jsonReceiver, key, value));
                    break;
                }
                case 'path':
                case 'mode':
                    // already handled
                    break;
                default:
                    throw createInvalidInputError(`Invalid JSON filter key: ${key}`);
            }
        }
        return this.and(...clauses);
    }

    private buildTypedJsonFilter(receiver: Expression<any>, filter: any, typeDefName: string, array: boolean) {
        if (array) {
            return this.buildTypedJsonArrayFilter(receiver, filter, typeDefName);
        } else {
            return this.buildTypeJsonNonArrayFilter(receiver, filter, typeDefName);
        }
    }

    private buildTypedJsonArrayFilter(receiver: Expression<any>, filter: any, typeDefName: string) {
        invariant(filter && typeof filter === 'object', 'Typed JSON array filter payload must be an object');

        const makeExistsPred = (filter: any) =>
            this.buildJsonArrayExistsPredicate(receiver, (elem) =>
                this.buildTypedJsonFilter(elem, filter, typeDefName, false),
            );

        const makeExistsNegatedPred = (filter: any) =>
            this.buildJsonArrayExistsPredicate(receiver, (elem) =>
                this.eb.not(this.buildTypedJsonFilter(elem, filter, typeDefName, false)),
            );

        const clauses: Expression<SqlBool>[] = [];

        for (const [key, value] of Object.entries(filter)) {
            if (!value || typeof value !== 'object') {
                continue;
            }
            switch (key) {
                case 'some':
                    clauses.push(makeExistsPred(value));
                    break;

                case 'none':
                    clauses.push(this.eb.not(makeExistsPred(value)));
                    break;

                case 'every':
                    clauses.push(this.eb.not(makeExistsNegatedPred(value)));
                    break;

                default:
                    invariant(false, `Invalid typed JSON array filter key: ${key}`);
            }
        }
        return this.and(...clauses);
    }

    private buildTypeJsonNonArrayFilter(
        receiver: Expression<any>,
        filter: any,
        typeDefName: string,
    ): Expression<SqlBool> {
        const clauses: Expression<SqlBool>[] = [];

        if (filter === null) {
            return this.eb(receiver, '=', this.transformInput(null, 'Json', false));
        }

        invariant(filter && typeof filter === 'object', 'Typed JSON filter payload must be an object');

        if ('is' in filter || 'isNot' in filter) {
            // is / isNot filters
            if ('is' in filter && filter.is && typeof filter.is === 'object') {
                clauses.push(this.buildTypedJsonFilter(receiver, filter.is, typeDefName, false));
            }

            if ('isNot' in filter && filter.isNot && typeof filter.isNot === 'object') {
                clauses.push(this.eb.not(this.buildTypedJsonFilter(receiver, filter.isNot, typeDefName, false)));
            }
        } else {
            // direct field filters
            const typeDef = requireTypeDef(this.schema, typeDefName);
            for (const [key, value] of Object.entries(filter)) {
                const fieldDef = typeDef.fields[key];
                invariant(fieldDef, `Field "${key}" not found in type definition "${typeDefName}"`);
                const fieldReceiver = this.buildJsonPathSelection(receiver, `$.${key}`);
                if (isTypeDef(this.schema, fieldDef.type)) {
                    clauses.push(this.buildTypedJsonFilter(fieldReceiver, value, fieldDef.type, !!fieldDef.array));
                } else {
                    if (fieldDef.array) {
                        clauses.push(this.buildArrayFilter(fieldReceiver, fieldDef, value));
                    } else {
                        let _receiver = fieldReceiver;
                        if (fieldDef.type === 'String') {
                            // trim quotes for string fields
                            _receiver = this.trimTextQuotes(this.castText(fieldReceiver));
                        }
                        clauses.push(this.buildPrimitiveFilter(_receiver, fieldDef, value));
                    }
                }
            }
        }
        return this.and(...clauses);
    }

    private buildJsonValueFilterClause(lhs: Expression<any>, value: unknown) {
        if (value instanceof DbNullClass) {
            return this.eb(lhs, 'is', null);
        } else if (value instanceof JsonNullClass) {
            return this.eb.and([
                this.eb(lhs, '=', this.transformInput(null, 'Json', false)),
                this.eb(lhs, 'is not', null),
            ]);
        } else if (value instanceof AnyNullClass) {
            // AnyNull matches both DB NULL and JSON null
            return this.eb.or([this.eb(lhs, 'is', null), this.eb(lhs, '=', this.transformInput(null, 'Json', false))]);
        } else {
            return this.buildJsonEqualityFilter(lhs, value);
        }
    }

    protected buildJsonEqualityFilter(lhs: Expression<any>, rhs: unknown) {
        return this.buildLiteralFilter(lhs, 'Json', rhs);
    }

    private buildLiteralFilter(lhs: Expression<any>, type: BuiltinType, rhs: unknown) {
        return this.eb(lhs, '=', rhs !== null && rhs !== undefined ? this.transformInput(rhs, type, false) : rhs);
    }

    private buildStandardFilter(
        type: BuiltinType,
        payload: any,
        lhs: Expression<any>,
        getRhs: (value: unknown) => any,
        recurse: (value: unknown) => Expression<SqlBool>,
        throwIfInvalid = false,
        onlyForKeys: string[] | undefined = undefined,
        excludeKeys: string[] = [],
    ) {
        if (payload === null || !isPlainObject(payload)) {
            return {
                conditions: [this.buildLiteralFilter(lhs, type, payload)],
                consumedKeys: [],
            };
        }

        const conditions: Expression<SqlBool>[] = [];
        const consumedKeys: string[] = [];

        for (const [op, value] of Object.entries(payload)) {
            if (onlyForKeys && !onlyForKeys.includes(op)) {
                continue;
            }
            if (excludeKeys.includes(op)) {
                continue;
            }
            const rhs = Array.isArray(value) ? value.map(getRhs) : getRhs(value);
            const condition = match(op)
                .with('equals', () => (rhs === null ? this.eb(lhs, 'is', null) : this.eb(lhs, '=', rhs)))
                .with('in', () => {
                    invariant(Array.isArray(rhs), 'right hand side must be an array');
                    if (rhs.length === 0) {
                        return this.false();
                    } else {
                        return this.eb(lhs, 'in', rhs);
                    }
                })
                .with('notIn', () => {
                    invariant(Array.isArray(rhs), 'right hand side must be an array');
                    if (rhs.length === 0) {
                        return this.true();
                    } else {
                        return this.eb.not(this.eb(lhs, 'in', rhs));
                    }
                })
                .with('lt', () => this.eb(lhs, '<', rhs))
                .with('lte', () => this.eb(lhs, '<=', rhs))
                .with('gt', () => this.eb(lhs, '>', rhs))
                .with('gte', () => this.eb(lhs, '>=', rhs))
                .with('between', () => {
                    invariant(Array.isArray(rhs), 'right hand side must be an array');
                    invariant(rhs.length === 2, 'right hand side must have a length of 2');
                    const [start, end] = rhs;
                    return this.eb.and([this.eb(lhs, '>=', start), this.eb(lhs, '<=', end)]);
                })
                .with('not', () => this.eb.not(recurse(value)))
                // aggregations
                .with(P.union(...AggregateOperators), (op) => {
                    const innerResult = this.buildStandardFilter(
                        type,
                        value,
                        aggregate(this.eb, lhs, op),
                        getRhs,
                        recurse,
                        throwIfInvalid,
                    );
                    consumedKeys.push(...innerResult.consumedKeys);
                    return this.and(...innerResult.conditions);
                })
                .otherwise(() => {
                    if (throwIfInvalid) {
                        throw createInvalidInputError(`Invalid filter key: ${op}`);
                    } else {
                        return undefined;
                    }
                });

            if (condition) {
                conditions.push(condition);
                consumedKeys.push(op);
            }
        }

        return { conditions, consumedKeys };
    }

    private buildStringFilter(fieldRef: Expression<any>, payload: StringFilter<true, boolean>) {
        let mode: 'default' | 'insensitive' | undefined;
        if (payload && typeof payload === 'object' && 'mode' in payload) {
            mode = payload.mode;
        }

        const { conditions, consumedKeys } = this.buildStandardFilter(
            'String',
            payload,
            mode === 'insensitive' ? this.eb.fn('lower', [fieldRef]) : fieldRef,
            (value) => this.prepStringCasing(this.eb, value, mode),
            (value) => this.buildStringFilter(fieldRef, value as StringFilter<true, boolean>),
        );

        if (payload && typeof payload === 'object') {
            for (const [key, value] of Object.entries(payload)) {
                if (key === 'mode' || consumedKeys.includes(key)) {
                    // already consumed
                    continue;
                }

                invariant(typeof value === 'string', `${key} value must be a string`);

                const escapedValue = this.escapeLikePattern(value);
                const condition = match(key)
                    .with('contains', () => this.buildStringLike(fieldRef, `%${escapedValue}%`, mode === 'insensitive'))
                    .with('startsWith', () =>
                        this.buildStringLike(fieldRef, `${escapedValue}%`, mode === 'insensitive'),
                    )
                    .with('endsWith', () => this.buildStringLike(fieldRef, `%${escapedValue}`, mode === 'insensitive'))
                    .otherwise(() => {
                        throw createInvalidInputError(`Invalid string filter key: ${key}`);
                    });

                if (condition) {
                    conditions.push(condition);
                }
            }
        }

        return this.and(...conditions);
    }

    private buildJsonStringFilter(
        receiver: Expression<any>,
        operation: 'string_contains' | 'string_starts_with' | 'string_ends_with',
        value: string,
        mode: 'default' | 'insensitive',
    ) {
        // build LIKE pattern based on operation, note that receiver is quoted
        const escapedValue = this.escapeLikePattern(value);
        const pattern = match(operation)
            .with('string_contains', () => `"%${escapedValue}%"`)
            .with('string_starts_with', () => `"${escapedValue}%"`)
            .with('string_ends_with', () => `"%${escapedValue}"`)
            .exhaustive();

        return this.buildStringLike(receiver, pattern, mode === 'insensitive');
    }

    private escapeLikePattern(pattern: string) {
        return pattern.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
    }

    private buildStringLike(receiver: Expression<any>, pattern: string, insensitive: boolean) {
        const { supportsILike } = this.getStringCasingBehavior();
        const op = insensitive && supportsILike ? 'ilike' : 'like';
        return sql<SqlBool>`${receiver} ${sql.raw(op)} ${sql.val(pattern)} escape ${sql.val('\\')}`;
    }

    private prepStringCasing(
        eb: ExpressionBuilder<any, any>,
        value: unknown,
        mode: 'default' | 'insensitive' | undefined,
    ): any {
        if (!mode || mode === 'default') {
            return value === null ? value : sql.val(value);
        }

        if (typeof value === 'string') {
            return eb.fn('lower', [sql.val(value)]);
        } else if (Array.isArray(value)) {
            return value.map((v) => this.prepStringCasing(eb, v, mode));
        } else {
            return value === null ? null : sql.val(value);
        }
    }

    private buildNumberFilter(fieldRef: Expression<any>, type: BuiltinType, payload: any) {
        const { conditions } = this.buildStandardFilter(
            type,
            payload,
            fieldRef,
            (value) => this.transformInput(value, type, false),
            (value) => this.buildNumberFilter(fieldRef, type, value),
        );
        return this.and(...conditions);
    }

    private buildBooleanFilter(fieldRef: Expression<any>, payload: BooleanFilter<boolean, boolean>) {
        const { conditions } = this.buildStandardFilter(
            'Boolean',
            payload,
            fieldRef,
            (value) => this.transformInput(value, 'Boolean', false),
            (value) => this.buildBooleanFilter(fieldRef, value as BooleanFilter<boolean, boolean>),
            true,
            ['equals', 'not'],
        );
        return this.and(...conditions);
    }

    private buildDateTimeFilter(fieldRef: Expression<any>, payload: DateTimeFilter<boolean, boolean>) {
        const { conditions } = this.buildStandardFilter(
            'DateTime',
            payload,
            fieldRef,
            (value) => this.transformInput(value, 'DateTime', false),
            (value) => this.buildDateTimeFilter(fieldRef, value as DateTimeFilter<boolean, boolean>),
            true,
        );
        return this.and(...conditions);
    }

    private buildBytesFilter(fieldRef: Expression<any>, payload: BytesFilter<boolean, boolean>) {
        const conditions = this.buildStandardFilter(
            'Bytes',
            payload,
            fieldRef,
            (value) => this.transformInput(value, 'Bytes', false),
            (value) => this.buildBytesFilter(fieldRef, value as BytesFilter<boolean, boolean>),
            true,
            ['equals', 'in', 'notIn', 'not'],
        );
        return this.and(...conditions.conditions);
    }

    private buildEnumFilter(fieldRef: Expression<any>, fieldDef: FieldDef, payload: any) {
        const conditions = this.buildStandardFilter(
            'String',
            payload,
            fieldRef,
            (value) => value,
            (value) => this.buildEnumFilter(fieldRef, fieldDef, value),
            true,
            ['equals', 'in', 'notIn', 'not'],
        );
        return this.and(...conditions.conditions);
    }

    buildOrderBy(
        query: SelectQueryBuilder<any, any, any>,
        model: string,
        modelAlias: string,
        orderBy: OrArray<OrderBy<Schema, GetModels<Schema>, boolean, boolean>> | undefined,
        negated: boolean,
        take: number | undefined,
    ) {
        if (!orderBy) {
            return query;
        }

        let result = query;

        const buildFieldRef = (model: string, field: string, modelAlias: string) => {
            const fieldDef = requireField(this.schema, model, field);
            return fieldDef.originModel
                ? this.fieldRef(fieldDef.originModel, field, fieldDef.originModel)
                : this.fieldRef(model, field, modelAlias);
        };

        enumerate(orderBy).forEach((orderBy, index) => {
            for (const [field, value] of Object.entries<any>(orderBy)) {
                if (!value) {
                    continue;
                }

                // aggregations
                if (['_count', '_avg', '_sum', '_min', '_max'].includes(field)) {
                    invariant(typeof value === 'object', `invalid orderBy value for field "${field}"`);
                    for (const [k, v] of Object.entries<SortOrder>(value)) {
                        invariant(v === 'asc' || v === 'desc', `invalid orderBy value for field "${field}"`);
                        result = result.orderBy(
                            (eb) => aggregate(eb, buildFieldRef(model, k, modelAlias), field as AggregateOperators),
                            this.negateSort(v, negated),
                        );
                    }
                    continue;
                }

                const fieldDef = requireField(this.schema, model, field);

                if (!fieldDef.relation) {
                    const fieldRef = buildFieldRef(model, field, modelAlias);
                    if (value === 'asc' || value === 'desc') {
                        result = result.orderBy(fieldRef, this.negateSort(value, negated));
                    } else if (
                        typeof value === 'object' &&
                        'nulls' in value &&
                        'sort' in value &&
                        (value.sort === 'asc' || value.sort === 'desc') &&
                        (value.nulls === 'first' || value.nulls === 'last')
                    ) {
                        result = this.buildOrderByField(
                            result,
                            fieldRef,
                            this.negateSort(value.sort, negated),
                            value.nulls,
                        );
                    }
                } else {
                    // order by relation
                    const relationModel = fieldDef.type;

                    if (fieldDef.array) {
                        // order by to-many relation
                        if (typeof value !== 'object') {
                            throw createInvalidInputError(`invalid orderBy value for field "${field}"`);
                        }
                        if ('_count' in value) {
                            invariant(
                                value._count === 'asc' || value._count === 'desc',
                                'invalid orderBy value for field "_count"',
                            );
                            const sort = this.negateSort(value._count, negated);
                            result = result.orderBy((eb) => {
                                const subQueryAlias = `${modelAlias}$orderBy$${field}$count`;
                                let subQuery = this.buildSelectModel(relationModel, subQueryAlias);
                                const joinPairs = buildJoinPairs(this.schema, model, modelAlias, field, subQueryAlias);
                                subQuery = subQuery.where(() =>
                                    this.and(
                                        ...joinPairs.map(([left, right]) =>
                                            eb(this.eb.ref(left), '=', this.eb.ref(right)),
                                        ),
                                    ),
                                );
                                subQuery = subQuery.select(() => eb.fn.count(eb.lit(1)).as('_count'));
                                return subQuery;
                            }, sort);
                        }
                    } else {
                        // order by to-one relation
                        const joinAlias = `${modelAlias}$orderBy$${index}`;
                        result = result.leftJoin(`${relationModel} as ${joinAlias}`, (join) => {
                            const joinPairs = buildJoinPairs(this.schema, model, modelAlias, field, joinAlias);
                            return join.on((eb) =>
                                this.and(
                                    ...joinPairs.map(([left, right]) => eb(this.eb.ref(left), '=', this.eb.ref(right))),
                                ),
                            );
                        });
                        result = this.buildOrderBy(result, relationModel, joinAlias, value, negated, take);
                    }
                }
            }
        });

        return result;
    }

    buildSelectAllFields(
        model: string,
        query: SelectQueryBuilder<any, any, any>,
        omit: Record<string, boolean | undefined> | undefined | null,
        modelAlias: string,
    ) {
        const modelDef = requireModel(this.schema, model);
        let result = query;

        for (const field of Object.keys(modelDef.fields)) {
            if (isRelationField(this.schema, model, field)) {
                continue;
            }
            if (this.shouldOmitField(omit, model, field)) {
                continue;
            }
            result = this.buildSelectField(result, model, modelAlias, field);
        }

        // select all fields from delegate descendants and pack into a JSON field `$delegate$Model`
        const descendants = getDelegateDescendantModels(this.schema, model);
        for (const subModel of descendants) {
            result = this.buildDelegateJoin(model, modelAlias, subModel.name, result);
            result = result.select((eb) => {
                const jsonObject: Record<string, Expression<any>> = {};
                for (const field of Object.keys(subModel.fields)) {
                    if (
                        isRelationField(this.schema, subModel.name, field) ||
                        isInheritedField(this.schema, subModel.name, field)
                    ) {
                        continue;
                    }
                    jsonObject[field] = eb.ref(`${subModel.name}.${field}`);
                }
                return this.buildJsonObject(jsonObject).as(`${DELEGATE_JOINED_FIELD_PREFIX}${subModel.name}`);
            });
        }

        return result;
    }

    shouldOmitField(omit: unknown, model: string, field: string) {
        // query-level
        if (omit && typeof omit === 'object' && typeof (omit as any)[field] === 'boolean') {
            return (omit as any)[field];
        }

        if (
            this.options.omit?.[model] &&
            typeof this.options.omit[model] === 'object' &&
            typeof (this.options.omit[model] as any)[field] === 'boolean'
        ) {
            return (this.options.omit[model] as any)[field];
        }

        // schema-level
        const fieldDef = requireField(this.schema, model, field);
        return !!fieldDef.omit;
    }

    protected buildModelSelect(
        model: GetModels<Schema>,
        subQueryAlias: string,
        payload: true | FindArgs<Schema, GetModels<Schema>, any, true>,
        selectAllFields: boolean,
    ) {
        let subQuery = this.buildSelectModel(model, subQueryAlias);

        if (selectAllFields) {
            subQuery = this.buildSelectAllFields(
                model,
                subQuery,
                typeof payload === 'object' ? payload?.omit : undefined,
                subQueryAlias,
            );
        }

        if (payload && typeof payload === 'object') {
            subQuery = this.buildFilterSortTake(model, payload, subQuery, subQueryAlias);
        }

        return subQuery;
    }

    buildSelectField(
        query: SelectQueryBuilder<any, any, any>,
        model: string,
        modelAlias: string,
        field: string,
    ): SelectQueryBuilder<any, any, any> {
        const fieldDef = requireField(this.schema, model, field);

        // if field is defined on a delegate base, the base model is joined with its
        // model name from outer query, so we should use it directly as the alias
        const fieldModel = fieldDef.originModel ?? model;
        const alias = fieldDef.originModel ?? modelAlias;

        return query.select(() => this.fieldRef(fieldModel, field, alias).as(field));
    }

    buildDelegateJoin(
        thisModel: string,
        thisModelAlias: string,
        otherModelAlias: string,
        query: SelectQueryBuilder<any, any, any>,
    ) {
        const idFields = requireIdFields(this.schema, thisModel);
        query = query.leftJoin(otherModelAlias, (qb) => {
            for (const idField of idFields) {
                qb = qb.onRef(`${thisModelAlias}.${idField}`, '=', `${otherModelAlias}.${idField}`);
            }
            return qb;
        });
        return query;
    }

    buildCountJson(model: string, eb: ExpressionBuilder<any, any>, parentAlias: string, payload: any) {
        const modelDef = requireModel(this.schema, model);
        const toManyRelations = Object.entries(modelDef.fields).filter(([, field]) => field.relation && field.array);

        const selections =
            payload === true
                ? {
                      select: toManyRelations.reduce(
                          (acc, [field]) => {
                              acc[field] = true;
                              return acc;
                          },
                          {} as Record<string, boolean>,
                      ),
                  }
                : payload;

        const jsonObject: Record<string, Expression<any>> = {};

        for (const [field, value] of Object.entries(selections.select)) {
            const fieldDef = requireField(this.schema, model, field);
            const fieldModel = fieldDef.type as GetModels<Schema>;
            let fieldCountQuery: SelectQueryBuilder<any, any, any>;

            // join conditions
            const m2m = getManyToManyRelation(this.schema, model, field);
            if (m2m) {
                // many-to-many relation, count the join table
                fieldCountQuery = this.buildModelSelect(fieldModel, fieldModel, value as any, false)
                    .innerJoin(m2m.joinTable, (join) =>
                        join
                            .onRef(`${m2m.joinTable}.${m2m.otherFkName}`, '=', `${fieldModel}.${m2m.otherPKName}`)
                            .onRef(`${m2m.joinTable}.${m2m.parentFkName}`, '=', `${parentAlias}.${m2m.parentPKName}`),
                    )
                    .select(eb.fn.countAll().as(`_count$${field}`));
            } else {
                // build a nested query to count the number of records in the relation
                fieldCountQuery = this.buildModelSelect(fieldModel, fieldModel, value as any, false).select(
                    eb.fn.countAll().as(`_count$${field}`),
                );

                // join conditions
                const joinPairs = buildJoinPairs(this.schema, model, parentAlias, field, fieldModel);
                for (const [left, right] of joinPairs) {
                    fieldCountQuery = fieldCountQuery.whereRef(left, '=', right);
                }
            }

            jsonObject[field] = fieldCountQuery;
        }

        return this.buildJsonObject(jsonObject);
    }

    // #endregion

    // #region utils

    protected negateSort(sort: SortOrder, negated: boolean) {
        return negated ? (sort === 'asc' ? 'desc' : 'asc') : sort;
    }

    public true(): Expression<SqlBool> {
        return this.eb.lit<SqlBool>(this.transformInput(true, 'Boolean', false) as boolean);
    }

    public false(): Expression<SqlBool> {
        return this.eb.lit<SqlBool>(this.transformInput(false, 'Boolean', false) as boolean);
    }

    public isTrue(expression: Expression<SqlBool>) {
        const node = expression.toOperationNode();
        if (node.kind !== 'ValueNode') {
            return false;
        }
        return (node as ValueNode).value === true || (node as ValueNode).value === 1;
    }

    public isFalse(expression: Expression<SqlBool>) {
        const node = expression.toOperationNode();
        if (node.kind !== 'ValueNode') {
            return false;
        }
        return (node as ValueNode).value === false || (node as ValueNode).value === 0;
    }

    and(...args: Expression<SqlBool>[]) {
        const nonTrueArgs = args.filter((arg) => !this.isTrue(arg));
        if (nonTrueArgs.length === 0) {
            return this.true();
        } else if (nonTrueArgs.length === 1) {
            return nonTrueArgs[0]!;
        } else {
            return this.eb.and(nonTrueArgs);
        }
    }

    or(...args: Expression<SqlBool>[]) {
        const nonFalseArgs = args.filter((arg) => !this.isFalse(arg));
        if (nonFalseArgs.length === 0) {
            return this.false();
        } else if (nonFalseArgs.length === 1) {
            return nonFalseArgs[0]!;
        } else {
            return this.eb.or(nonFalseArgs);
        }
    }

    not(...args: Expression<SqlBool>[]) {
        return this.eb.not(this.and(...args));
    }

    fieldRef(model: string, field: string, modelAlias?: string, inlineComputedField = true) {
        const fieldDef = requireField(this.schema, model, field);

        if (!fieldDef.computed) {
            // regular field
            return this.eb.ref(modelAlias ? `${modelAlias}.${field}` : field);
        } else {
            // computed field
            if (!inlineComputedField) {
                return this.eb.ref(modelAlias ? `${modelAlias}.${field}` : field);
            }
            let computer: Function | undefined;
            if ('computedFields' in this.options) {
                const computedFields = this.options.computedFields as Record<string, any>;
                computer = computedFields?.[fieldDef.originModel ?? model]?.[field];
            }
            if (!computer) {
                throw createConfigError(`Computed field "${field}" implementation not provided for model "${model}"`);
            }
            return computer(this.eb, { modelAlias });
        }
    }

    protected canJoinWithoutNestedSelect(
        modelDef: ModelDef,
        payload: boolean | FindArgs<Schema, GetModels<Schema>, any, true>,
    ) {
        if (modelDef.computedFields) {
            // computed fields requires explicit select
            return false;
        }

        if (modelDef.baseModel || modelDef.isDelegate) {
            // delegate models require upward/downward joins
            return false;
        }

        if (
            typeof payload === 'object' &&
            (payload.orderBy ||
                payload.skip !== undefined ||
                payload.take !== undefined ||
                payload.cursor ||
                (payload as any).distinct)
        ) {
            // ordering/pagination/distinct needs to be handled before joining
            return false;
        }

        return true;
    }

    // #endregion

    // #region abstract methods

    abstract get provider(): DataSourceProviderType;

    /**
     * Builds selection for a relation field.
     */
    abstract buildRelationSelection(
        query: SelectQueryBuilder<any, any, any>,
        model: string,
        relationField: string,
        parentAlias: string,
        payload: true | FindArgs<Schema, GetModels<Schema>, any, true>,
    ): SelectQueryBuilder<any, any, any>;

    /**
     * Builds skip and take clauses.
     */
    abstract buildSkipTake(
        query: SelectQueryBuilder<any, any, any>,
        skip: number | undefined,
        take: number | undefined,
    ): SelectQueryBuilder<any, any, any>;

    /**
     * Builds an Kysely expression that returns a JSON object for the given key-value pairs.
     */
    abstract buildJsonObject(value: Record<string, Expression<unknown>>): AliasableExpression<unknown>;

    /**
     * Builds an Kysely expression that returns the length of an array.
     */
    abstract buildArrayLength(array: Expression<unknown>): AliasableExpression<number>;

    /**
     * Builds an array value expression.
     */
    abstract buildArrayValue(values: Expression<unknown>[], elemType: string): AliasableExpression<unknown>;

    /**
     * Builds an expression that checks if an array contains a single value.
     */
    abstract buildArrayContains(
        field: Expression<unknown>,
        value: Expression<unknown>,
        elemType?: string,
    ): AliasableExpression<SqlBool>;

    /**
     * Builds an expression that checks if an array contains all values from another array.
     */
    abstract buildArrayHasEvery(field: Expression<unknown>, values: Expression<unknown>): AliasableExpression<SqlBool>;

    /**
     * Builds an expression that checks if an array overlaps with another array.
     */
    abstract buildArrayHasSome(field: Expression<unknown>, values: Expression<unknown>): AliasableExpression<SqlBool>;

    /**
     * Casts the given expression to an integer type.
     */
    abstract castInt<T extends Expression<any>>(expression: T): T;

    /**
     * Casts the given expression to a text type.
     */
    abstract castText<T extends Expression<any>>(expression: T): T;

    /**
     * Trims double quotes from the start and end of a text expression.
     */
    abstract trimTextQuotes<T extends Expression<string>>(expression: T): T;

    /*
     * Gets the string casing behavior for the dialect.
     */
    abstract getStringCasingBehavior(): { supportsILike: boolean; likeCaseSensitive: boolean };

    /**
     * Builds a VALUES table and select all fields from it.
     */
    abstract buildValuesTableSelect(fields: FieldDef[], rows: unknown[][]): SelectQueryBuilder<any, any, any>;

    /**
     * Builds a JSON path selection expression.
     */
    protected abstract buildJsonPathSelection(receiver: Expression<any>, path: string | undefined): Expression<any>;

    /**
     * Builds a JSON array filter expression.
     */
    protected abstract buildJsonArrayFilter(
        receiver: Expression<any>,
        operation: 'array_contains' | 'array_starts_with' | 'array_ends_with',
        value: unknown,
    ): Expression<SqlBool>;

    /**
     * Builds a JSON array exists predicate (returning if any element matches the filter).
     */
    protected abstract buildJsonArrayExistsPredicate(
        receiver: Expression<any>,
        buildFilter: (elem: Expression<any>) => Expression<SqlBool>,
    ): Expression<SqlBool>;

    /**
     * Builds an ORDER BY clause for a field with NULLS FIRST/LAST support.
     */
    protected abstract buildOrderByField(
        query: SelectQueryBuilder<any, any, any>,
        field: Expression<unknown>,
        sort: SortOrder,
        nulls: 'first' | 'last',
    ): SelectQueryBuilder<any, any, any>;

    // #endregion
}
