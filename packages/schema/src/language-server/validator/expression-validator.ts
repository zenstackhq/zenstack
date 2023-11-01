import {
    BinaryExpr,
    Expression,
    ExpressionType,
    isDataModel,
    isEnum,
    isNullExpr,
    isThisExpr,
} from '@zenstackhq/language/ast';
import { isDataModelFieldReference } from '@zenstackhq/sdk';
import { ValidationAcceptor } from 'langium';
import { isAuthInvocation, isCollectionPredicate } from '../../utils/ast-utils';
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
                accept(
                    'error',
                    'auth() cannot be resolved because no model marked wth "@@auth()" or named "User" is found',
                    { node: expr }
                );
            } else if (isCollectionPredicate(expr)) {
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
                if (expr.left.$resolvedType?.array) {
                    accept('error', 'operand cannot be an array', { node: expr.left });
                    break;
                }

                if (expr.right.$resolvedType?.array) {
                    accept('error', 'operand cannot be an array', { node: expr.right });
                    break;
                }

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

            case '==':
            case '!=': {
                if (!!expr.left.$resolvedType?.array !== !!expr.right.$resolvedType?.array) {
                    accept('error', 'incompatible operand types', { node: expr });
                    break;
                }

                // disallow comparing model type with scalar type or comparison between
                // incompatible model types
                const leftType = expr.left.$resolvedType?.decl;
                const rightType = expr.right.$resolvedType?.decl;
                if (isDataModel(leftType) && isDataModel(rightType)) {
                    if (leftType != rightType) {
                        // incompatible model types
                        // TODO: inheritance case?
                        accept('error', 'incompatible operand types', { node: expr });
                    }

                    // not supported:
                    //   - foo == bar
                    //   - foo == this
                    if (
                        isDataModelFieldReference(expr.left) &&
                        (isThisExpr(expr.right) || isDataModelFieldReference(expr.right))
                    ) {
                        accept('error', 'comparison between model-typed fields are not supported', { node: expr });
                    } else if (
                        isDataModelFieldReference(expr.right) &&
                        (isThisExpr(expr.left) || isDataModelFieldReference(expr.left))
                    ) {
                        accept('error', 'comparison between model-typed fields are not supported', { node: expr });
                    }
                } else if (
                    (isDataModel(leftType) && !isNullExpr(expr.right)) ||
                    (isDataModel(rightType) && !isNullExpr(expr.left))
                ) {
                    // comparing model against scalar (except null)
                    accept('error', 'incompatible operand types', { node: expr });
                }
                break;
            }
        }
    }
}
