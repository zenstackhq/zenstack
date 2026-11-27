import type {
    ArrayExpression,
    BinaryExpression,
    BinaryOperator,
    BindingExpression,
    CallExpression,
    EnumValueExpression,
    Expression,
    FieldExpression,
    LiteralExpression,
    MemberExpression,
    NullExpression,
    ThisExpression,
    UnaryExpression,
    UnaryOperator,
} from './expression';

/**
 * Utility functions to create and work with Expression objects
 */
export const ExpressionUtils = {
    literal: (value: string | number | boolean): LiteralExpression => {
        return { kind: 'literal', value };
    },

    enum: (type: string, value: string): EnumValueExpression => {
        return { kind: 'enum', type, value };
    },

    array: (type: string, items: Expression[]): ArrayExpression => {
        return { kind: 'array', type, items };
    },

    call: (functionName: string, args?: Expression[]): CallExpression => {
        return { kind: 'call', function: functionName, args };
    },

    binary: (left: Expression, op: BinaryOperator, right: Expression, binding?: string): BinaryExpression => {
        return { kind: 'binary', op, left, right, binding };
    },

    unary: (op: UnaryOperator, operand: Expression): UnaryExpression => {
        return { kind: 'unary', op, operand };
    },

    field: (field: string): FieldExpression => {
        return { kind: 'field', field };
    },

    member: (receiver: Expression, members: string[]): MemberExpression => {
        return { kind: 'member', receiver: receiver, members };
    },

    binding: (name: string): BindingExpression => {
        return { kind: 'binding', name };
    },

    _this: (): ThisExpression => {
        return { kind: 'this' };
    },

    _null: (): NullExpression => {
        return { kind: 'null' };
    },

    and: (expr: Expression, ...expressions: Expression[]) => {
        return expressions.reduce((acc, exp) => ExpressionUtils.binary(acc, '&&', exp), expr);
    },

    or: (expr: Expression, ...expressions: Expression[]) => {
        return expressions.reduce((acc, exp) => ExpressionUtils.binary(acc, '||', exp), expr);
    },

    not: (expr: Expression) => {
        return ExpressionUtils.unary('!', expr);
    },

    is: (value: unknown, kind: Expression['kind']): value is Expression => {
        return !!value && typeof value === 'object' && 'kind' in value && value.kind === kind;
    },

    isLiteral: (value: unknown): value is LiteralExpression => ExpressionUtils.is(value, 'literal'),

    isEnum: (value: unknown): value is EnumValueExpression => ExpressionUtils.is(value, 'enum'),

    isArray: (value: unknown): value is ArrayExpression => ExpressionUtils.is(value, 'array'),

    isCall: (value: unknown): value is CallExpression => ExpressionUtils.is(value, 'call'),

    isNull: (value: unknown): value is NullExpression => ExpressionUtils.is(value, 'null'),

    isThis: (value: unknown): value is ThisExpression => ExpressionUtils.is(value, 'this'),

    isUnary: (value: unknown): value is UnaryExpression => ExpressionUtils.is(value, 'unary'),

    isBinary: (value: unknown): value is BinaryExpression => ExpressionUtils.is(value, 'binary'),

    isField: (value: unknown): value is FieldExpression => ExpressionUtils.is(value, 'field'),

    isMember: (value: unknown): value is MemberExpression => ExpressionUtils.is(value, 'member'),

    isBinding: (value: unknown): value is BindingExpression => ExpressionUtils.is(value, 'binding'),

    getLiteralValue: (expr: Expression): string | number | boolean | undefined => {
        return ExpressionUtils.isLiteral(expr) ? expr.value : undefined;
    },
};
