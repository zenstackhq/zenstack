import { BinaryExpr, Expression, ExpressionType, UnaryExpr, isBinaryExpr, isEnum } from '@zenstackhq/language/ast';
import { ValidationAcceptor } from 'langium';
import { isAuthInvocation } from '../../utils/ast-utils';
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

        if (expr.$resolvedType?.decl === 'Unsupported') {
            accept('error', 'Field of "Unsupported" type cannot be used in expressions', { node: expr });
        }

        // extra validations by expression type
        switch (expr.$type) {
            case 'BinaryExpr':
                this.validateBinaryExpr(expr, accept);
                break;

            case 'UnaryExpr':
                this.validateUnaryExpr(expr, accept);
                break;
        }
    }

    private validateBinaryExpr(expr: BinaryExpr, accept: ValidationAcceptor) {
        switch (expr.operator) {
            case 'in': {
                if (typeof expr.left.$resolvedType?.decl !== 'string' && !isEnum(expr.left.$resolvedType?.decl)) {
                    accept('error', 'left operand of "in" must be of scalar type', { node: expr.left });
                }

                if (!expr.right.$resolvedType?.array) {
                    accept('error', 'right operand of "in" must be an array', {
                        node: expr.right,
                    });
                }
                break;
            }

            case '>':
            case '>=':
            case '<':
            case '<=':
            case '&&':
            case '||': {
                let supportedShapes: ExpressionType[];
                if (['>', '>=', '<', '<='].includes(expr.operator)) {
                    supportedShapes = ['Int', 'Float', 'DateTime', 'Any'];
                } else {
                    supportedShapes = ['Boolean', 'Any'];
                }

                if (
                    typeof expr.left.$resolvedType?.decl !== 'string' ||
                    !supportedShapes.includes(expr.left.$resolvedType.decl)
                ) {
                    accept('error', `invalid operand type for "${expr.operator}" operator`, {
                        node: expr.left,
                    });
                    return;
                }
                if (
                    typeof expr.right.$resolvedType?.decl !== 'string' ||
                    !supportedShapes.includes(expr.right.$resolvedType.decl)
                ) {
                    accept('error', `invalid operand type for "${expr.operator}" operator`, {
                        node: expr.right,
                    });
                    return;
                }

                // DateTime comparison is only allowed between two DateTime values
                if (expr.left.$resolvedType.decl === 'DateTime' && expr.right.$resolvedType.decl !== 'DateTime') {
                    accept('error', 'incompatible operand types', { node: expr });
                } else if (
                    expr.right.$resolvedType.decl === 'DateTime' &&
                    expr.left.$resolvedType.decl !== 'DateTime'
                ) {
                    accept('error', 'incompatible operand types', { node: expr });
                }

                break;
            }
        }
    }

    private validateUnaryExpr(expr: UnaryExpr, accept: ValidationAcceptor) {
        switch (expr.operator) {
            case '!': {
                const supportedShapes: ExpressionType[] = ['Boolean', 'Any'];
                if (
                    typeof expr.operand.$resolvedType?.decl !== 'string' ||
                    !supportedShapes.includes(expr.operand.$resolvedType.decl)
                ) {
                    accept('error', `invalid operand type for "${expr.operator}" operator`, {
                        node: expr.operand,
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
