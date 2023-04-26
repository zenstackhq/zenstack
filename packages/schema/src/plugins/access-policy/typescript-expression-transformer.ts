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
     * Transforms the given expression to a TypeScript expression.
     * @param normalizeUndefined if undefined values should be normalized to null
     * @returns
     */
    transform(expr: Expression, normalizeUndefined = true): string {
        switch (expr.$type) {
            case LiteralExpr:
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
                throw new PluginError(`Unsupported expression type: ${expr.$type}`);
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private this(expr: ThisExpr) {
        // "this" is mapped to id comparison
        return 'id';
    }

    private memberAccess(expr: MemberAccessExpr, normalizeUndefined: boolean) {
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
            throw new PluginError(`Unresolved InvocationExpr`);
        }

        if (isAuthInvocation(expr)) {
            return 'user';
        } else if (FILTER_OPERATOR_FUNCTIONS.includes(expr.function.ref.name)) {
            // arguments are already type-checked

            const arg0 = this.transform(expr.args[0].value, false);
            let result: string;
            switch (expr.function.ref.name) {
                case 'contains': {
                    const caseInsensitive = getLiteral<boolean>(expr.args[2]?.value) === true;
                    if (caseInsensitive) {
                        result = `${arg0}?.toLowerCase().includes(${this.transform(
                            expr.args[1].value,
                            normalizeUndefined
                        )}?.toLowerCase())`;
                    } else {
                        result = `${arg0}?.includes(${this.transform(expr.args[1].value, normalizeUndefined)})`;
                    }
                    break;
                }
                case 'search':
                    throw new PluginError('"search" function must be used against a field');
                case 'startsWith':
                    result = `${arg0}?.startsWith(${this.transform(expr.args[1].value, normalizeUndefined)})`;
                    break;
                case 'endsWith':
                    result = `${arg0}?.endsWith(${this.transform(expr.args[1].value, normalizeUndefined)})`;
                    break;
                case 'has':
                    result = `${arg0}?.includes(${this.transform(expr.args[1].value, normalizeUndefined)})`;
                    break;
                case 'hasEvery':
                    result = `${this.transform(
                        expr.args[1].value,
                        normalizeUndefined
                    )}?.every((item) => ${arg0}?.includes(item))`;
                    break;
                case 'hasSome':
                    result = `${this.transform(
                        expr.args[1].value,
                        normalizeUndefined
                    )}?.some((item) => ${arg0}?.includes(item))`;
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

    private array(expr: ArrayExpr, normalizeUndefined: boolean) {
        return `[${expr.items.map((item) => this.transform(item, normalizeUndefined)).join(', ')}]`;
    }

    private literal(expr: LiteralExpr) {
        if (typeof expr.value === 'string') {
            return `'${expr.value}'`;
        } else {
            return expr.value.toString();
        }
    }

    private unary(expr: UnaryExpr, normalizeUndefined: boolean): string {
        return `(${expr.operator} ${this.transform(expr.operand, normalizeUndefined)})`;
    }

    private binary(expr: BinaryExpr, normalizeUndefined: boolean): string {
        if (expr.operator === 'in') {
            return `(${this.transform(expr.right, false)}?.includes(${this.transform(
                expr.left,
                normalizeUndefined
            )}) ?? false)`;
        } else {
            return `(${this.transform(expr.left)} ${expr.operator} ${this.transform(expr.right, normalizeUndefined)})`;
        }
    }
}
