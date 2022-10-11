import { GeneratorError } from '../../types';
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

export default class PlainExpressionBuilder {
    build(expr: Expression): string {
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

    private this(expr: ThisExpr) {
        // "this" is mapped to id comparison
        return 'id';
    }

    private memberAccess(expr: MemberAccessExpr) {
        if (isThisExpr(expr.operand)) {
            return expr.member.ref!.name;
        } else {
            return `${this.build(expr.operand)}?.${expr.member.ref!.name}`;
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
        if (isEnumField(expr.target.ref)) {
            return `${expr.target.ref.$container.name}.${expr.target.ref.name}`;
        } else {
            return expr.target.ref!.name;
        }
    }

    private null() {
        return 'null';
    }

    private array(expr: ArrayExpr) {
        return `[${expr.items.map((item) => this.build(item)).join(', ')}]`;
    }

    private literal(expr: LiteralExpr) {
        if (typeof expr.value === 'string') {
            return `'${expr.value}'`;
        } else {
            return expr.value.toString();
        }
    }
}
