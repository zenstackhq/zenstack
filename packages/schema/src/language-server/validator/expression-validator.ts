import {
    AstNode,
    BinaryExpr,
    DataModelAttribute,
    Expression,
    ExpressionType,
    isArrayExpr,
    isDataModel,
    isDataModelAttribute,
    isDataModelField,
    isEnum,
    isLiteralExpr,
    isMemberAccessExpr,
    isNullExpr,
    isReferenceExpr,
    isThisExpr,
} from '@zenstackhq/language/ast';
import {
    getAttributeArgLiteral,
    isAuthInvocation,
    isDataModelFieldReference,
    isEnumFieldReference,
} from '@zenstackhq/sdk';
import { ValidationAcceptor, streamAst } from 'langium';
import { findUpAst, getContainingDataModel } from '../../utils/ast-utils';
import { AstValidator } from '../types';
import { typeAssignable } from './utils';

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
                    { node: expr }
                );
            } else {
                const hasReferenceResolutionError = streamAst(expr).some((node) => {
                    if (isMemberAccessExpr(node)) {
                        return !!node.member.error;
                    }
                    if (isReferenceExpr(node)) {
                        return !!node.target.error;
                    }
                    return false;
                });
                if (!hasReferenceResolutionError) {
                    // report silent errors not involving linker errors
                    accept('error', 'Expression cannot be resolved', {
                        node: expr,
                    });
                }
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

                this.validateCrossModelFieldComparison(expr, accept);
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

                if (expr.operator !== '&&' && expr.operator !== '||') {
                    this.validateCrossModelFieldComparison(expr, accept);
                }
                break;
            }

            case '==':
            case '!=': {
                if (this.isInValidationContext(expr)) {
                    // in validation context, all fields are optional, so we should allow
                    // comparing any field against null
                    if (
                        (isDataModelFieldReference(expr.left) && isNullExpr(expr.right)) ||
                        (isDataModelFieldReference(expr.right) && isNullExpr(expr.left))
                    ) {
                        return;
                    }
                }

                if (!!expr.left.$resolvedType?.array !== !!expr.right.$resolvedType?.array) {
                    accept('error', 'incompatible operand types', { node: expr });
                    break;
                }

                if (!this.validateCrossModelFieldComparison(expr, accept)) {
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
                        accept('error', 'incompatible operand types', { node: expr });
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

            case '?':
            case '!':
            case '^':
                this.validateCollectionPredicate(expr, accept);
                break;
        }
    }

    private validateCrossModelFieldComparison(expr: BinaryExpr, accept: ValidationAcceptor) {
        // not supported in "read" rules:
        //   - foo.a == bar
        //   - foo.user.id == userId
        // except:
        //   - future().userId == userId
        if (
            (isMemberAccessExpr(expr.left) &&
                isDataModelField(expr.left.member.ref) &&
                expr.left.member.ref.$container != getContainingDataModel(expr)) ||
            (isMemberAccessExpr(expr.right) &&
                isDataModelField(expr.right.member.ref) &&
                expr.right.member.ref.$container != getContainingDataModel(expr))
        ) {
            // foo.user.id == auth().id
            // foo.user.id == "123"
            // foo.user.id == null
            // foo.user.id == EnumValue
            if (!(this.isNotModelFieldExpr(expr.left) || this.isNotModelFieldExpr(expr.right))) {
                const containingPolicyAttr = findUpAst(
                    expr,
                    (node) => isDataModelAttribute(node) && ['@@allow', '@@deny'].includes(node.decl.$refText)
                ) as DataModelAttribute | undefined;

                if (containingPolicyAttr) {
                    const operation = getAttributeArgLiteral<string>(containingPolicyAttr, 'operation');
                    if (operation?.split(',').includes('all') || operation?.split(',').includes('read')) {
                        accept(
                            'error',
                            'comparison between fields of different models is not supported in model-level "read" rules',
                            {
                                node: expr,
                            }
                        );
                        return false;
                    }
                }
            }
        }

        return true;
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

    private isNotModelFieldExpr(expr: Expression): boolean {
        return (
            // literal
            isLiteralExpr(expr) ||
            // enum field
            isEnumFieldReference(expr) ||
            // null
            isNullExpr(expr) ||
            // `auth()` access
            this.isAuthOrAuthMemberAccess(expr) ||
            // array
            (isArrayExpr(expr) && expr.items.every((item) => this.isNotModelFieldExpr(item)))
        );
    }

    private isAuthOrAuthMemberAccess(expr: Expression) {
        return isAuthInvocation(expr) || (isMemberAccessExpr(expr) && isAuthInvocation(expr.operand));
    }
}
