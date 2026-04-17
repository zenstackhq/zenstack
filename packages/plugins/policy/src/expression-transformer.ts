import { invariant } from '@zenstackhq/common-helpers';
import {
    getCrudDialect,
    QueryUtils,
    SchemaUtils,
    type BaseCrudDialect,
    type ClientContract,
    type CRUD_EXT,
    type ZModelFunction,
} from '@zenstackhq/orm';
import type {
    BinaryExpression,
    BinaryOperator,
    BindingExpression,
    BuiltinType,
    FieldDef,
    GetModels,
    LiteralExpression,
    MemberExpression,
    UnaryExpression,
} from '@zenstackhq/orm/schema';
import {
    ExpressionUtils,
    type ArrayExpression,
    type CallExpression,
    type Expression,
    type FieldExpression,
    type SchemaDef,
} from '@zenstackhq/orm/schema';
import {
    AliasNode,
    BinaryOperationNode,
    ColumnNode,
    expressionBuilder,
    ExpressionWrapper,
    FromNode,
    FunctionNode,
    IdentifierNode,
    OperatorNode,
    ReferenceNode,
    SelectionNode,
    SelectQueryNode,
    TableNode,
    ValueListNode,
    ValueNode,
    WhereNode,
    type OperandExpression,
    type OperationNode,
} from 'kysely';
import { match } from 'ts-pattern';
import { AUTH_CTE_PREFIX, AUTH_ID_COL, AUTH_PARENT_ID_COL, authCteName } from './auth-cte-builder';
import { ExpressionEvaluator } from './expression-evaluator';
import { CollectionPredicateOperator } from './types';
import {
    conjunction,
    createUnsupportedError,
    disjunction,
    falseNode,
    isBeforeInvocation,
    logicalNot,
    trueNode,
} from './utils';

type BindingScope = Record<string, { type: string; alias: string; value?: any }>;

/**
 * Context for transforming a policy expression
 */
export type ExpressionTransformerContext = {
    /**
     * The current model or type name fields should be resolved against
     */
    modelOrType: string;

    /**
     * The alias name that should be used to address a model
     */
    alias?: string;

    /**
     * The CRUD operation
     */
    operation: CRUD_EXT;

    /**
     * In case of transforming a collection predicate's LHS, the compiled RHS filter expression
     */
    memberFilter?: OperationNode;

    /**
     * In case of transforming a collection predicate's LHS, the field name to select as the predicate result
     */
    memberSelect?: SelectionNode;

    /**
     * The value object that fields should be evaluated against
     */
    contextValue?: Record<string, any>;

    /**
     * Additional named collection predicate bindings available during transformation
     */
    bindingScope?: BindingScope;

    /**
     * The model or type name that `this` keyword refers to
     */
    thisType: string;

    /**
     * The table alias name used to compile `this` keyword
     */
    thisAlias?: string;

    /**
     * When set, we are inside a `transformAuthCollectionPredicate` subquery.
     * Relation accesses on the current model should use the nested auth CTE
     * (`$auth$<authCtePath>$<field>`) instead of the real DB table, and
     * link rows via the synthetic `$auth$pid = $id` FK.
     */
    authCtePath?: string[];

    /**
     * When true, the expression being transformed is an argument to a function call
     * that contains an `auth()` access. Auth member accesses in this context must
     * use the CTE path so the function receives a proper SQL expression.
     */
    authInFunctionArg?: boolean;
};

// a registry of expression handlers marked with @expr
const expressionHandlers = new Map<string, PropertyDescriptor>();

// expression handler decorator
function expr(kind: Expression['kind']) {
    return function (_target: unknown, _propertyKey: string, descriptor: PropertyDescriptor) {
        if (!expressionHandlers.get(kind)) {
            expressionHandlers.set(kind, descriptor);
        }
        return descriptor;
    };
}

/**
 * Utility for transforming a ZModel expression into a Kysely OperationNode.
 */
export class ExpressionTransformer<Schema extends SchemaDef> {
    private readonly dialect: BaseCrudDialect<Schema>;
    private readonly eb = expressionBuilder<any, any>();

    constructor(private readonly client: ClientContract<Schema>) {
        this.dialect = getCrudDialect(this.schema, this.clientOptions);
    }

    get schema() {
        return this.client.$schema;
    }

    get clientOptions() {
        return this.client.$options;
    }

    get auth() {
        return this.client.$auth;
    }

    get authType() {
        if (!this.schema.authType) {
            invariant(false, 'Schema does not have an "authType" specified');
        }
        return this.schema.authType!;
    }

    transform(expression: Expression, context: ExpressionTransformerContext): OperationNode {
        const handler = expressionHandlers.get(expression.kind);
        if (!handler) {
            throw new Error(`Unsupported expression kind: ${expression.kind}`);
        }
        const result = handler.value.call(this, expression, context);
        invariant('kind' in result, `expression handler must return an OperationNode: transforming ${expression.kind}`);
        return result;
    }

    @expr('literal')
    // @ts-expect-error
    private _literal(expr: LiteralExpression) {
        return this.transformValue(
            expr.value,
            typeof expr.value === 'string' ? 'String' : typeof expr.value === 'boolean' ? 'Boolean' : 'Int',
        );
    }

    @expr('array')
    // @ts-expect-error
    private _array(expr: ArrayExpression, context: ExpressionTransformerContext) {
        return this.dialect
            .buildArrayValue(
                expr.items.map((item) => new ExpressionWrapper(this.transform(item, context))),
                expr.type,
            )
            .toOperationNode();
    }

    @expr('field')
    private _field(expr: FieldExpression, context: ExpressionTransformerContext) {
        if (context.contextValue) {
            // if we're transforming against a value object, fields should be evaluated directly
            const fieldDef = QueryUtils.requireField(this.schema, context.modelOrType, expr.field);
            return this.transformValue(context.contextValue[expr.field], fieldDef.type as BuiltinType);
        }

        const fieldDef = QueryUtils.requireField(this.schema, context.modelOrType, expr.field);
        if (!fieldDef.relation) {
            return this.createColumnRef(expr.field, context);
        } else {
            const { memberFilter, memberSelect, ...restContext } = context;
            const relation = this.transformRelationAccess(expr.field, fieldDef.type, restContext);
            return {
                ...relation,
                where: this.mergeWhere(relation.where, memberFilter),
                selections: memberSelect ? [memberSelect] : relation.selections,
            };
        }
    }

    private mergeWhere(where: WhereNode | undefined, memberFilter: OperationNode | undefined) {
        if (!where) {
            return WhereNode.create(memberFilter ?? trueNode(this.dialect));
        }
        if (!memberFilter) {
            return where;
        }
        return WhereNode.create(conjunction(this.dialect, [where.where, memberFilter]));
    }

    @expr('null')
    // @ts-ignore
    private _null() {
        return ValueNode.createImmediate(null);
    }

    @expr('binary')
    // @ts-ignore
    private _binary(expr: BinaryExpression, context: ExpressionTransformerContext) {
        if (expr.op === '&&') {
            return conjunction(this.dialect, [this.transform(expr.left, context), this.transform(expr.right, context)]);
        } else if (expr.op === '||') {
            return disjunction(this.dialect, [this.transform(expr.left, context), this.transform(expr.right, context)]);
        }

        if (this.isAuthCall(expr.left) || this.isAuthCall(expr.right)) {
            return this.transformAuthBinary(expr, context);
        }

        const op = expr.op;

        if (op === '?' || op === '!' || op === '^') {
            return this.transformCollectionPredicate(expr, context);
        }

        const { normalizedLeft, normalizedRight } = this.normalizeBinaryOperationOperands(expr, context);
        const left = this.transform(normalizedLeft, context);
        const right = this.transform(normalizedRight, context);

        if (op === 'in') {
            if (this.isNullNode(left)) {
                return this.transformValue(false, 'Boolean');
            } else {
                if (ValueListNode.is(right)) {
                    return BinaryOperationNode.create(left, OperatorNode.create('in'), right);
                } else {
                    // array contains
                    return BinaryOperationNode.create(
                        left,
                        OperatorNode.create('='),
                        FunctionNode.create('any', [right]),
                    );
                }
            }
        }

        if (this.isNullNode(right)) {
            return this.transformNullCheck(left, expr.op);
        } else if (this.isNullNode(left)) {
            return this.transformNullCheck(right, expr.op);
        } else {
            const leftFieldDef = this.getFieldDefFromFieldRef(normalizedLeft, context);
            const rightFieldDef = this.getFieldDefFromFieldRef(normalizedRight, context);
            // Map ZModel operator to SQL operator string
            const sqlOp = op === '==' ? '=' : op;
            return this.dialect
                .buildComparison(
                    new ExpressionWrapper(left),
                    leftFieldDef,
                    sqlOp,
                    new ExpressionWrapper(right),
                    rightFieldDef,
                )
                .toOperationNode();
        }
    }

    private transformNullCheck(expr: OperationNode, operator: BinaryOperator) {
        if (operator === '==' || operator === '!=') {
            // equality checks against null
            if (ValueNode.is(expr)) {
                if (expr.value === null) {
                    return operator === '==' ? trueNode(this.dialect) : falseNode(this.dialect);
                } else {
                    return operator === '==' ? falseNode(this.dialect) : trueNode(this.dialect);
                }
            } else {
                return operator === '=='
                    ? BinaryOperationNode.create(expr, OperatorNode.create('is'), ValueNode.createImmediate(null))
                    : BinaryOperationNode.create(expr, OperatorNode.create('is not'), ValueNode.createImmediate(null));
            }
        } else {
            // otherwise any comparison with null is null
            return ValueNode.createImmediate(null);
        }
    }

    private normalizeBinaryOperationOperands(expr: BinaryExpression, context: ExpressionTransformerContext) {
        if (context.contextValue) {
            // no normalization needed if evaluating against a value object
            return { normalizedLeft: expr.left, normalizedRight: expr.right };
        }

        // if relation fields are used directly in comparison, it can only be compared with null,
        // so we normalize the args with the id field (use the first id field if multiple)
        let normalizedLeft: Expression = expr.left;
        if (this.isRelationField(expr.left, context)) {
            invariant(ExpressionUtils.isNull(expr.right), 'only null comparison is supported for relation field');
            const leftRelDef = this.getFieldDefFromFieldRef(expr.left, context);
            invariant(leftRelDef, 'failed to get relation field definition');
            const idFields = QueryUtils.requireIdFields(this.schema, leftRelDef.type);
            normalizedLeft = this.makeOrAppendMember(normalizedLeft, idFields[0]!);
        }
        let normalizedRight: Expression = expr.right;
        if (this.isRelationField(expr.right, context)) {
            invariant(ExpressionUtils.isNull(expr.left), 'only null comparison is supported for relation field');
            const rightRelDef = this.getFieldDefFromFieldRef(expr.right, context);
            invariant(rightRelDef, 'failed to get relation field definition');
            const idFields = QueryUtils.requireIdFields(this.schema, rightRelDef.type);
            normalizedRight = this.makeOrAppendMember(normalizedRight, idFields[0]!);
        }
        return { normalizedLeft, normalizedRight };
    }

    private transformCollectionPredicate(expr: BinaryExpression, context: ExpressionTransformerContext) {
        this.ensureCollectionPredicateOperator(expr.op);

        if (this.isAuthMember(expr.left)) {
            // LHS is an auth() member chain — resolve entirely via auth CTEs.
            return this.transformAuthCollectionPredicate(expr, context);
        }

        if (context.contextValue) {
            invariant(
                ExpressionUtils.isMember(expr.left) || ExpressionUtils.isField(expr.left),
                'expected member or field expression',
            );

            // LHS of the expression is evaluated as a concrete JS value (e.g. post-update hook).
            const evaluator = new ExpressionEvaluator();
            const receiver = evaluator.evaluate(expr.left, {
                thisValue: context.contextValue,
                auth: this.auth,
                bindingScope: this.getEvaluationBindingScope(context.bindingScope),
                operation: context.operation,
                thisType: context.thisType,
            });

            const memberType = this.getMemberType(context.modelOrType, expr.left);
            return this.transformValueCollectionPredicate(receiver, expr, { ...context, modelOrType: memberType });
        }

        // otherwise, transform the expression with relation joins

        invariant(
            ExpressionUtils.isField(expr.left) || ExpressionUtils.isMember(expr.left),
            'left operand must be field or member access',
        );

        let newContextModel: string;
        const fieldDef = this.getFieldDefFromFieldRef(expr.left, context);
        if (fieldDef) {
            invariant(fieldDef.relation, `field is not a relation: ${JSON.stringify(expr.left)}`);
            newContextModel = fieldDef.type;
        } else {
            invariant(
                ExpressionUtils.isMember(expr.left) &&
                    (ExpressionUtils.isField(expr.left.receiver) || ExpressionUtils.isBinding(expr.left.receiver)),
                'left operand must be member access with field receiver',
            );
            if (ExpressionUtils.isField(expr.left.receiver)) {
                // collection is a field access, context model is the field's type
                const fieldDef = QueryUtils.requireField(this.schema, context.modelOrType, expr.left.receiver.field);
                newContextModel = fieldDef.type;
            } else {
                // collection is a binding reference, get type from binding scope
                const binding = this.requireBindingScope(expr.left.receiver, context);
                newContextModel = binding.type;
            }

            for (const member of expr.left.members) {
                const memberDef = QueryUtils.requireField(this.schema, newContextModel, member);
                newContextModel = memberDef.type;
            }
        }

        // When inside an auth CTE context, compute the child CTE path and alias so the
        // inner predicate's fields and any deeper relation accesses resolve against auth CTEs.
        // This must happen before bindingScope so the new binding can use the auth CTE alias.
        let innerAlias: string | undefined;
        let innerAuthCtePath: string[] | undefined;
        if (context.authCtePath !== undefined) {
            if (ExpressionUtils.isField(expr.left)) {
                // Simple field: e.g. `someField?[...]` inside auth CTE context
                innerAuthCtePath = [...context.authCtePath, expr.left.field];
                innerAlias = authCteName(innerAuthCtePath);
            } else if (ExpressionUtils.isMember(expr.left) && ExpressionUtils.isBinding(expr.left.receiver)) {
                // Binding member: e.g. `c.staff?[s, ...]` where `c` is an auth CTE binding.
                // The inner CTE path is the current path extended by all the member steps.
                innerAuthCtePath = [...context.authCtePath, ...expr.left.members];
                innerAlias = authCteName(innerAuthCtePath);
            }
        }

        const bindingScope = expr.binding
            ? {
                  ...(context.bindingScope ?? {}),
                  [expr.binding]: { type: newContextModel, alias: innerAlias ?? newContextModel },
              }
            : context.bindingScope;

        let predicateFilter = this.transform(expr.right, {
            ...context,
            modelOrType: newContextModel,
            alias: innerAlias,
            bindingScope: bindingScope,
            authCtePath: innerAuthCtePath,
        });

        if (expr.op === '!') {
            predicateFilter = logicalNot(this.dialect, predicateFilter);
        }

        const count = FunctionNode.create('count', [ValueNode.createImmediate(1)]);

        const predicateResult = match(expr.op)
            .with('?', () => BinaryOperationNode.create(count, OperatorNode.create('>'), ValueNode.createImmediate(0)))
            .with('!', () => BinaryOperationNode.create(count, OperatorNode.create('='), ValueNode.createImmediate(0)))
            .with('^', () => BinaryOperationNode.create(count, OperatorNode.create('='), ValueNode.createImmediate(0)))
            .exhaustive();

        return this.transform(expr.left, {
            ...context,
            memberSelect: SelectionNode.create(AliasNode.create(predicateResult, IdentifierNode.create('_'))),
            memberFilter: predicateFilter,
        });
    }

    private ensureCollectionPredicateOperator(op: BinaryOperator): asserts op is CollectionPredicateOperator {
        invariant(CollectionPredicateOperator.includes(op as any), 'expected "?" or "!" or "^" operator');
    }

    /**
     * Handles a collection predicate whose LHS is rooted at `auth()`.
     * e.g. `auth().roles?[name == 'admin']` or `auth().org.roles?[id == this.roleId]`
     */
    private transformAuthCollectionPredicate(
        expr: BinaryExpression,
        context: ExpressionTransformerContext,
    ): OperationNode {
        this.ensureCollectionPredicateOperator(expr.op);
        invariant(ExpressionUtils.isMember(expr.left), 'expected member expression on LHS');
        invariant(this.isAuthCall((expr.left as MemberExpression).receiver), 'expected auth() receiver');

        const members = (expr.left as MemberExpression).members;

        // Walk the member chain to determine the element type.
        let currentType = this.authType;
        const pathParts: string[] = [];
        for (const member of members) {
            const fieldDef = QueryUtils.requireField(this.schema, currentType, member);
            pathParts.push(member);
            currentType = fieldDef.type;
        }

        // Use value-based evaluation unless the predicate's RHS either:
        //  - references a (non-auth) model field (this.field / non-auth binding), or
        //  - contains a function call the JS evaluator cannot handle.
        if (
            this.auth == null ||
            (!this.exprContainsFieldRef(expr.right, context.bindingScope) && !containsNonEvaluatableCall(expr.right))
        ) {
            const evaluator = new ExpressionEvaluator();
            const rawReceiver = evaluator.evaluate(expr.left, {
                thisValue: context.contextValue,
                auth: this.auth,
                bindingScope: this.getEvaluationBindingScope(context.bindingScope),
                operation: context.operation,
                thisType: context.thisType,
            });
            // When auth is provided but the collection field is absent, treat it as empty list.
            const receiver = this.auth != null && rawReceiver == null ? [] : rawReceiver;
            return this.transformValueCollectionPredicate(receiver, expr, { ...context, modelOrType: currentType });
        }

        const cteName = authCteName(pathParts);

        const bindingScope = expr.binding
            ? { ...(context.bindingScope ?? {}), [expr.binding]: { type: currentType, alias: cteName } }
            : context.bindingScope;

        let predicateFilter = this.transform(expr.right, {
            ...context,
            modelOrType: currentType,
            alias: cteName,
            bindingScope,
            // Signal to nested transforms that relation accesses should use auth CTEs.
            authCtePath: pathParts,
        });

        // For "every" (!), negate: NOT EXISTS (items that violate the condition).
        if (expr.op === '!') {
            predicateFilter = logicalNot(this.dialect, predicateFilter);
        }

        const count = FunctionNode.create('count', [ValueNode.createImmediate(1)]);
        const predicateResult = match(expr.op)
            .with('?', () => BinaryOperationNode.create(count, OperatorNode.create('>'), ValueNode.createImmediate(0)))
            .with('!', () => BinaryOperationNode.create(count, OperatorNode.create('='), ValueNode.createImmediate(0)))
            .with('^', () => BinaryOperationNode.create(count, OperatorNode.create('='), ValueNode.createImmediate(0)))
            .exhaustive();

        // Return a subquery of the form:
        //   (SELECT COUNT(1) [>|=] 0 AS _ FROM $auth$<path> WHERE <predicate>)
        const resultNode: SelectQueryNode = {
            kind: 'SelectQueryNode',
            from: FromNode.create([TableNode.create(cteName)]),
            where: WhereNode.create(predicateFilter),
            selections: [SelectionNode.create(AliasNode.create(predicateResult, IdentifierNode.create('_')))],
        };
        return resultNode;
    }

    /**
     * Resolves an `auth().<member>.<member>...` chain to a SQL value.
     *
     * If the caller supplied the relation chain as inline data in the auth JS object,
     * we evaluate it directly as a SQL literal (as an optimization) so that inline
     * values are respected exactly as provided.
     *
     * Otherwise we resolve via the pre-built DB-backed auth CTEs:
     *   Scalar terminal → scalar subquery:  (SELECT "field" FROM "$auth$<path>")
     *   Relation terminal → SelectQueryNode over the child CTE (used in EXISTS etc.)
     */
    private transformAuthMemberRef(expr: MemberExpression, context: ExpressionTransformerContext): OperationNode {
        // Use value-based evaluation by default; only use the CTE path when the auth
        // member is an argument to a function call (authInFunctionArg flag) or auth is null.
        if (this.auth == null || !context.authInFunctionArg) {
            return this.valueMemberAccess(this.auth, expr, this.authType);
        }

        let currentType = this.authType;
        const pathParts: string[] = [];

        // Walk all but the last member to build the CTE path.
        for (let i = 0; i < expr.members.length - 1; i++) {
            const member = expr.members[i]!;
            const fieldDef = QueryUtils.requireField(this.schema, currentType, member);
            pathParts.push(member);
            currentType = fieldDef.type;
        }

        const lastMember = expr.members[expr.members.length - 1]!;
        const fieldDef = QueryUtils.requireField(this.schema, currentType, lastMember);
        const cteName = authCteName(pathParts);

        if (!fieldDef.relation) {
            // Scalar field: scalar subquery from the CTE.
            // e.g. (SELECT "id" FROM "$auth") or (SELECT "name" FROM "$auth$org")
            return this.eb.selectFrom(cteName).select(lastMember).toOperationNode();
        } else {
            // Relation field: expose the child CTE as a SelectQueryNode so
            // collection-predicate and null-check callers can treat it uniformly.
            const childCteName = authCteName([...pathParts, lastMember]);
            const node: SelectQueryNode = {
                kind: 'SelectQueryNode',
                from: FromNode.create([TableNode.create(childCteName)]),
            };
            return node;
        }
    }

    private transformValueCollectionPredicate(
        receiver: any,
        expr: BinaryExpression,
        context: ExpressionTransformerContext,
    ) {
        if (!receiver) {
            return ValueNode.createImmediate(null);
        }

        this.ensureCollectionPredicateOperator(expr.op);

        const visitor = new SchemaUtils.MatchingExpressionVisitor((e) => ExpressionUtils.isThis(e));
        if (!visitor.find(expr.right)) {
            // right side only refers to the value tree, evaluate directly as an optimization
            const value = new ExpressionEvaluator().evaluate(expr, {
                auth: this.auth,
                thisValue: context.contextValue,
                bindingScope: this.getEvaluationBindingScope(context.bindingScope),
                operation: context.operation,
                thisType: context.thisType,
            });
            return this.transformValue(value, 'Boolean');
        } else {
            // right side refers to `this`, need expand into a real filter
            // e.g.: `auth().profiles?[age == this.age], where `this` refer to the containing model
            invariant(Array.isArray(receiver), 'array value is expected');

            // for each LHS element, transform RHS
            // e.g.: `auth().profiles[age == this.age]`, each `auth().profiles` element (which is a value)
            // is used to build an expression for the RHS `age == this.age`
            // the transformation happens recursively for nested collection predicates
            const components = receiver.map((item) => {
                const bindingScope = expr.binding
                    ? {
                          ...(context.bindingScope ?? {}),
                          [expr.binding]: {
                              type: context.modelOrType,
                              alias: context.thisAlias ?? context.modelOrType,
                              value: item,
                          },
                      }
                    : context.bindingScope;

                return this.transform(expr.right, {
                    operation: context.operation,
                    thisType: context.thisType,
                    thisAlias: context.thisAlias,
                    modelOrType: context.modelOrType,
                    contextValue: item,
                    bindingScope: bindingScope,
                });
            });

            // compose the components based on the operator
            return (
                match(expr.op)
                    // some
                    .with('?', () => disjunction(this.dialect, components))
                    // every
                    .with('!', () => conjunction(this.dialect, components))
                    // none
                    .with('^', () => logicalNot(this.dialect, disjunction(this.dialect, components)))
                    .exhaustive()
            );
        }
    }

    /**
     * Returns true if `expr` contains a reference to the context model — i.e. a `this`
     * expression or a binding whose alias is not an auth CTE (meaning it points to a DB
     * model row rather than an auth collection element).
     *
     * When true, a collection predicate involving auth data cannot be evaluated purely
     * from the JS auth object; it must be resolved with a SQL JOIN via auth CTEs.
     */
    private exprContainsFieldRef(expr: Expression, bindingScope?: BindingScope): boolean {
        if (ExpressionUtils.isThis(expr)) return true;
        if (ExpressionUtils.isMember(expr)) {
            if (ExpressionUtils.isThis(expr.receiver)) return true;
            if (ExpressionUtils.isBinding(expr.receiver)) {
                const scope = bindingScope?.[expr.receiver.name];
                // An auth-collection binding has an alias that starts with AUTH_CTE_PREFIX.
                // Any other binding (e.g. an outer DB-model collection binding) needs CTE.
                if (scope && !scope.alias.startsWith(AUTH_CTE_PREFIX)) return true;
            }
            return this.exprContainsFieldRef(expr.receiver, bindingScope);
        }
        if (ExpressionUtils.isBinary(expr)) {
            return (
                this.exprContainsFieldRef(expr.left, bindingScope) ||
                this.exprContainsFieldRef(expr.right, bindingScope)
            );
        }
        if (ExpressionUtils.isUnary(expr)) {
            return this.exprContainsFieldRef(expr.operand, bindingScope);
        }
        if (ExpressionUtils.isCall(expr)) {
            return (expr.args ?? []).some((a) => this.exprContainsFieldRef(a, bindingScope));
        }
        return false;
    }

    /**
     * Returns true if `expr` is or contains an `auth().<member>` access anywhere in its tree.
     * Used to decide whether a function-call argument requires the CTE path.
     */
    private exprContainsAuthRef(expr: Expression): boolean {
        if (ExpressionUtils.isMember(expr) && this.isAuthCall(expr.receiver)) return true;
        if (ExpressionUtils.isBinary(expr)) {
            return this.exprContainsAuthRef(expr.left) || this.exprContainsAuthRef(expr.right);
        }
        if (ExpressionUtils.isUnary(expr)) return this.exprContainsAuthRef(expr.operand);
        if (ExpressionUtils.isCall(expr) && expr.function !== 'auth') {
            return (expr.args ?? []).some((a) => this.exprContainsAuthRef(a));
        }
        return false;
    }

    private getMemberType(receiverType: string, expr: MemberExpression | FieldExpression) {
        if (ExpressionUtils.isField(expr)) {
            const fieldDef = QueryUtils.requireField(this.schema, receiverType, expr.field);
            return fieldDef.type;
        } else {
            let currType = receiverType;
            for (const member of expr.members) {
                const fieldDef = QueryUtils.requireField(this.schema, currType, member);
                currType = fieldDef.type;
            }
            return currType;
        }
    }

    private transformAuthBinary(expr: BinaryExpression, context: ExpressionTransformerContext) {
        if (expr.op !== '==' && expr.op !== '!=') {
            throw createUnsupportedError(
                `Unsupported operator for \`auth()\` in policy of model "${context.modelOrType}": ${expr.op}`,
            );
        }

        let authExpr: Expression;
        let other: Expression;
        if (this.isAuthCall(expr.left)) {
            authExpr = expr.left;
            other = expr.right;
        } else {
            authExpr = expr.right;
            other = expr.left;
        }

        if (ExpressionUtils.isNull(other)) {
            return this.transformValue(expr.op === '==' ? !this.auth : !!this.auth, 'Boolean');
        } else {
            const authModel = QueryUtils.getModel(this.schema, this.authType);
            if (!authModel) {
                throw createUnsupportedError(
                    `Unsupported use of \`auth()\` in policy of model "${context.modelOrType}", comparing with \`auth()\` is only possible when auth type is a model`,
                );
            }

            const idFields = Object.values(authModel.fields)
                .filter((f) => f.id)
                .map((f) => f.name);
            invariant(idFields.length > 0, 'auth type model must have at least one id field');

            // convert `auth() == other` into `auth().id == other.id`
            const conditions = idFields.map((fieldName) =>
                ExpressionUtils.binary(
                    ExpressionUtils.member(authExpr, [fieldName]),
                    '==',
                    this.makeOrAppendMember(other, fieldName),
                ),
            );
            let result = this.buildAnd(conditions);
            if (expr.op === '!=') {
                result = this.buildLogicalNot(result);
            }
            return this.transform(result, context);
        }
    }

    private makeOrAppendMember(other: Expression, fieldName: string): Expression {
        if (ExpressionUtils.isMember(other)) {
            return ExpressionUtils.member(other.receiver, [...other.members, fieldName]);
        } else {
            return ExpressionUtils.member(other, [fieldName]);
        }
    }

    private transformValue(value: unknown, type: BuiltinType): OperationNode {
        if (value === true) {
            return trueNode(this.dialect);
        } else if (value === false) {
            return falseNode(this.dialect);
        } else if (Array.isArray(value)) {
            return this.dialect
                .buildArrayValue(
                    value.map((v) => new ExpressionWrapper(this.transformValue(v, type))),
                    type,
                )
                .toOperationNode();
        } else {
            const transformed = this.dialect.transformInput(value, type, false) ?? null;
            if (typeof transformed !== 'string') {
                // simple non-string primitives can be immediate values
                return ValueNode.createImmediate(transformed);
            } else {
                return ValueNode.create(transformed);
            }
        }
    }

    @expr('unary')
    // @ts-ignore
    private _unary(expr: UnaryExpression, context: ExpressionTransformerContext) {
        // only '!' operator for now
        invariant(expr.op === '!', 'only "!" operator is supported');
        return logicalNot(this.dialect, this.transform(expr.operand, context));
    }

    @expr('call')
    // @ts-ignore
    private _call(expr: CallExpression, context: ExpressionTransformerContext) {
        const result = this.transformCall(expr, context);
        return result.toOperationNode();
    }

    private transformCall(expr: CallExpression, context: ExpressionTransformerContext) {
        const func = this.getFunctionImpl(expr.function);
        if (!func) {
            throw createUnsupportedError(`Function not implemented: ${expr.function}`);
        }
        return func(
            this.eb,
            (expr.args ?? []).map((arg) => this.transformCallArg(arg, context)),
            {
                client: this.client,
                dialect: this.dialect,
                model: context.thisType as GetModels<Schema>,
                modelAlias: context.alias ?? context.modelOrType,
                operation: context.operation,
            },
        );
    }

    private getFunctionImpl(functionName: string) {
        // check built-in functions
        let func = this.clientOptions.functions?.[functionName];
        if (!func) {
            // check plugins
            for (const plugin of this.clientOptions.plugins ?? []) {
                if (plugin.functions?.[functionName]) {
                    func = plugin.functions[functionName] as unknown as ZModelFunction<Schema>;
                    break;
                }
            }
        }
        return func;
    }

    private transformCallArg(arg: Expression, context: ExpressionTransformerContext): OperandExpression<any> {
        if (ExpressionUtils.isField(arg)) {
            // field references are passed as-is, without translating to joins, etc.
            return this.eb.ref(arg.field);
        } else {
            // If the argument contains an auth() access, signal that it should use the CTE
            // path so the function receives a proper SQL expression rather than a literal.
            const argContext = this.exprContainsAuthRef(arg) ? { ...context, authInFunctionArg: true } : context;
            return new ExpressionWrapper(this.transform(arg, argContext));
        }
    }

    @expr('member')
    // @ts-ignore
    private _member(expr: MemberExpression, context: ExpressionTransformerContext) {
        if (ExpressionUtils.isBinding(expr.receiver)) {
            // if the binding has a plain value in the scope, evaluate directly
            const scope = this.requireBindingScope(expr.receiver, context);
            if (scope.value !== undefined) {
                return this.valueMemberAccess(scope.value, expr, scope.type);
            }
        }

        // `auth()` member access — resolved via pre-built auth CTEs or value evaluation.
        if (this.isAuthCall(expr.receiver)) {
            return this.transformAuthMemberRef(expr, context);
        }

        // `before()` member access
        if (isBeforeInvocation(expr.receiver)) {
            // policy handler creates a join table named `$before` using entity value before update,
            // we can directly reference the column from there
            invariant(context.operation === 'post-update', 'before() can only be used in post-update policy');
            invariant(expr.members.length === 1, 'before() can only be followed by a scalar field access');
            return ReferenceNode.create(ColumnNode.create(expr.members[0]!), TableNode.create('$before'));
        }

        invariant(
            ExpressionUtils.isField(expr.receiver) ||
                ExpressionUtils.isThis(expr.receiver) ||
                ExpressionUtils.isBinding(expr.receiver),
            'expect receiver to be field expression, collection predicate binding, or "this"',
        );

        let members = expr.members;
        let receiver: OperationNode;
        let startType: string | undefined;
        const { memberFilter, memberSelect, ...restContext } = context;

        if (ExpressionUtils.isThis(expr.receiver)) {
            if (expr.members.length === 1) {
                // `this.relation` case, equivalent to field access
                return this._field(ExpressionUtils.field(expr.members[0]!), {
                    ...context,
                    alias: context.thisAlias,
                    modelOrType: context.thisType,
                    thisType: context.thisType,
                    contextValue: undefined,
                });
            } else {
                // transform the first segment into a relation access, then continue with the rest of the members
                const firstMemberFieldDef = QueryUtils.requireField(this.schema, context.thisType, expr.members[0]!);
                receiver = this.transformRelationAccess(expr.members[0]!, firstMemberFieldDef.type, restContext);
                members = expr.members.slice(1);
                // startType should be the type of the relation access
                startType = firstMemberFieldDef.type;
            }
        } else if (ExpressionUtils.isBinding(expr.receiver)) {
            if (expr.members.length === 1) {
                const bindingScope = this.requireBindingScope(expr.receiver, context);
                // `binding.relation` case, equivalent to field access
                return this._field(ExpressionUtils.field(expr.members[0]!), {
                    ...context,
                    modelOrType: bindingScope.type,
                    alias: bindingScope.alias,
                    thisType: context.thisType,
                    contextValue: undefined,
                });
            } else {
                // transform the first segment into a relation access, then continue with the rest of the members
                const bindingScope = this.requireBindingScope(expr.receiver, context);
                const firstMemberFieldDef = QueryUtils.requireField(this.schema, bindingScope.type, expr.members[0]!);
                receiver = this.transformRelationAccess(expr.members[0]!, firstMemberFieldDef.type, {
                    ...restContext,
                    modelOrType: bindingScope.type,
                    alias: bindingScope.alias,
                });
                members = expr.members.slice(1);
                // startType should be the type of the relation access
                startType = firstMemberFieldDef.type;
            }
        } else {
            receiver = this.transform(expr.receiver, restContext);
        }

        invariant(SelectQueryNode.is(receiver), 'expected receiver to be select query');

        if (startType === undefined) {
            if (ExpressionUtils.isField(expr.receiver)) {
                const receiverField = QueryUtils.requireField(this.schema, context.modelOrType, expr.receiver.field);
                startType = receiverField.type;
            } else {
                // "this." case - already handled above if members were sliced
                startType = context.thisType;
            }
        }

        // traverse forward to collect member types
        const memberFields: { fromModel: string; fieldDef: FieldDef }[] = [];
        let currType = startType;
        for (const member of members) {
            const fieldDef = QueryUtils.requireField(this.schema, currType, member);
            memberFields.push({ fieldDef, fromModel: currType });
            currType = fieldDef.type;
        }

        let currNode: SelectQueryNode | ColumnNode | ReferenceNode | undefined = undefined;

        for (let i = members.length - 1; i >= 0; i--) {
            const member = members[i]!;
            const { fieldDef, fromModel } = memberFields[i]!;

            if (fieldDef.relation) {
                const relation = this.transformRelationAccess(member, fieldDef.type, {
                    ...restContext,
                    modelOrType: fromModel,
                    alias: undefined,
                });

                if (currNode) {
                    currNode = {
                        ...relation,
                        selections: [
                            SelectionNode.create(AliasNode.create(currNode, IdentifierNode.create(members[i + 1]!))),
                        ],
                    };
                } else {
                    // inner most member, merge with member filter from the context
                    currNode = {
                        ...relation,
                        where: this.mergeWhere(relation.where, memberFilter),
                        selections: memberSelect ? [memberSelect] : relation.selections,
                    };
                }
            } else {
                invariant(i === members.length - 1, 'plain field access must be the last segment');
                invariant(!currNode, 'plain field access must be the last segment');

                currNode = ColumnNode.create(member);
            }
        }

        return {
            ...receiver,
            selections: [SelectionNode.create(AliasNode.create(currNode!, IdentifierNode.create('_')))],
        };
    }

    private requireBindingScope(expr: BindingExpression, context: ExpressionTransformerContext) {
        const binding = context.bindingScope?.[expr.name];
        invariant(binding, `binding not found: ${expr.name}`);
        return binding;
    }

    private valueMemberAccess(receiver: any, expr: MemberExpression, receiverType: string): OperationNode {
        if (!receiver) {
            return ValueNode.createImmediate(null);
        }

        invariant(expr.members.length > 0, 'member expression must have at least one member');

        let curr: any = receiver;
        let currType = receiverType;
        for (let i = 0; i < expr.members.length; i++) {
            const field = expr.members[i]!;
            curr = curr?.[field];
            if (curr === undefined) {
                curr = ValueNode.createImmediate(null);
                break;
            }
            currType = QueryUtils.requireField(this.schema, currType, field).type;
            if (i === expr.members.length - 1) {
                // last segment (which is the value), make sure it's transformed
                curr = this.transformValue(curr, currType as BuiltinType);
            }
        }
        return curr;
    }

    private transformRelationAccess(
        field: string,
        relationModel: string,
        context: ExpressionTransformerContext,
    ): SelectQueryNode {
        // Inside an auth CTE context: use the pre-built nested auth CTE instead of the
        // real DB table.  Rows are linked to the parent CTE via the synthetic FK columns.
        if (context.authCtePath !== undefined) {
            const childCtePath = [...context.authCtePath, field];
            const childCteName = authCteName(childCtePath);
            const parentCteName = authCteName(context.authCtePath);
            const condition = BinaryOperationNode.create(
                ReferenceNode.create(ColumnNode.create(AUTH_PARENT_ID_COL), TableNode.create(childCteName)),
                OperatorNode.create('='),
                ReferenceNode.create(ColumnNode.create(AUTH_ID_COL), TableNode.create(parentCteName)),
            );
            return {
                kind: 'SelectQueryNode',
                from: FromNode.create([TableNode.create(childCteName)]),
                where: WhereNode.create(condition),
            };
        }

        const m2m = QueryUtils.getManyToManyRelation(this.schema, context.modelOrType, field);
        if (m2m) {
            return this.transformManyToManyRelationAccess(m2m, context);
        }

        const fromModel = context.modelOrType;
        const relationFieldDef = QueryUtils.requireField(this.schema, fromModel, field);
        const { keyPairs, ownedByModel } = QueryUtils.getRelationForeignKeyFieldPairs(this.schema, fromModel, field);

        let condition: OperationNode;
        if (ownedByModel) {
            // `fromModel` owns the fk

            condition = conjunction(
                this.dialect,
                keyPairs.map(({ fk, pk }) => {
                    let fkRef: OperationNode = ReferenceNode.create(
                        ColumnNode.create(fk),
                        TableNode.create(context.alias ?? fromModel),
                    );
                    if (relationFieldDef.originModel && relationFieldDef.originModel !== fromModel) {
                        fkRef = this.buildDelegateBaseFieldSelect(
                            fromModel,
                            context.alias ?? fromModel,
                            fk,
                            relationFieldDef.originModel,
                        );
                    }
                    return BinaryOperationNode.create(
                        fkRef,
                        OperatorNode.create('='),
                        ReferenceNode.create(ColumnNode.create(pk), TableNode.create(relationModel)),
                    );
                }),
            );
        } else {
            // `relationModel` owns the fk
            condition = conjunction(
                this.dialect,
                keyPairs.map(({ fk, pk }) =>
                    BinaryOperationNode.create(
                        ReferenceNode.create(ColumnNode.create(pk), TableNode.create(context.alias ?? fromModel)),
                        OperatorNode.create('='),
                        ReferenceNode.create(ColumnNode.create(fk), TableNode.create(relationModel)),
                    ),
                ),
            );
        }

        return {
            kind: 'SelectQueryNode',
            from: FromNode.create([TableNode.create(relationModel)]),
            where: WhereNode.create(condition),
        };
    }

    private transformManyToManyRelationAccess(
        m2m: NonNullable<ReturnType<typeof QueryUtils.getManyToManyRelation>>,
        context: ExpressionTransformerContext,
    ) {
        const eb = expressionBuilder<any, any>();
        const relationQuery = eb
            .selectFrom(m2m.otherModel)
            // inner join with join table and additionally filter by the parent model
            .innerJoin(m2m.joinTable, (join) =>
                join
                    // relation model pk to join table fk
                    .onRef(`${m2m.otherModel}.${m2m.otherPKName}`, '=', `${m2m.joinTable}.${m2m.otherFkName}`)
                    // parent model pk to join table fk
                    .onRef(
                        `${m2m.joinTable}.${m2m.parentFkName}`,
                        '=',
                        `${context.alias ?? context.modelOrType}.${m2m.parentPKName}`,
                    ),
            );
        return relationQuery.toOperationNode();
    }

    private createColumnRef(column: string, context: ExpressionTransformerContext) {
        // if field comes from a delegate base model, we need to use the join alias
        // of that base model

        const tableName = context.alias ?? context.modelOrType;

        // "create" policies evaluate table from "VALUES" node so no join from delegate bases are
        // created and thus we should directly use the model table name
        if (context.operation === 'create') {
            return ReferenceNode.create(ColumnNode.create(column), TableNode.create(tableName));
        }

        const fieldDef = QueryUtils.requireField(this.schema, context.modelOrType, column);
        if (!fieldDef.originModel || fieldDef.originModel === context.modelOrType) {
            return ReferenceNode.create(ColumnNode.create(column), TableNode.create(tableName));
        }

        return this.buildDelegateBaseFieldSelect(context.modelOrType, tableName, column, fieldDef.originModel);
    }

    // convert transformer's binding scope to equivalent expression evaluator binding scope
    private getEvaluationBindingScope(scope?: BindingScope) {
        if (!scope) {
            return undefined;
        }

        const result: Record<string, any> = {};
        for (const [key, value] of Object.entries(scope)) {
            if (value.value !== undefined) {
                result[key] = value.value;
            }
        }

        return Object.keys(result).length > 0 ? result : undefined;
    }

    private buildDelegateBaseFieldSelect(model: string, modelAlias: string, field: string, baseModel: string) {
        const idFields = QueryUtils.requireIdFields(this.client.$schema, model);
        return {
            kind: 'SelectQueryNode',
            from: FromNode.create([TableNode.create(baseModel)]),
            selections: [
                SelectionNode.create(ReferenceNode.create(ColumnNode.create(field), TableNode.create(baseModel))),
            ],
            where: WhereNode.create(
                conjunction(
                    this.dialect,
                    idFields.map((idField) =>
                        BinaryOperationNode.create(
                            ReferenceNode.create(ColumnNode.create(idField), TableNode.create(baseModel)),
                            OperatorNode.create('='),
                            ReferenceNode.create(ColumnNode.create(idField), TableNode.create(modelAlias)),
                        ),
                    ),
                ),
            ),
        } satisfies SelectQueryNode;
    }

    private isAuthCall(value: unknown): value is CallExpression {
        return ExpressionUtils.isCall(value) && value.function === 'auth';
    }

    private isAuthMember(expr: Expression) {
        return ExpressionUtils.isMember(expr) && this.isAuthCall(expr.receiver);
    }

    private isNullNode(node: OperationNode) {
        return ValueNode.is(node) && node.value === null;
    }

    private buildLogicalNot(result: Expression): Expression {
        return ExpressionUtils.unary('!', result);
    }

    private buildAnd(conditions: BinaryExpression[]): Expression {
        if (conditions.length === 0) {
            return ExpressionUtils.literal(true);
        } else if (conditions.length === 1) {
            return conditions[0]!;
        } else {
            return conditions.reduce((acc, condition) => ExpressionUtils.binary(acc, '&&', condition));
        }
    }

    private isRelationField(expr: Expression, context: ExpressionTransformerContext) {
        const fieldDef = this.getFieldDefFromFieldRef(expr, context);
        return !!fieldDef?.relation;
    }

    private getFieldDefFromFieldRef(expr: Expression, context: ExpressionTransformerContext): FieldDef | undefined {
        // `this.foo` references belong to `thisType` (the outer model in collection-predicate
        // contexts); everything else uses `modelOrType`.
        const model =
            ExpressionUtils.isMember(expr) && ExpressionUtils.isThis(expr.receiver)
                ? context.thisType
                : context.modelOrType;
        if (ExpressionUtils.isField(expr)) {
            return QueryUtils.getField(this.schema, model, expr.field);
        } else if (
            ExpressionUtils.isMember(expr) &&
            expr.members.length === 1 &&
            ExpressionUtils.isThis(expr.receiver)
        ) {
            return QueryUtils.getField(this.schema, model, expr.members[0]!);
        } else if (ExpressionUtils.isMember(expr) && this.isAuthCall(expr.receiver)) {
            // auth().field or auth().relation.field — walk the auth type chain.
            let currType = this.authType;
            for (const member of expr.members) {
                const fieldDef = QueryUtils.getField(this.schema, currType, member);
                if (!fieldDef) return undefined;
                if (member === expr.members[expr.members.length - 1]) return fieldDef;
                currType = fieldDef.type;
            }
            return undefined;
        } else if (ExpressionUtils.isMember(expr) && ExpressionUtils.isField(expr.receiver)) {
            // relation chain access (e.g. `owner.id`, `user.profile.uuid_field`): walk the
            // relation hops and return the terminal field's FieldDef so native-type info
            // (@db.*) is available for casting in buildComparison
            const receiverDef = QueryUtils.getField(this.schema, model, expr.receiver.field);
            if (!receiverDef?.relation) return undefined;
            let currModel = receiverDef.type;
            for (let i = 0; i < expr.members.length - 1; i++) {
                const hopDef = QueryUtils.getField(this.schema, currModel, expr.members[i]!);
                if (!hopDef?.relation) return undefined;
                currModel = hopDef.type;
            }
            return QueryUtils.getField(this.schema, currModel, expr.members[expr.members.length - 1]!);
        } else {
            return undefined;
        }
    }
}

// ---------------------------------------------------------------------------
// Static analysis helpers — module-level (no class instance required)
// ---------------------------------------------------------------------------

function _isAuthCall(expr: Expression): boolean {
    return ExpressionUtils.isCall(expr) && expr.function === 'auth';
}

/**
 * Returns true if `expr` contains a reference to the context model row — i.e., a `this`
 * expression or a binding that is NOT in the `authBindings` set (meaning it refers to a DB
 * model row rather than an auth CTE element).
 *
 * `authBindings` tracks iterator names introduced by auth collection predicates so that
 * `auth().roles?[r, r.name == 'admin']` correctly identifies `r` as an auth binding (not
 * a context ref), and only `this.field` or outer DB-model bindings trigger CTE generation.
 */
function _containsContextRef(expr: Expression, authBindings: ReadonlySet<string>): boolean {
    if (ExpressionUtils.isThis(expr)) return true;
    if (ExpressionUtils.isBinding(expr)) {
        // A binding is a context ref only if it's NOT an auth collection iterator
        return !authBindings.has(expr.name);
    }
    if (ExpressionUtils.isMember(expr)) {
        if (ExpressionUtils.isThis(expr.receiver)) return true;
        if (ExpressionUtils.isBinding(expr.receiver)) {
            return !authBindings.has(expr.receiver.name);
        }
        return _containsContextRef(expr.receiver, authBindings);
    }
    if (ExpressionUtils.isBinary(expr)) {
        return _containsContextRef(expr.left, authBindings) || _containsContextRef(expr.right, authBindings);
    }
    if (ExpressionUtils.isUnary(expr)) return _containsContextRef(expr.operand, authBindings);
    if (ExpressionUtils.isCall(expr)) return (expr.args ?? []).some((a) => _containsContextRef(a, authBindings));
    return false;
}

/**
 * The built-in ZModel functions that the JS ExpressionEvaluator can handle.
 * Any call expression whose function name is NOT in this set requires the SQL/CTE
 * path because the evaluator will throw on unrecognised function names.
 */
const EVALUATOR_BUILTIN_FUNCTIONS = new Set(['auth']);

/**
 * Returns true if `expr` contains any function call that the JS ExpressionEvaluator
 * cannot handle (i.e. any call that is not a known built-in).
 * Used to force the CTE path for auth collection predicates whose body uses
 * ZModel functions such as `contains`, `hasEvery`, `isEmpty`, etc.
 */
export function containsNonEvaluatableCall(expr: Expression): boolean {
    if (ExpressionUtils.isCall(expr)) {
        if (!EVALUATOR_BUILTIN_FUNCTIONS.has(expr.function)) return true;
        return (expr.args ?? []).some(containsNonEvaluatableCall);
    }
    if (ExpressionUtils.isMember(expr)) return containsNonEvaluatableCall(expr.receiver);
    if (ExpressionUtils.isBinary(expr)) {
        return containsNonEvaluatableCall(expr.left) || containsNonEvaluatableCall(expr.right);
    }
    if (ExpressionUtils.isUnary(expr)) return containsNonEvaluatableCall(expr.operand);
    return false;
}

/**
 * Returns true if `expr` contains any `auth().<member>` access anywhere in its tree.
 */
function _containsAuthRef(expr: Expression): boolean {
    if (ExpressionUtils.isMember(expr) && _isAuthCall(expr.receiver)) return true;
    if (ExpressionUtils.isBinary(expr)) {
        return _containsAuthRef(expr.left) || _containsAuthRef(expr.right);
    }
    if (ExpressionUtils.isUnary(expr)) return _containsAuthRef(expr.operand);
    if (ExpressionUtils.isCall(expr) && !_isAuthCall(expr)) {
        return (expr.args ?? []).some(_containsAuthRef);
    }
    return false;
}

function _needsCte(expr: Expression, inFunctionArg: boolean, authBindings: ReadonlySet<string>): boolean {
    if (ExpressionUtils.isMember(expr)) {
        if (_isAuthCall(expr.receiver)) {
            // auth().X — needs CTE only when used as a function call argument
            return inFunctionArg;
        }
        return _needsCte(expr.receiver, inFunctionArg, authBindings);
    }
    if (ExpressionUtils.isBinary(expr)) {
        const op = expr.op;
        // Auth collection predicate: auth().X?[binding, rhs]
        if ((op === '?' || op === '!' || op === '^') && ExpressionUtils.isMember(expr.left)) {
            const lhs = expr.left as MemberExpression;
            if (_isAuthCall(lhs.receiver)) {
                // Register the iterator binding as an auth binding so the RHS analysis knows
                // that references to it are auth-CTE references, not context model references.
                const innerAuthBindings = expr.binding ? new Set([...authBindings, expr.binding]) : authBindings;
                // CTE needed when the predicate RHS references the context model OR
                // contains a non-builtin function call the JS evaluator cannot handle.
                return _containsContextRef(expr.right, innerAuthBindings) || containsNonEvaluatableCall(expr.right);
            }
        }
        return _needsCte(expr.left, inFunctionArg, authBindings) || _needsCte(expr.right, inFunctionArg, authBindings);
    }
    if (ExpressionUtils.isUnary(expr)) return _needsCte(expr.operand, inFunctionArg, authBindings);
    if (ExpressionUtils.isCall(expr)) {
        if (_isAuthCall(expr)) return false;
        // Function call: if any arg contains an auth().X reference, all those args need CTE
        if ((expr.args ?? []).some(_containsAuthRef)) return true;
        return (expr.args ?? []).some((a) => _needsCte(a, false, authBindings));
    }
    return false;
}

/**
 * Returns `true` if the given policy expression would require auth CTEs to be built.
 *
 * Auth CTEs are needed when the expression either:
 *  1. Contains an auth collection predicate (`auth().X?[rhs]`) whose RHS references
 *     the context model row (a `this` expression or a non-auth binding), requiring a
 *     SQL JOIN via auth CTEs rather than JS value evaluation, OR
 *  2. Contains an `auth().<field>` member reference inside a function-call argument,
 *     where the CTE is needed to produce a proper SQL column reference.
 */
export function expressionNeedsAuthCte(expr: Expression): boolean {
    return _needsCte(expr, false, new Set());
}
