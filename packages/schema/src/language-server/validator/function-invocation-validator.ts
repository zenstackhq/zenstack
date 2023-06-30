import {
    Argument,
    DataModelAttribute,
    DataModelFieldAttribute,
    Expression,
    FunctionDecl,
    FunctionParam,
    InvocationExpr,
    isArrayExpr,
    isDataModelAttribute,
    isDataModelFieldAttribute,
    isLiteralExpr,
} from '@zenstackhq/language/ast';
import { AstNode, ValidationAcceptor } from 'langium';
import { getDataModelFieldReference } from '../../utils/ast-utils';
import { AstValidator } from '../types';
import { isFromStdlib } from '../utils';
import { typeAssignable } from './utils';
import { match, P } from 'ts-pattern';
import { ExpressionContext, getFunctionExpressionContext, isEnumFieldReference } from '@zenstackhq/sdk';

/**
 * InvocationExpr validation
 */
export default class FunctionInvocationValidator implements AstValidator<Expression> {
    validate(expr: InvocationExpr, accept: ValidationAcceptor): void {
        const funcDecl = expr.function.ref;
        if (!funcDecl) {
            accept('error', 'function cannot be resolved', { node: expr });
            return;
        }

        if (!this.validateArgs(funcDecl, expr.args, accept)) {
            return;
        }

        if (isFromStdlib(funcDecl)) {
            // validate standard library functions

            // find the containing attribute context for the invocation
            let curr: AstNode | undefined = expr.$container;
            let containerAttribute: DataModelAttribute | DataModelFieldAttribute | undefined;
            while (curr) {
                if (isDataModelAttribute(curr) || isDataModelFieldAttribute(curr)) {
                    containerAttribute = curr;
                    break;
                }
                curr = curr.$container;
            }

            // validate the context allowed for the function
            const exprContext = match(containerAttribute?.decl.$refText)
                .with('@default', () => ExpressionContext.DefaultValue)
                .with(P.union('@@allow', '@@deny'), () => ExpressionContext.AccessPolicy)
                .with('@@validate', () => ExpressionContext.ValidationRule)
                .otherwise(() => undefined);

            // get the context allowed for the function
            const funcAllowedContext = getFunctionExpressionContext(funcDecl);

            if (exprContext && !funcAllowedContext.includes(exprContext)) {
                accept('error', `function "${funcDecl.name}" is not allowed in the current context: ${exprContext}`, {
                    node: expr,
                });
                return;
            }

            if (
                funcAllowedContext.includes(ExpressionContext.AccessPolicy) ||
                funcAllowedContext.includes(ExpressionContext.ValidationRule)
            ) {
                // filter operation functions validation

                // first argument must refer to a model field
                const firstArg = expr.args?.[0]?.value;
                if (firstArg) {
                    if (!getDataModelFieldReference(firstArg)) {
                        accept('error', 'first argument must be a field reference', { node: firstArg });
                    }
                }

                // second argument must be a literal or array of literal
                const secondArg = expr.args?.[1]?.value;
                if (
                    secondArg &&
                    // literal
                    !isLiteralExpr(secondArg) &&
                    // enum field
                    !isEnumFieldReference(secondArg) &&
                    // array of literal/enum
                    !(
                        isArrayExpr(secondArg) &&
                        secondArg.items.every((item) => isLiteralExpr(item) || isEnumFieldReference(item))
                    )
                ) {
                    accept('error', 'second argument must be a literal, an enum, or an array of them', {
                        node: secondArg,
                    });
                }
            }
        }
    }

    private validateArgs(funcDecl: FunctionDecl, args: Argument[], accept: ValidationAcceptor) {
        let success = true;
        for (let i = 0; i < funcDecl.params.length; i++) {
            const param = funcDecl.params[i];
            const arg = args[i];
            if (!arg) {
                if (!param.optional) {
                    accept('error', `missing argument for parameter "${param.name}"`, { node: funcDecl });
                    success = false;
                }
            } else {
                if (!this.validateInvocationArg(arg, param, accept)) {
                    success = false;
                }
            }
        }
        // TODO: do we need to complain for extra arguments?
        return success;
    }

    private validateInvocationArg(arg: Argument, param: FunctionParam, accept: ValidationAcceptor) {
        const argResolvedType = arg?.value?.$resolvedType;
        if (!argResolvedType) {
            accept('error', 'argument type cannot be resolved', { node: arg });
            return false;
        }

        const dstType = param.type.type;
        if (!dstType) {
            accept('error', 'parameter type cannot be resolved', { node: param });
            return false;
        }

        const dstIsArray = param.type.array;
        const dstRef = param.type.reference;

        if (dstType === 'Any' && !dstIsArray) {
            // scalar 'any' can be assigned with anything
            return true;
        }

        if (typeof argResolvedType.decl === 'string') {
            // scalar type
            if (!typeAssignable(dstType, argResolvedType.decl, arg.value) || dstIsArray !== argResolvedType.array) {
                accept('error', `argument is not assignable to parameter`, {
                    node: arg,
                });
                return false;
            }
        } else {
            // enum or model type
            if ((dstRef?.ref !== argResolvedType.decl && dstType !== 'Any') || dstIsArray !== argResolvedType.array) {
                accept('error', `argument is not assignable to parameter`, {
                    node: arg,
                });
                return false;
            }
        }

        return true;
    }
}
