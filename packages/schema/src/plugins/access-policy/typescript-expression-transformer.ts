import {
    ArrayExpr,
    Expression,
    InvocationExpr,
    LiteralExpr,
    MemberAccessExpr,
    NullExpr,
    ReferenceExpr,
    ThisExpr,
    isEnumField,
    isThisExpr,
} from '@zenstackhq/language/ast';
import { PluginError } from '@zenstackhq/sdk';
import { isFutureExpr } from './utils';

/**
 * Transforms ZModel expression to plain TypeScript expression.
 */
export default class TypeScriptExpressionTransformer {
    /**
     * Constructs a new TypeScriptExpressionTransformer.
     *
     * @param isPostGuard indicates if we're writing for post-update conditions
     */
    constructor(private readonly isPostGuard = false) {}

    /**
     *
     * @param expr
     * @returns
     */
    transform(expr: Expression): string {
        switch (expr.$type) {
            case LiteralExpr:
                return this.literal(expr as LiteralExpr);

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

            default:
                throw new PluginError(`Unsupported expression type: ${expr.$type}`);
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private this(expr: ThisExpr) {
        // "this" is mapped to id comparison
        return 'id';
    }

    private memberAccess(expr: MemberAccessExpr) {
        if (!expr.member.ref) {
            throw new PluginError(`Unresolved MemberAccessExpr`);
        }

        if (isThisExpr(expr.operand)) {
            return expr.member.ref.name;
        } else if (isFutureExpr(expr.operand)) {
            if (!this.isPostGuard) {
                throw new PluginError(`future() is only supported in postUpdate rules`);
            }
            return expr.member.ref.name;
        } else {
            return `${this.transform(expr.operand)}?.${expr.member.ref.name}`;
        }
    }

    private invocation(expr: InvocationExpr) {
        if (expr.function.ref?.name === 'auth') {
            return 'user';
        } else {
            throw new PluginError(`Function invocation is not supported: ${expr.function.ref?.name}`);
        }
    }

    private reference(expr: ReferenceExpr) {
        if (!expr.target.ref) {
            throw new PluginError(`Unresolved ReferenceExpr`);
        }

        if (isEnumField(expr.target.ref)) {
            return `${expr.target.ref.$container.name}.${expr.target.ref.name}`;
        } else {
            if (this.isPostGuard) {
                // if we're processing post-update, any direct field access should be
                // treated as access to context.preValue, which is entity's value before
                // the update
                return `context.preValue?.${expr.target.ref.name}`;
            } else {
                return expr.target.ref.name;
            }
        }
    }

    private null() {
        return 'null';
    }

    private array(expr: ArrayExpr) {
        return `[${expr.items.map((item) => this.transform(item)).join(', ')}]`;
    }

    private literal(expr: LiteralExpr) {
        if (typeof expr.value === 'string') {
            return `'${expr.value}'`;
        } else {
            return expr.value.toString();
        }
    }
}
