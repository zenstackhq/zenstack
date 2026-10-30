import { AstUtils, type AstNode, type ValidationAcceptor } from 'langium';
import {
    BinaryExpr,
    Expression,
    isArrayExpr,
    isCollectionPredicateBinding,
    isDataFieldAttribute,
    isDataModel,
    isDataModelAttribute,
    isEnum,
    isLiteralExpr,
    isMemberAccessExpr,
    isNullExpr,
    isReferenceExpr,
    isThisExpr,
    MemberAccessExpr,
    ReferenceExpr,
    UnaryExpr,
    type ExpressionType,
} from '../generated/ast';

import {
    findUpAst,
    isAuthInvocation,
    isAuthOrAuthMemberAccess,
    isBeforeInvocation,
    isDataFieldReference,
    isEnumFieldReference,
    typeAssignable,
} from '../utils';
import type { AstValidator } from './common';

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
                    'auth() cannot be resolved because no model marked with "@@auth()" or named "User" is found',
                    { node: expr },
                );
            } else {
                const hasReferenceResolutionError = AstUtils.streamAst(expr).some((node) => {
                    if (isMemberAccessExpr(node)) {
                        return !!node.member.error;
                    }
                    if (isReferenceExpr(node)) {
                        return !!node.target.error;
                    }
                    return false;
                });
                if (hasReferenceResolutionError) {
                    // report silent errors not involving linker errors
                    accept('error', 'Expression cannot be resolved', {
                        node: expr,
                    });
                }
            }
        }

        // extra validations by expression type
        switch (expr.$type) {
            case 'ReferenceExpr':
                this.validateReferenceExpr(expr, accept);
                break;
            case 'MemberAccessExpr':
                this.validateMemberAccessExpr(expr, accept);
                break;
            case 'BinaryExpr':
                this.validateBinaryExpr(expr, accept);
                break;
            case 'UnaryExpr':
                this.validateUnaryExpr(expr, accept);
                break;
        }
    }

    private validateReferenceExpr(expr: ReferenceExpr, accept: ValidationAcceptor) {
        // reference to collection predicate's binding can't be used standalone like:
        //   `items?[e, e]`, `items?[e, e != null]`, etc.
        if (isCollectionPredicateBinding(expr.target.ref) && !isMemberAccessExpr(expr.$container)) {
            accept('error', 'Collection predicate binding cannot be used without a member access', {
                node: expr,
            });
        }
        if (isEnum(expr.target.ref) && !this.isInPolicyOrValidationAttribute(expr)) {
            accept('error', 'Enum reference can only be used with policy and validation attributes', {
                node: expr,
            });
        }
    }

    private validateMemberAccessExpr(expr: MemberAccessExpr, accept: ValidationAcceptor) {
        if (isBeforeInvocation(expr.operand) && isDataModel(expr.$resolvedType?.decl)) {
            accept('error', 'relation fields cannot be accessed from `before()`', { node: expr });
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
                    accept('error', 'operand cannot be an array', {
                        node: expr.left,
                    });
                    break;
                }

                if (expr.right.$resolvedType?.array) {
                    accept('error', 'operand cannot be an array', {
                        node: expr.right,
                    });
                    break;
                }

                let supportedShapes: ExpressionType[];
                if (['>', '>=', '<', '<='].includes(expr.operator)) {
                    supportedShapes = ['Int', 'Float', 'DateTime', 'Any'];
                } else {
                    supportedShapes = ['Boolean', 'Any'];
                }

                const leftResolvedDecl = expr.left.$resolvedType?.decl;
                const rightResolvedDecl = expr.right.$resolvedType?.decl;

                if (
                    leftResolvedDecl &&
                    (typeof leftResolvedDecl !== 'string' || !supportedShapes.includes(leftResolvedDecl))
                ) {
                    accept('error', `invalid operand type for "${expr.operator}" operator`, {
                        node: expr.left,
                    });
                    return;
                }
                if (
                    rightResolvedDecl &&
                    (typeof rightResolvedDecl !== 'string' || !supportedShapes.includes(rightResolvedDecl))
                ) {
                    accept('error', `invalid operand type for "${expr.operator}" operator`, {
                        node: expr.right,
                    });
                    return;
                }

                // DateTime comparison is only allowed between two DateTime values
                if (leftResolvedDecl === 'DateTime' && rightResolvedDecl && rightResolvedDecl !== 'DateTime') {
                    accept('error', 'incompatible operand types', {
                        node: expr,
                    });
                } else if (rightResolvedDecl === 'DateTime' && leftResolvedDecl && leftResolvedDecl !== 'DateTime') {
                    accept('error', 'incompatible operand types', {
                        node: expr,
                    });
                }
                break;
            }

            case '==':
            case '!=': {
                if (this.isInValidationContext(expr)) {
                    // in validation context, all fields are optional, so we should allow
                    // comparing any field against null
                    if (
                        (isDataFieldReference(expr.left) && isNullExpr(expr.right)) ||
                        (isDataFieldReference(expr.right) && isNullExpr(expr.left))
                    ) {
                        return;
                    }
                }

                if (!!expr.left.$resolvedType?.array !== !!expr.right.$resolvedType?.array) {
                    accept('error', 'incompatible operand types', {
                        node: expr,
                    });
                    break;
                }

                if (
                    (expr.left.$resolvedType?.nullable && isNullExpr(expr.right)) ||
                    (expr.right.$resolvedType?.nullable && isNullExpr(expr.left))
                ) {
                    // comparing nullable field with null
                    return;
                }

                if (
                    typeof expr.left.$resolvedType?.decl === 'string' &&
                    typeof expr.right.$resolvedType?.decl === 'string'
                ) {
                    // scalar types assignability
                    if (
                        !typeAssignable(expr.left.$resolvedType.decl, expr.right.$resolvedType.decl) &&
                        !typeAssignable(expr.right.$resolvedType.decl, expr.left.$resolvedType.decl)
                    ) {
                        accept('error', 'incompatible operand types', {
                            node: expr,
                        });
                    }
                    return;
                }

                // disallow comparing model type with scalar type or comparison between
                // incompatible model types
                const leftType = expr.left.$resolvedType?.decl;
                const rightType = expr.right.$resolvedType?.decl;
                if (isDataModel(leftType) && isDataModel(rightType)) {
                    if (leftType != rightType) {
                        // incompatible model types
                        // TODO: inheritance case?
                        accept('error', 'incompatible operand types', {
                            node: expr,
                        });
                    }

                    // not supported:
                    //   - foo == bar
                    //   - foo == this
                    if (
                        isDataFieldReference(expr.left) &&
                        (isThisExpr(expr.right) || isDataFieldReference(expr.right))
                    ) {
                        accept('error', 'comparison between models is not supported', { node: expr });
                    } else if (
                        isDataFieldReference(expr.right) &&
                        (isThisExpr(expr.left) || isDataFieldReference(expr.left))
                    ) {
                        accept('error', 'comparison between models is not supported', { node: expr });
                    }
                } else if (
                    (isDataModel(leftType) && !isNullExpr(expr.right)) ||
                    (isDataModel(rightType) && !isNullExpr(expr.left))
                ) {
                    // comparing model against scalar (except null)
                    accept('error', 'incompatible operand types', {
                        node: expr,
                    });
                }
                break;
            }

            case '?':
            case '!':
            case '^':
                this.validateCollectionPredicate(expr, accept);
                break;
        }
    }

    private validateUnaryExpr(expr: UnaryExpr, accept: ValidationAcceptor) {
        if (expr.operand.$resolvedType && expr.operand.$resolvedType.decl !== 'Boolean') {
            accept('error', `operand of "${expr.operator}" must be of Boolean type`, { node: expr.operand });
        }
    }

    private validateCollectionPredicate(expr: BinaryExpr, accept: ValidationAcceptor) {
        if (!expr.$resolvedType) {
            accept('error', 'collection predicate can only be used on an array of model type', { node: expr });
            return;
        }
    }

    private isInValidationContext(node: AstNode) {
        return findUpAst(node, (n) => isDataModelAttribute(n) && n.decl.$refText === '@@validate');
    }

    private isInPolicyOrValidationAttribute(node: AstNode) {
        const attrs = ['@allow', '@@allow', '@deny', '@@deny', '@@validate'];
        return findUpAst(
            node,
            (n) => (isDataModelAttribute(n) || isDataFieldAttribute(n)) && attrs.includes(n.decl.$refText),
        );
    }

    private isNotModelFieldExpr(expr: Expression): boolean {
        return (
            // literal
            isLiteralExpr(expr) ||
            // enum field
            isEnumFieldReference(expr) ||
            // null
            isNullExpr(expr) ||
            // `auth()` access
            isAuthOrAuthMemberAccess(expr) ||
            // array
            (isArrayExpr(expr) && expr.items.every((item) => this.isNotModelFieldExpr(item)))
        );
    }
}
