import { invariant } from '@zenstackhq/common-helpers';
import type { CRUD_EXT } from '@zenstackhq/orm';
import {
    ExpressionUtils,
    type ArrayExpression,
    type BinaryExpression,
    type BindingExpression,
    type CallExpression,
    type Expression,
    type FieldExpression,
    type LiteralExpression,
    type MemberExpression,
    type UnaryExpression,
} from '@zenstackhq/orm/schema';
import { match } from 'ts-pattern';

type ExpressionEvaluatorContext = {
    auth?: any;
    thisValue?: any;
    // scope for resolving references to collection predicate bindings
    bindingScope?: Record<string, any>;
    operation: CRUD_EXT;
    thisType: string;
};

/**
 * Evaluate a schema expression into a JavaScript value.
 */
export class ExpressionEvaluator {
    evaluate(expression: Expression, context: ExpressionEvaluatorContext): any {
        const result = match(expression)
            .when(ExpressionUtils.isArray, (expr) => this.evaluateArray(expr, context))
            .when(ExpressionUtils.isBinary, (expr) => this.evaluateBinary(expr, context))
            .when(ExpressionUtils.isField, (expr) => this.evaluateField(expr, context))
            .when(ExpressionUtils.isLiteral, (expr) => this.evaluateLiteral(expr))
            .when(ExpressionUtils.isMember, (expr) => this.evaluateMember(expr, context))
            .when(ExpressionUtils.isUnary, (expr) => this.evaluateUnary(expr, context))
            .when(ExpressionUtils.isCall, (expr) => this.evaluateCall(expr, context))
            .when(ExpressionUtils.isBinding, (expr) => this.evaluateBinding(expr, context))
            .when(ExpressionUtils.isThis, () => context.thisValue)
            .when(ExpressionUtils.isNull, () => null)
            .exhaustive();

        return result ?? null;
    }

    private evaluateCall(expr: CallExpression, context: ExpressionEvaluatorContext): any {
        if (expr.function === 'auth') {
            return context.auth;
        } else if (expr.function === 'currentModel') {
            return context.thisType;
        } else if (expr.function === 'currentOperation') {
            return context.operation;
        } else {
            throw new Error(`Unsupported call expression function: ${expr.function}`);
        }
    }

    private evaluateUnary(expr: UnaryExpression, context: ExpressionEvaluatorContext) {
        return match(expr.op)
            .with('!', () => !this.evaluate(expr.operand, context))
            .exhaustive();
    }

    private evaluateMember(expr: MemberExpression, context: ExpressionEvaluatorContext) {
        let val = this.evaluate(expr.receiver, context);
        for (const member of expr.members) {
            val = val?.[member];
        }
        return val;
    }

    private evaluateLiteral(expr: LiteralExpression): any {
        return expr.value;
    }

    private evaluateField(expr: FieldExpression, context: ExpressionEvaluatorContext): any {
        if (context.bindingScope && expr.field in context.bindingScope) {
            return context.bindingScope[expr.field];
        }
        return context.thisValue?.[expr.field];
    }

    private evaluateArray(expr: ArrayExpression, context: ExpressionEvaluatorContext) {
        return expr.items.map((item) => this.evaluate(item, context));
    }

    private evaluateBinary(expr: BinaryExpression, context: ExpressionEvaluatorContext) {
        if (expr.op === '?' || expr.op === '!' || expr.op === '^') {
            return this.evaluateCollectionPredicate(expr, context);
        }

        const left = this.evaluate(expr.left, context);
        const right = this.evaluate(expr.right, context);

        if (!['==', '!='].includes(expr.op) && (left === null || right === null)) {
            // non-equality comparison with null always yields null (follow SQL logic)
            return null;
        }

        return match(expr.op)
            .with('==', () => left === right)
            .with('!=', () => left !== right)
            .with('>', () => left > right)
            .with('>=', () => left >= right)
            .with('<', () => left < right)
            .with('<=', () => left <= right)
            .with('&&', () => left && right)
            .with('||', () => left || right)
            .with('in', () => {
                const _right = right ?? [];
                invariant(Array.isArray(_right), 'expected array for "in" operator');
                return _right.includes(left);
            })
            .exhaustive();
    }

    private evaluateCollectionPredicate(expr: BinaryExpression, context: ExpressionEvaluatorContext) {
        const op = expr.op;
        invariant(op === '?' || op === '!' || op === '^', 'expected "?" or "!" or "^" operator');

        const left = this.evaluate(expr.left, context);
        if (left === null || left === undefined) {
            return null;
        }

        invariant(Array.isArray(left), 'expected array');

        return match(op)
            .with('?', () =>
                left.some((item: any) =>
                    this.evaluate(expr.right, {
                        ...context,
                        thisValue: item,
                        bindingScope: expr.binding
                            ? { ...(context.bindingScope ?? {}), [expr.binding]: item }
                            : context.bindingScope,
                    }),
                ),
            )
            .with('!', () =>
                left.every((item: any) =>
                    this.evaluate(expr.right, {
                        ...context,
                        thisValue: item,
                        bindingScope: expr.binding
                            ? { ...(context.bindingScope ?? {}), [expr.binding]: item }
                            : context.bindingScope,
                    }),
                ),
            )
            .with(
                '^',
                () =>
                    !left.some((item: any) =>
                        this.evaluate(expr.right, {
                            ...context,
                            thisValue: item,
                            bindingScope: expr.binding
                                ? { ...(context.bindingScope ?? {}), [expr.binding]: item }
                                : context.bindingScope,
                        }),
                    ),
            )
            .exhaustive();
    }

    private evaluateBinding(expr: BindingExpression, context: ExpressionEvaluatorContext): any {
        if (!context.bindingScope || !(expr.name in context.bindingScope)) {
            throw new Error(`Unresolved binding: ${expr.name}`);
        }
        return context.bindingScope[expr.name];
    }
}
