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
            return BinaryOperationNode.create(left, this.transformOperator(op), right);
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
        if (this.isRelationField(expr.left, context.modelOrType)) {
            invariant(ExpressionUtils.isNull(expr.right), 'only null comparison is supported for relation field');
            const leftRelDef = this.getFieldDefFromFieldRef(expr.left, context.modelOrType);
            invariant(leftRelDef, 'failed to get relation field definition');
            const idFields = QueryUtils.requireIdFields(this.schema, leftRelDef.type);
            normalizedLeft = this.makeOrAppendMember(normalizedLeft, idFields[0]!);
        }
        let normalizedRight: Expression = expr.right;
        if (this.isRelationField(expr.right, context.modelOrType)) {
            invariant(ExpressionUtils.isNull(expr.left), 'only null comparison is supported for relation field');
            const rightRelDef = this.getFieldDefFromFieldRef(expr.right, context.modelOrType);
            invariant(rightRelDef, 'failed to get relation field definition');
            const idFields = QueryUtils.requireIdFields(this.schema, rightRelDef.type);
            normalizedRight = this.makeOrAppendMember(normalizedRight, idFields[0]!);
        }
        return { normalizedLeft, normalizedRight };
    }

    private transformCollectionPredicate(expr: BinaryExpression, context: ExpressionTransformerContext) {
        this.ensureCollectionPredicateOperator(expr.op);

        if (this.isAuthMember(expr.left) || context.contextValue) {
            invariant(
                ExpressionUtils.isMember(expr.left) || ExpressionUtils.isField(expr.left),
                'expected member or field expression',
            );

            // LHS of the expression is evaluated as a value
            const evaluator = new ExpressionEvaluator();
            const receiver = evaluator.evaluate(expr.left, {
                thisValue: context.contextValue,
                auth: this.auth,
                bindingScope: this.getEvaluationBindingScope(context.bindingScope),
            });

            // get LHS's type
            const baseType = this.isAuthMember(expr.left) ? this.authType : context.modelOrType;
            const memberType = this.getMemberType(baseType, expr.left);

            // transform the entire expression with a value LHS and the correct context type
            return this.transformValueCollectionPredicate(receiver, expr, { ...context, modelOrType: memberType });
        }

        // otherwise, transform the expression with relation joins

        invariant(
            ExpressionUtils.isField(expr.left) || ExpressionUtils.isMember(expr.left),
            'left operand must be field or member access',
        );

        let newContextModel: string;
        const fieldDef = this.getFieldDefFromFieldRef(expr.left, context.modelOrType);
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

        const bindingScope = expr.binding
            ? {
                  ...(context.bindingScope ?? {}),
                  [expr.binding]: { type: newContextModel, alias: newContextModel },
              }
            : context.bindingScope;

        let predicateFilter = this.transform(expr.right, {
            ...context,
            modelOrType: newContextModel,
            alias: undefined,
            bindingScope: bindingScope,
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

    private transformOperator(op: Exclude<BinaryOperator, '?' | '!' | '^'>) {
        const mappedOp = match(op)
            .with('==', () => '=' as const)
            .otherwise(() => op);
        return OperatorNode.create(mappedOp);
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
                model: context.modelOrType as GetModels<Schema>,
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
            return new ExpressionWrapper(this.transform(arg, context));
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

        // `auth()` member access
        if (this.isAuthCall(expr.receiver)) {
            return this.valueMemberAccess(this.auth, expr, this.authType);
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

    private isRelationField(expr: Expression, model: string) {
        const fieldDef = this.getFieldDefFromFieldRef(expr, model);
        return !!fieldDef?.relation;
    }

    private getFieldDefFromFieldRef(expr: Expression, model: string): FieldDef | undefined {
        if (ExpressionUtils.isField(expr)) {
            return QueryUtils.getField(this.schema, model, expr.field);
        } else if (
            ExpressionUtils.isMember(expr) &&
            expr.members.length === 1 &&
            ExpressionUtils.isThis(expr.receiver)
        ) {
            return QueryUtils.getField(this.schema, model, expr.members[0]!);
        } else {
            return undefined;
        }
    }
}
