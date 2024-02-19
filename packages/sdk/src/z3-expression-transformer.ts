import {
    ArrayExpr,
    BinaryExpr,
    BooleanLiteral,
    // DataModel,
    Expression,
    InvocationExpr,
    isBooleanLiteral,
    isDataModel,
    isEnumField,
    isMemberAccessExpr,
    isNullExpr,
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
import { getLiteral, isAuthInvocation, isFromStdlib, isFutureExpr } from './utils';

export class Z3ExpressionTransformerError extends Error {
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
 * Transforms ZModel expression to Z3 assertion.
 */
export class Z3ExpressionTransformer {
    /**
     * Constructs a new Z3ExpressionTransformer.
     *
     * @param isPostGuard indicates if we're writing for post-update conditions
     */
    constructor(private readonly options: Options) {}

    /**
     * Transforms the given expression to a TypeScript expression.
     * @returns
     */
    transform(expr: Expression): string {
        switch (expr.$type) {
            case StringLiteral:
            case NumberLiteral:
                return this.literal(expr as LiteralExpr);

            case BooleanLiteral:
                return this.boolean(expr as BooleanLiteral);

            case ArrayExpr:
                return this.array(expr as ArrayExpr);

            case NullExpr:
                return this.null();

            case ThisExpr:
                return this.this(expr as ThisExpr);

            case ReferenceExpr:
                return this.reference(expr as ReferenceExpr);

            case InvocationExpr:
                return this.invocation(expr as InvocationExpr);

            case MemberAccessExpr:
                return this.memberAccess(expr as MemberAccessExpr);

            case UnaryExpr:
                return this.unary(expr as UnaryExpr);

            case BinaryExpr:
                // eslint-disable-next-line no-case-declarations
                const assertion = this.binary(expr as BinaryExpr);
                if (['&&', '||'].includes(expr.operator)) return assertion;
                // eslint-disable-next-line no-case-declarations
                const checkString =
                    expr.left.$type === 'ReferenceExpr' && expr.right.$type === 'StringLiteral'
                        ? { [expr.left.target.ref?.name ?? '']: expr.right.value }
                        : {};
                if (Object.keys(checkString).length > 0) {
                    return `z3.And(${assertion}, buildAssertion(z3, variables, args, user, ${JSON.stringify(
                        checkString
                    )}))`;
                }
                return assertion;

            default:
                throw new Z3ExpressionTransformerError(`Unsupported expression type: ${expr.$type}`);
        }
    }

    private this(_expr: ThisExpr) {
        // "this" is mapped to the input argument
        return this.options.thisExprContext ?? 'input';
    }

    private memberAccess(expr: MemberAccessExpr) {
        if (!expr.member.ref) {
            throw new Z3ExpressionTransformerError(`Unresolved MemberAccessExpr`);
        }

        if (isThisExpr(expr.operand)) {
            return expr.member.ref.name;
        } else if (isFutureExpr(expr.operand)) {
            if (this.options?.isPostGuard !== true) {
                throw new Z3ExpressionTransformerError(`future() is only supported in postUpdate rules`);
            }
            return expr.member.ref.name;
        } else {
            return `${this.transform(expr.operand)}?.${expr.member.ref.name}`;
        }
    }

    private invocation(expr: InvocationExpr) {
        if (!expr.function.ref) {
            throw new Z3ExpressionTransformerError(`Unresolved InvocationExpr`);
        }

        const funcName = expr.function.ref.name;
        const isStdFunc = isFromStdlib(expr.function.ref);

        if (!isStdFunc) {
            throw new Z3ExpressionTransformerError('User-defined functions are not supported yet');
        }

        const handler = functionHandlers.get(funcName);
        if (!handler) {
            throw new Z3ExpressionTransformerError(`Unsupported function: ${funcName}`);
        }

        const args = expr.args.map((arg) => arg.value);
        return handler.value.call(this, args);
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
        const field = this.transform(args[0]);
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
    private _contains(args: Expression[]) {
        const field = this.transform(args[0]);
        const caseInsensitive = getLiteral<boolean>(args[2]) === true;
        let result: string;
        if (caseInsensitive) {
            result = `${field}?.toLowerCase().includes(${this.transform(args[1])}?.toLowerCase())`;
        } else {
            result = `${field}?.includes(${this.transform(args[1])})`;
        }
        return this.ensureBoolean(result);
    }

    @func('startsWith')
    private _startsWith(args: Expression[]) {
        const field = this.transform(args[0]);
        const result = `${field}?.startsWith(${this.transform(args[1])})`;
        return this.ensureBoolean(result);
    }

    @func('endsWith')
    private _endsWith(args: Expression[]) {
        const field = this.transform(args[0]);
        const result = `${field}?.endsWith(${this.transform(args[1])})`;
        return this.ensureBoolean(result);
    }

    @func('regex')
    private _regex(args: Expression[]) {
        const field = this.transform(args[0]);
        const pattern = getLiteral<string>(args[1]);
        return `new RegExp(${JSON.stringify(pattern)}).test(${field})`;
    }

    @func('email')
    private _email(args: Expression[]) {
        const field = this.transform(args[0]);
        return `z.string().email().safeParse(${field}).success`;
    }

    @func('datetime')
    private _datetime(args: Expression[]) {
        const field = this.transform(args[0]);
        return `z.string().datetime({ offset: true }).safeParse(${field}).success`;
    }

    @func('url')
    private _url(args: Expression[]) {
        const field = this.transform(args[0]);
        return `z.string().url().safeParse(${field}).success`;
    }

    @func('has')
    private _has(args: Expression[]) {
        const field = this.transform(args[0]);
        const result = `${field}?.includes(${this.transform(args[1])})`;
        return this.ensureBoolean(result);
    }

    @func('hasEvery')
    private _hasEvery(args: Expression[]) {
        const field = this.transform(args[0]);
        const result = `${this.transform(args[1])}?.every((item) => ${field}?.includes(item))`;
        return this.ensureBoolean(result);
    }

    @func('hasSome')
    private _hasSome(args: Expression[]) {
        const field = this.transform(args[0]);
        const result = `${this.transform(args[1])}?.some((item) => ${field}?.includes(item))`;
        return this.ensureBoolean(result);
    }

    @func('isEmpty')
    private _isEmpty(args: Expression[]) {
        const field = this.transform(args[0]);
        const result = `(!${field} || ${field}?.length === 0)`;
        return this.ensureBoolean(result);
    }

    private ensureBoolean(expr: string) {
        return `(${expr} ?? false)`;
    }

    // #endregion

    private reference(expr: ReferenceExpr) {
        if (!expr.target.ref) {
            throw new Z3ExpressionTransformerError(`Unresolved ReferenceExpr`);
        }

        if (isEnumField(expr.target.ref)) {
            return `${expr.target.ref.$container.name}.${expr.target.ref.name}`;
        } else {
            // const formattedName = `${lowerCaseFirst(expr.target.ref.$container.name)}${upperCaseFirst(
            //     expr.target.ref.name
            // )}`;
            return `_${expr.target.ref.name}`;
        }
    }

    private null() {
        return 'undefined';
    }

    private array(expr: ArrayExpr) {
        return `[${expr.items.map((item) => this.transform(item)).join(', ')}]`;
    }

    private literal(expr: LiteralExpr) {
        if (expr.$type === StringLiteral) {
            return `'${expr.value}'`;
        } else {
            return expr.value.toString();
        }
    }

    private boolean(expr: BooleanLiteral) {
        return `z3.Bool.val(${expr.value})`;
    }

    private unary(expr: UnaryExpr): string {
        if (expr.operator !== '!') {
            throw new Z3ExpressionTransformerError(`Unsupported unary operator: ${expr.operator}`);
        }
        return `z3.Not(${this.transform(expr.operand)})`;
    }

    private isModelType(expr: Expression) {
        return isDataModel(expr.$resolvedType?.decl);
    }

    private binary(expr: BinaryExpr): string {
        if (/* expr.left.$type === 'ReferenceExpr' &&  */ expr.right.$type === 'StringLiteral') return 'true';

        let left = this.transform(expr.left);
        let right = isBooleanLiteral(expr.right) ? `${expr.right.value}` : this.transform(expr.right);

        // TODO: improve handling of null expressions
        if (isNullExpr(expr.right)) {
            return `${this.withArgs(left)} ${expr.operator} ${right}`;
        }

        // if (isMemberAccessExpr(expr.left) && !isAuthInvocation(expr.left)) {
        // left = `args.${left}`;
        // }
        // if (isMemberAccessExpr(expr.right) && !isAuthInvocation(expr.right)) {
        // right = `args.${right}`;
        // }
        // if (this.isModelType(expr.left)) {
        //     left = `(${left}.id)`;
        // }
        // if (this.isModelType(expr.right)) {
        //     right = `(${right}.id)`;
        // }
        if (this.isModelType(expr.left) && this.isModelType(expr.right)) {
            // comparison between model type values, map to id comparison
            left = isAuthInvocation(expr.left)
                ? `(${left}?.id)`
                : `((${this.withArgs(left)}?.id || ${this.withArgs(left)}Id))`;
            right = isAuthInvocation(expr.right)
                ? `(${right}?.id)`
                : `((${this.withArgs(right)}?.id || ${this.withArgs(right)}Id))`;
            let assertion = `${left} ${expr.operator} ${right}`;

            // only args values need implies
            if (isAuthInvocation(expr.left) && (isMemberAccessExpr(expr.right) || this.isModelType(expr.right))) {
                assertion = `z3.Implies(!!${right}, ${assertion})`;
            }
            if (isAuthInvocation(expr.right) && (isMemberAccessExpr(expr.left) || this.isModelType(expr.left))) {
                assertion = `z3.Implies(!!${left}, ${assertion})`;
            }
            // TODO: handle strict equality comparison (===, !==, etc.)
            return this.withAuth(expr, assertion);
        }

        if (isAuthInvocation(expr.left) || isAuthInvocation(expr.right)) {
            left = isAuthInvocation(expr.left) ? `(${left}?.id)` : left;
            right = isAuthInvocation(expr.right) ? `(${right}.id)` : right;
            const assertion = `${left} ${expr.operator} ${right}`;
            if (this.needAuthCheck(expr)) {
                return this.withAuth(expr, assertion);
            }
            return assertion;
        }

        // auth().string compared to string argument
        // TODO: for other type we could want to add a constraint to the auth model => we have to create a variable for it
        if (this.isAuthComparison(left, right)) {
            left =
                isMemberAccessExpr(expr.left) && !this.isAuthMemberAccessExpr(expr.left, left)
                    ? `${this.withArgs(left)}`
                    : left;
            right =
                isMemberAccessExpr(expr.right) && !this.isAuthMemberAccessExpr(expr.right, right)
                    ? `${this.withArgs(right)}`
                    : right;
            let assertion = `${left} ${expr.operator} ${right}`;
            if (this.isAuthMemberAccessExpr(expr.left, left)) {
                assertion = `z3.Implies(!!${right}, ${assertion})`;
            } else if (this.isAuthMemberAccessExpr(expr.right, right)) {
                assertion = `z3.Implies(!!${left}, ${assertion})`;
            }
            return this.withAuth(expr, assertion, true);
        }

        const _default = `(${left} ${expr.operator} ${right})`;

        // if (expr.left.$type === 'ReferenceExpr') {
        //     left = `${lowerCaseFirst(expr.left.target.ref?.$container.name ?? '')}${upperCaseFirst(
        //         expr.left.target?.ref?.name ?? ''
        //     )}`;
        // }

        return (
            match(expr.operator)
                .with('||', () => `z3.Or(${left}, ${right})`)
                .with('&&', () => `z3.And(${left}, ${right})`)
                .with('==', () => `${left}.eq(${right})`)
                .with('!=', () => `${left}.neq(${right})`)
                .with('<', () => `${left}.lt(${right})`)
                .with('<=', () => `${left}.le(${right})`)
                .with('>', () => `${left}.gt(${right})`)
                .with('>=', () => `${left}.ge(${right})`)
                .with('in', () => `(${this.transform(expr.right)}?.includes(${this.transform(expr.left)}) ?? false)`)
                // .with(P.union('==', '!='), () => {
                //     if (isThisExpr(expr.left) || isThisExpr(expr.right)) {
                //         // map equality comparison with `this` to id comparison
                //         const _this = isThisExpr(expr.left) ? expr.left : expr.right;
                //         const model = _this.$resolvedType?.decl as DataModel;
                //         const idFields = getIdFields(model);
                //         if (!idFields || idFields.length === 0) {
                //             throw new Z3ExpressionTransformerError(`model "${model.name}" does not have an id field`);
                //         }
                //         let result = `allFieldsEqual(${this.transform(expr.left, false)},
                //     ${this.transform(expr.right, false)}, [${idFields.map((f) => "'" + f.name + "'").join(', ')}])`;
                //         if (expr.operator === '!=') {
                //             result = `!${result}`;
                //         }
                //         return result;
                //     } else {
                //         return _default;
                //     }
                // })
                .with(P.union('?', '!', '^'), (op) => this.collectionPredicate(expr, op))
                .otherwise(() => _default)
        );
    }

    private collectionPredicate(expr: BinaryExpr, operator: '?' | '!' | '^') {
        const operand = this.transform(expr.left);
        const innerTransformer = new Z3ExpressionTransformer({
            ...this.options,
            isPostGuard: false,
            fieldReferenceContext: '_item',
            thisExprContext: '_item',
        });
        const predicate = innerTransformer.transform(expr.right);

        return match(operator)
            .with('?', () => `!!((${operand})?.some((_item: any) => ${predicate}))`)
            .with('!', () => `!!((${operand})?.every((_item: any) => ${predicate}))`)
            .with('^', () => `!((${operand})?.some((_item: any) => ${predicate}))`)
            .exhaustive();
    }

    private needAuthCheck(expr: BinaryExpr) {
        return (
            (isAuthInvocation(expr.left) && !(isNullExpr(expr.right) && expr.operator === '==')) ||
            isAuthInvocation(expr.right)
        );
    }

    private withAuth(expr: BinaryExpr, assertion: string, forceAuth = false) {
        if (this.needAuthCheck(expr) || forceAuth) {
            return `z3.And(${assertion}, _withAuth)`;
        }
        return assertion;
    }

    private withArgs(str: string) {
        if (str.startsWith('_')) {
            str = str.substring(1);
        }
        return `args.${str}`;
    }

    // private isAuthProperty(expr: Expression) {
    //     return isMemberAccessExpr(expr) && expr.member.ref?.$container.name === 'User'; // TODO: how to get auth model name?
    // }

    private isAuthMemberAccessExpr(expr: Expression, transformedExpr: string) {
        return isMemberAccessExpr(expr) && transformedExpr.startsWith('user?.');
    }

    private isAuthComparison(left: string, right: string) {
        return left.startsWith('user?.') || right.startsWith('user?.');
    }

    // private getModelFromMemberAccess(expr: MemberAccessExpr) {
    // return expr.member.;
    // }
}

// false :
// const age = Z3.Int.const('age');
// const assertion = Z3.And(
// Z3.Not(age.gt(18)),
// Z3.Not(age.lt(60))
// );
// Z3.solve(assertion);

// true :
// const age = Z3.Int.const('age');
// const assertion = Z3.Not(Z3.And(
// age.gt(18), age.lt(60)
// ));
// Z3.solve(assertion);
