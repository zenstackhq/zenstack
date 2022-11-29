import { Expression, isInvocationExpr } from '@lang/generated/ast';
import { AstValidator } from '@lang/types';
import { isFromStdlib } from '@lang/utils';
import { ValidationAcceptor } from 'langium';

/**
 * Validates expressions.
 */
export default class ExpressionValidator implements AstValidator<Expression> {
    validate(expr: Expression, accept: ValidationAcceptor): void {
        if (!expr.$resolvedType) {
            if (this.isAuthInvocation(expr)) {
                // check was done at link time
                accept(
                    'error',
                    'auth() cannot be resolved because no "User" model is defined',
                    { node: expr }
                );
            } else {
                accept('error', 'expression cannot be resolved', {
                    node: expr,
                });
            }
        }
    }

    private isAuthInvocation(expr: Expression) {
        return (
            isInvocationExpr(expr) &&
            expr.function.ref?.name === 'auth' &&
            isFromStdlib(expr.function.ref)
        );
    }
}
