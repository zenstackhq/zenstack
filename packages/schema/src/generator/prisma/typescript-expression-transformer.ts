import { GeneratorError } from '../types';
import {
    ArrayExpr,
    Expression,
    InvocationExpr,
    isEnumField,
    isThisExpr,
    LiteralExpr,
    MemberAccessExpr,
    NullExpr,
    ReferenceExpr,
    ThisExpr,
} from '@lang/generated/ast';

/**
 * Transforms ZModel expression to plain TypeScript expression.
 */
export default class TypeScriptExpressionTransformer {
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
                throw new GeneratorError(
                    `Unsupported expression type: ${expr.$type}`
                );
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private this(expr: ThisExpr) {
        // "this" is mapped to id comparison
        return 'id';
    }

    private memberAccess(expr: MemberAccessExpr) {
        if (!expr.member.ref) {
            throw new GeneratorError(`Unresolved MemberAccessExpr`);
        }

        if (isThisExpr(expr.operand)) {
            return expr.member.ref.name;
        } else {
            return `${this.transform(expr.operand)}?.${expr.member.ref.name}`;
        }
    }

    private invocation(expr: InvocationExpr) {
        if (expr.function.ref?.name !== 'auth') {
            throw new GeneratorError(
                `Function invocation is not supported: ${expr.function.ref?.name}`
            );
        }
        return 'user';
    }

    private reference(expr: ReferenceExpr) {
        if (!expr.target.ref) {
            throw new GeneratorError(`Unresolved ReferenceExpr`);
        }

        if (isEnumField(expr.target.ref)) {
            return `${expr.target.ref.$container.name}.${expr.target.ref.name}`;
        } else {
            return expr.target.ref.name;
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
