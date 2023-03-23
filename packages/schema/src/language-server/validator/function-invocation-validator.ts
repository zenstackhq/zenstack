import {
    Argument,
    Expression,
    FunctionDecl,
    FunctionParam,
    InvocationExpr,
    isArrayExpr,
    isLiteralExpr,
} from '@zenstackhq/language/ast';
import { ValidationAcceptor } from 'langium';
import { isDataModelFieldReference, isEnumFieldReference } from '../../utils/ast-utils';
import { FILTER_OPERATOR_FUNCTIONS } from '../constants';
import { AstValidator } from '../types';
import { isFromStdlib } from '../utils';
import { typeAssignable } from './utils';

/**
 * Validates expressions.
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
            if (FILTER_OPERATOR_FUNCTIONS.includes(funcDecl.name)) {
                // validate filter operators

                // first argument must be a field reference
                const firstArg = expr.args?.[0]?.value;
                if (firstArg) {
                    if (!isDataModelFieldReference(firstArg)) {
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
        return success;
    }

    private validateInvocationArg(arg: Argument, param: FunctionParam, accept: ValidationAcceptor) {
        const argResolvedType = arg?.value?.$resolvedType;
        if (!argResolvedType) {
            accept('error', 'argument cannot be resolved', { node: arg });
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
