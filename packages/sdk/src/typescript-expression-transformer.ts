import {
    ArrayExpr,
    BinaryExpr,
    BooleanLiteral,
    DataModel,
    Expression,
    InvocationExpr,
    isDataModel,
    isEnumField,
    isThisExpr,
    LiteralExpr,
    MemberAccessExpr,
    NullExpr,
    NumberLiteral,
    ReferenceExpr,
    StringLiteral,
    ThisExpr,
    UnaryExpr,
} from '@zenstackhq/language/ast';
import { match, P } from 'ts-pattern';
import { ExpressionContext } from './constants';
import { getIdFields, getLiteral, isFromStdlib, isFutureExpr } from './utils';

export class TypeScriptExpressionTransformerError extends Error {
    constructor(message: string) {
        super(message);
    }
}

type Options = {
    isPostGuard?: boolean;
    fieldReferenceContext?: string;
    thisExprContext?: string;
    context: ExpressionContext;
};

// a registry of function handlers marked with @func
const functionHandlers = new Map<string, PropertyDescriptor>();

// function handler decorator
function func(name: string) {
    return function (target: unknown, propertyKey: string, descriptor: PropertyDescriptor) {
        if (!functionHandlers.get(name)) {
            functionHandlers.set(name, descriptor);
        }
        return descriptor;
    };
}

/**
 * Transforms ZModel expression to plain TypeScript expression.
 */
export class TypeScriptExpressionTransformer {
    /**
     * Constructs a new TypeScriptExpressionTransformer.
     *
     * @param isPostGuard indicates if we're writing for post-update conditions
     */
    constructor(private readonly options: Options) {}

    /**
     * Transforms the given expression to a TypeScript expression.
     * @param normalizeUndefined if undefined values should be normalized to null
     * @returns
     */
    transform(expr: Expression, normalizeUndefined = true): string {
        switch (expr.$type) {
            case StringLiteral:
            case NumberLiteral:
            case BooleanLiteral:
                return this.literal(expr as LiteralExpr);

            case ArrayExpr:
                return this.array(expr as ArrayExpr, normalizeUndefined);

            case NullExpr:
                return this.null();

            case ThisExpr:
                return this.this(expr as ThisExpr);

            case ReferenceExpr:
                return this.reference(expr as ReferenceExpr);

            case InvocationExpr:
                return this.invocation(expr as InvocationExpr, normalizeUndefined);

            case MemberAccessExpr:
                return this.memberAccess(expr as MemberAccessExpr, normalizeUndefined);

            case UnaryExpr:
                return this.unary(expr as UnaryExpr, normalizeUndefined);

            case BinaryExpr:
                return this.binary(expr as BinaryExpr, normalizeUndefined);

            default:
                throw new TypeScriptExpressionTransformerError(`Unsupported expression type: ${expr.$type}`);
        }
    }

    private this(_expr: ThisExpr) {
        // "this" is mapped to the input argument
        return this.options.thisExprContext ?? 'input';
    }

    private memberAccess(expr: MemberAccessExpr, normalizeUndefined: boolean) {
        if (!expr.member.ref) {
            throw new TypeScriptExpressionTransformerError(`Unresolved MemberAccessExpr`);
        }

        if (isThisExpr(expr.operand)) {
            return expr.member.ref.name;
        } else if (isFutureExpr(expr.operand)) {
            if (this.options?.isPostGuard !== true) {
                throw new TypeScriptExpressionTransformerError(`future() is only supported in postUpdate rules`);
            }
            return expr.member.ref.name;
        } else {
            if (normalizeUndefined) {
                // normalize field access to null instead of undefined to avoid accidentally use undefined in filter
                return `(${this.transform(expr.operand, normalizeUndefined)}?.${expr.member.ref.name} ?? null)`;
            } else {
                return `${this.transform(expr.operand, normalizeUndefined)}?.${expr.member.ref.name}`;
            }
        }
    }

    private invocation(expr: InvocationExpr, normalizeUndefined: boolean) {
        if (!expr.function.ref) {
            throw new TypeScriptExpressionTransformerError(`Unresolved InvocationExpr`);
        }

        const funcName = expr.function.ref.name;
        const isStdFunc = isFromStdlib(expr.function.ref);

        if (!isStdFunc) {
            throw new TypeScriptExpressionTransformerError('User-defined functions are not supported yet');
        }

        const handler = functionHandlers.get(funcName);
        if (!handler) {
            throw new TypeScriptExpressionTransformerError(`Unsupported function: ${funcName}`);
        }

        const args = expr.args.map((arg) => arg.value);
        return handler.value.call(this, args, normalizeUndefined);
    }

    // #region function invocation handlers

    // arguments have been type-checked

    @func('auth')
    private _auth() {
        return 'user';
    }

    @func('now')
    private _now() {
        return `(new Date())`;
    }

    @func('length')
    private _length(args: Expression[]) {
        const field = this.transform(args[0], false);
        const min = getLiteral<number>(args[1]);
        const max = getLiteral<number>(args[2]);
        let result: string;
        if (min === undefined) {
            result = `(${field}?.length > 0)`;
        } else if (max === undefined) {
            result = `(${field}?.length >= ${min})`;
        } else {
            result = `(${field}?.length >= ${min} && ${field}?.length <= ${max})`;
        }
        return this.ensureBoolean(result);
    }

    @func('contains')
    private _contains(args: Expression[], normalizeUndefined: boolean) {
        const field = this.transform(args[0], false);
        const caseInsensitive = getLiteral<boolean>(args[2]) === true;
        let result: string;
        if (caseInsensitive) {
            result = `${field}?.toLowerCase().includes(${this.transform(args[1], normalizeUndefined)}?.toLowerCase())`;
        } else {
            result = `${field}?.includes(${this.transform(args[1], normalizeUndefined)})`;
        }
        return this.ensureBoolean(result);
    }

    @func('startsWith')
    private _startsWith(args: Expression[], normalizeUndefined: boolean) {
        const field = this.transform(args[0], false);
        const result = `${field}?.startsWith(${this.transform(args[1], normalizeUndefined)})`;
        return this.ensureBoolean(result);
    }

    @func('endsWith')
    private _endsWith(args: Expression[], normalizeUndefined: boolean) {
        const field = this.transform(args[0], false);
        const result = `${field}?.endsWith(${this.transform(args[1], normalizeUndefined)})`;
        return this.ensureBoolean(result);
    }

    @func('regex')
    private _regex(args: Expression[]) {
        const field = this.transform(args[0], false);
        const pattern = getLiteral<string>(args[1]);
        return `new RegExp(${JSON.stringify(pattern)}).test(${field})`;
    }

    @func('email')
    private _email(args: Expression[]) {
        const field = this.transform(args[0], false);
        return `z.string().email().safeParse(${field}).success`;
    }

    @func('datetime')
    private _datetime(args: Expression[]) {
        const field = this.transform(args[0], false);
        return `z.string().datetime({ offset: true }).safeParse(${field}).success`;
    }

    @func('url')
    private _url(args: Expression[]) {
        const field = this.transform(args[0], false);
        return `z.string().url().safeParse(${field}).success`;
    }

    @func('has')
    private _has(args: Expression[], normalizeUndefined: boolean) {
        const field = this.transform(args[0], false);
        const result = `${field}?.includes(${this.transform(args[1], normalizeUndefined)})`;
        return this.ensureBoolean(result);
    }

    @func('hasEvery')
    private _hasEvery(args: Expression[], normalizeUndefined: boolean) {
        const field = this.transform(args[0], false);
        const result = `${this.transform(args[1], normalizeUndefined)}?.every((item) => ${field}?.includes(item))`;
        return this.ensureBoolean(result);
    }

    @func('hasSome')
    private _hasSome(args: Expression[], normalizeUndefined: boolean) {
        const field = this.transform(args[0], false);
        const result = `${this.transform(args[1], normalizeUndefined)}?.some((item) => ${field}?.includes(item))`;
        return this.ensureBoolean(result);
    }

    @func('isEmpty')
    private _isEmpty(args: Expression[]) {
        const field = this.transform(args[0], false);
        const result = `(!${field} || ${field}?.length === 0)`;
        return this.ensureBoolean(result);
    }

    private ensureBoolean(expr: string) {
        return `(${expr} ?? false)`;
    }

    // #endregion

    private reference(expr: ReferenceExpr) {
        if (!expr.target.ref) {
            throw new TypeScriptExpressionTransformerError(`Unresolved ReferenceExpr`);
        }

        if (isEnumField(expr.target.ref)) {
            return `${expr.target.ref.$container.name}.${expr.target.ref.name}`;
        } else {
            if (this.options?.isPostGuard) {
                // if we're processing post-update, any direct field access should be
                // treated as access to context.preValue, which is entity's value before
                // the update
                return `context.preValue?.${expr.target.ref.name}`;
            } else {
                return this.options?.fieldReferenceContext
                    ? `${this.options.fieldReferenceContext}?.${expr.target.ref.name}`
                    : expr.target.ref.name;
            }
        }
    }

    private null() {
        return 'null';
    }

    private array(expr: ArrayExpr, normalizeUndefined: boolean) {
        return `[${expr.items.map((item) => this.transform(item, normalizeUndefined)).join(', ')}]`;
    }

    private literal(expr: LiteralExpr) {
        if (expr.$type === StringLiteral) {
            return `'${expr.value}'`;
        } else {
            return expr.value.toString();
        }
    }

    private unary(expr: UnaryExpr, normalizeUndefined: boolean): string {
        return `(${expr.operator} ${this.transform(expr.operand, normalizeUndefined)})`;
    }

    private isModelType(expr: Expression) {
        return isDataModel(expr.$resolvedType?.decl);
    }

    private binary(expr: BinaryExpr, normalizeUndefined: boolean): string {
        let left = this.transform(expr.left, normalizeUndefined);
        let right = this.transform(expr.right, normalizeUndefined);
        if (this.isModelType(expr.left) && this.isModelType(expr.right)) {
            // comparison between model type values, map to id comparison
            left = `(${left}?.id ?? null)`;
            right = `(${right}?.id ?? null)`;
        }
        const _default = `(${left} ${expr.operator} ${right})`;

        return match(expr.operator)
            .with(
                'in',
                () =>
                    `(${this.transform(expr.right, false)}?.includes(${this.transform(
                        expr.left,
                        normalizeUndefined
                    )}) ?? false)`
            )
            .with(P.union('==', '!='), () => {
                if (isThisExpr(expr.left) || isThisExpr(expr.right)) {
                    // map equality comparison with `this` to id comparison
                    const _this = isThisExpr(expr.left) ? expr.left : expr.right;
                    const model = _this.$resolvedType?.decl as DataModel;
                    const idFields = getIdFields(model);
                    if (!idFields || idFields.length === 0) {
                        throw new TypeScriptExpressionTransformerError(
                            `model "${model.name}" does not have an id field`
                        );
                    }
                    let result = `allFieldsEqual(${this.transform(expr.left, false)}, 
                ${this.transform(expr.right, false)}, [${idFields.map((f) => "'" + f.name + "'").join(', ')}])`;
                    if (expr.operator === '!=') {
                        result = `!${result}`;
                    }
                    return result;
                } else {
                    return _default;
                }
            })
            .with(P.union('?', '!', '^'), (op) => this.collectionPredicate(expr, op, normalizeUndefined))
            .otherwise(() => _default);
    }

    private collectionPredicate(expr: BinaryExpr, operator: '?' | '!' | '^', normalizeUndefined: boolean) {
        const operand = this.transform(expr.left, normalizeUndefined);
        const innerTransformer = new TypeScriptExpressionTransformer({
            ...this.options,
            isPostGuard: false,
            fieldReferenceContext: '_item',
            thisExprContext: '_item',
        });
        const predicate = innerTransformer.transform(expr.right, normalizeUndefined);

        return match(operator)
            .with('?', () => `!!((${operand})?.some((_item: any) => ${predicate}))`)
            .with('!', () => `!!((${operand})?.every((_item: any) => ${predicate}))`)
            .with('^', () => `!((${operand})?.some((_item: any) => ${predicate}))`)
            .exhaustive();
    }
}
