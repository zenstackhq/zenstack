import { match } from 'ts-pattern';
import type {
    ArrayExpression,
    BinaryExpression,
    BindingExpression,
    CallExpression,
    Expression,
    FieldExpression,
    LiteralExpression,
    MemberExpression,
    NullExpression,
    ThisExpression,
    UnaryExpression,
} from '@zenstackhq/schema';

export type VisitResult = void | { abort: true };

export class ExpressionVisitor {
    visit(expr: Expression): VisitResult {
        return match(expr)
            .with({ kind: 'literal' }, (e) => this.visitLiteral(e))
            .with({ kind: 'array' }, (e) => this.visitArray(e))
            .with({ kind: 'field' }, (e) => this.visitField(e))
            .with({ kind: 'member' }, (e) => this.visitMember(e))
            .with({ kind: 'binary' }, (e) => this.visitBinary(e))
            .with({ kind: 'unary' }, (e) => this.visitUnary(e))
            .with({ kind: 'call' }, (e) => this.visitCall(e))
            .with({ kind: 'binding' }, (e) => this.visitBinding(e))
            .with({ kind: 'this' }, (e) => this.visitThis(e))
            .with({ kind: 'null' }, (e) => this.visitNull(e))
            .exhaustive();
    }

    protected visitLiteral(_e: LiteralExpression): VisitResult {}

    protected visitArray(e: ArrayExpression): VisitResult {
        for (const item of e.items) {
            const result = this.visit(item);
            if (result?.abort) {
                return result;
            }
        }
    }

    protected visitField(_e: FieldExpression): VisitResult {}

    protected visitMember(e: MemberExpression): VisitResult {
        return this.visit(e.receiver);
    }

    protected visitBinary(e: BinaryExpression): VisitResult {
        const l = this.visit(e.left);
        if (l?.abort) {
            return l;
        } else {
            return this.visit(e.right);
        }
    }

    protected visitUnary(e: UnaryExpression): VisitResult {
        return this.visit(e.operand);
    }

    protected visitCall(e: CallExpression): VisitResult {
        for (const arg of e.args ?? []) {
            const r = this.visit(arg);
            if (r?.abort) {
                return r;
            }
        }
    }

    protected visitBinding(_e: BindingExpression): VisitResult {}

    protected visitThis(_e: ThisExpression): VisitResult {}

    protected visitNull(_e: NullExpression): VisitResult {}
}

export class MatchingExpressionVisitor extends ExpressionVisitor {
    private found = false;

    constructor(private predicate: (expr: Expression) => boolean) {
        super();
    }

    find(expr: Expression) {
        this.found = false;
        this.visit(expr);
        return this.found;
    }

    override visit(expr: Expression) {
        if (this.predicate(expr)) {
            this.found = true;
            return { abort: true } as const;
        } else {
            return super.visit(expr);
        }
    }
}
