import {
    ArrayExpr,
    BinaryExpr,
    Expression,
    InvocationExpr,
    isEnumField,
    isThisExpr,
    LiteralExpr,
    MemberAccessExpr,
    NullExpr,
    ReferenceExpr,
    ThisExpr,
    UnaryExpr,
} from '@zenstackhq/language/ast';
import { getLiteral, PluginError } from '@zenstackhq/sdk';
import { FILTER_OPERATOR_FUNCTIONS } from '../../language-server/constants';
import { isAuthInvocation } from '../../utils/ast-utils';
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

            case UnaryExpr:
                return this.unary(expr as UnaryExpr);

            case BinaryExpr:
                return this.binary(expr as BinaryExpr);

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
            // normalize field access to null instead of undefined to avoid accidentally use undefined in filter
            return `(${this.transform(expr.operand)}?.${expr.member.ref.name} ?? null)`;
        }
    }

    private invocation(expr: InvocationExpr) {
        if (!expr.function.ref) {
            throw new PluginError(`Unresolved InvocationExpr`);
        }

        if (isAuthInvocation(expr)) {
            return 'user';
        } else if (FILTER_OPERATOR_FUNCTIONS.includes(expr.function.ref.name)) {
            // arguments are already type-checked

            const arg0 = this.transform(expr.args[0].value);
            let result: string;
            switch (expr.function.ref.name) {
                case 'contains': {
                    const caseInsensitive = getLiteral<boolean>(expr.args[2]?.value) === true;
                    if (caseInsensitive) {
                        result = `${arg0}?.toLowerCase().includes(${this.transform(
                            expr.args[1].value
                        )}?.toLowerCase())`;
                    } else {
                        result = `${arg0}?.includes(${this.transform(expr.args[1].value)})`;
                    }
                    break;
                }
                case 'search':
                    throw new PluginError('"search" function must be used against a field');
                case 'startsWith':
                    result = `${arg0}?.startsWith(${this.transform(expr.args[1].value)})`;
                    break;
                case 'endsWith':
                    result = `${arg0}?.endsWith(${this.transform(expr.args[1].value)})`;
                    break;
                case 'has':
                    result = `${arg0}?.includes(${this.transform(expr.args[1].value)})`;
                    break;
                case 'hasEvery':
                    result = `${this.transform(expr.args[1].value)}?.every((item) => ${arg0}?.includes(item))`;
                    break;
                case 'hasSome':
                    result = `${this.transform(expr.args[1].value)}?.some((item) => ${arg0}?.includes(item))`;
                    break;
                case 'isEmpty':
                    result = `${arg0}?.length === 0`;
                    break;
                default:
                    throw new PluginError(`Function invocation is not supported: ${expr.function.ref?.name}`);
            }

            return `(${result} ?? false)`;
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

    private unary(expr: UnaryExpr): string {
        return `(${expr.operator} ${this.transform(expr.operand)})`;
    }

    private binary(expr: BinaryExpr): string {
        if (expr.operator === 'in') {
            return `(${this.transform(expr.right)}?.includes(${this.transform(expr.left)}) ?? false)`;
        } else {
            return `(${this.transform(expr.left)} ${expr.operator} ${this.transform(expr.right)})`;
        }
    }
}
