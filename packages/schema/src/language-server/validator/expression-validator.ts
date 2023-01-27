import { Expression, isBinaryExpr } from '@zenstackhq/language/ast';
import { ValidationAcceptor } from 'langium';
import { isAuthInvocation } from '../../utils/ast-utils';
import { AstValidator } from '../types';

/**
 * Validates expressions.
 */
export default class ExpressionValidator implements AstValidator<Expression> {
    validate(expr: Expression, accept: ValidationAcceptor): void {
        if (!expr.$resolvedType) {
            if (isAuthInvocation(expr)) {
                // check was done at link time
                accept('error', 'auth() cannot be resolved because no "User" model is defined', { node: expr });
            } else if (this.isCollectionPredicate(expr)) {
                accept('error', 'collection predicate can only be used on an array of model type', { node: expr });
            } else {
                accept('error', 'expression cannot be resolved', {
                    node: expr,
                });
            }
        }
    }

    private isCollectionPredicate(expr: Expression) {
        return isBinaryExpr(expr) && ['?', '!', '^'].includes(expr.operator);
    }
}
