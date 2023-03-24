import { BinaryExpr, Expression, isArrayExpr, isBinaryExpr, isEnum, isLiteralExpr } from '@zenstackhq/language/ast';
import { ValidationAcceptor } from 'langium';
import { isAuthInvocation, isDataModelFieldReference, isEnumFieldReference } from '../../utils/ast-utils';
import { AstValidator } from '../types';

/**
 * Validates expressions.
 */
export default class ExpressionValidator implements AstValidator<Expression> {
    validate(expr: Expression, accept: ValidationAcceptor): void {
        // deal with a few cases where reference resolution fail silently
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

        // extra validations by expression type
        switch (expr.$type) {
            case 'BinaryExpr':
                this.validateBinaryExpr(expr, accept);
                break;
        }
    }

    private validateBinaryExpr(expr: BinaryExpr, accept: ValidationAcceptor) {
        switch (expr.operator) {
            case 'in': {
                if (!isDataModelFieldReference(expr.left)) {
                    accept('error', 'left operand of "in" must be a field reference', { node: expr.left });
                }

                if (typeof expr.left.$resolvedType?.decl !== 'string' && !isEnum(expr.left.$resolvedType?.decl)) {
                    accept('error', 'left operand of "in" must be of scalar type', { node: expr.left });
                }

                if (
                    !(
                        isArrayExpr(expr.right) &&
                        expr.right.items.every((item) => isLiteralExpr(item) || isEnumFieldReference(item))
                    )
                ) {
                    accept('error', 'right operand of "in" must be an array of literals or enum values', {
                        node: expr.right,
                    });
                }
                break;
            }
        }
    }

    private isCollectionPredicate(expr: Expression) {
        return isBinaryExpr(expr) && ['?', '!', '^'].includes(expr.operator);
    }
}
