import { AstUtils, type AstNode, type ValidationAcceptor } from 'langium';
import { match, P } from 'ts-pattern';
import { ExpressionContext } from '../constants';
import {
    Argument,
    DataFieldAttribute,
    DataModel,
    DataModelAttribute,
    Expression,
    FunctionDecl,
    FunctionParam,
    InvocationExpr,
    isDataFieldAttribute,
    isDataModel,
    isDataModelAttribute,
    isStringLiteral,
} from '../generated/ast';
import {
    getFunctionExpressionContext,
    getLiteral,
    isCheckInvocation,
    isDataFieldReference,
    mapBuiltinTypeToExpressionType,
    typeAssignable,
} from '../utils';
import type { AstValidator } from './common';

// a registry of function handlers marked with @func
const invocationCheckers = new Map<string, PropertyDescriptor>();

// function handler decorator
function func(name: string) {
    return function (_target: unknown, _propertyKey: string, descriptor: PropertyDescriptor) {
        if (!invocationCheckers.get(name)) {
            invocationCheckers.set(name, descriptor);
        }
        return descriptor;
    };
}
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

        if (!this.validateArgs(funcDecl, expr, accept)) {
            return;
        }

        // find the containing attribute context for the invocation
        let curr: AstNode | undefined = expr.$container;
        let containerAttribute: DataModelAttribute | DataFieldAttribute | undefined;
        while (curr) {
            if (isDataModelAttribute(curr) || isDataFieldAttribute(curr)) {
                containerAttribute = curr;
                break;
            }
            curr = curr.$container;
        }

        // validate the context allowed for the function
        const exprContext = this.getExpressionContext(containerAttribute);

        // get the context allowed for the function
        const funcAllowedContext = getFunctionExpressionContext(funcDecl);

        if (exprContext && !funcAllowedContext.includes(exprContext)) {
            accept('error', `function "${funcDecl.name}" is not allowed in the current context: ${exprContext}`, {
                node: expr,
            });
            return;
        }

        // TODO: express function validation rules declaratively in ZModel

        const allCasing = ['original', 'upper', 'lower', 'capitalize', 'uncapitalize'];
        if (['currentModel', 'currentOperation'].includes(funcDecl.name)) {
            const arg = getLiteral<string>(expr.args[0]?.value);
            if (arg && !allCasing.includes(arg)) {
                accept('error', `argument must be one of: ${allCasing.map((c) => '"' + c + '"').join(', ')}`, {
                    node: expr.args[0]!,
                });
            }
        }

        if (['uuid', 'ulid', 'cuid', 'nanoid'].includes(funcDecl.name)) {
            const formatParamIdx = funcDecl.params.findIndex((param) => param.name === 'format');
            const formatArg = getLiteral<string>(expr.args[formatParamIdx]?.value);
            if (
                formatArg !== undefined &&
                !/(?<!\\)%s/g.test(formatArg) // an unescaped %s must be present
            ) {
                accept('error', 'argument must include "%s"', {
                    node: expr.args[formatParamIdx]!,
                });
            }
        }

        // run checkers for specific functions
        const checker = invocationCheckers.get(expr.function.$refText);
        if (checker) {
            checker.value.call(this, expr, accept);
        }
    }

    private getExpressionContext(containerAttribute: DataModelAttribute | DataFieldAttribute | undefined) {
        if (!containerAttribute) {
            return undefined;
        }
        if (this.isValidationAttribute(containerAttribute)) {
            return ExpressionContext.ValidationRule;
        }
        return match(containerAttribute?.decl.$refText)
            .with('@default', () => ExpressionContext.DefaultValue)
            .with(P.union('@@allow', '@@deny', '@allow', '@deny'), () => ExpressionContext.AccessPolicy)
            .with('@@index', () => ExpressionContext.Index)
            .otherwise(() => undefined);
    }

    private isValidationAttribute(attr: DataModelAttribute | DataFieldAttribute) {
        return !!attr.decl.ref?.attributes.some((attr) => attr.decl.$refText === '@@@validation');
    }

    private validateArgs(funcDecl: FunctionDecl, expr: InvocationExpr, accept: ValidationAcceptor) {
        let success = true;
        for (let i = 0; i < funcDecl.params.length; i++) {
            const param = funcDecl.params[i];
            if (!param) {
                continue;
            }
            const arg = expr.args[i];
            if (!arg) {
                if (!param.optional) {
                    accept('error', `missing argument for parameter "${param.name}"`, { node: expr });
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
            accept('error', 'parameter type cannot be resolved', {
                node: param,
            });
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
            const dstScalarType = mapBuiltinTypeToExpressionType(dstType);
            const srcScalarType = mapBuiltinTypeToExpressionType(argResolvedType.decl);
            if (!typeAssignable(dstScalarType, srcScalarType, arg.value) || dstIsArray !== argResolvedType.array) {
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

    @func('uuid')
    private _checkUuid(expr: InvocationExpr, accept: ValidationAcceptor) {
        // first argument must be 4 or 7 if provided
        const versionArg = expr.args[0]?.value;
        if (versionArg) {
            const version = getLiteral<number>(versionArg);
            if (version !== undefined && version !== 4 && version !== 7) {
                accept('error', 'first argument must be 4 or 7', {
                    node: expr.args[0]!,
                });
            }
        }
    }

    @func('cuid')
    private _checkCuid(expr: InvocationExpr, accept: ValidationAcceptor) {
        // first argument must be 1 or 2 if provided
        const versionArg = expr.args[0]?.value;
        if (versionArg) {
            const version = getLiteral<number>(versionArg);
            if (version !== undefined && version !== 1 && version !== 2) {
                accept('error', 'first argument must be 1 or 2', {
                    node: expr.args[0]!,
                });
            }
        }
    }

    @func('nanoid')
    private _checkNanoid(expr: InvocationExpr, accept: ValidationAcceptor) {
        // first argument must be positive if provided
        const lengthArg = expr.args[0]?.value;
        if (lengthArg) {
            const length = getLiteral<number>(lengthArg);
            if (length !== undefined && length <= 0) {
                accept('error', 'first argument must be a positive number', {
                    node: expr.args[0]!,
                });
            }
        }
    }

    @func('customId')
    private _checkCustomId(expr: InvocationExpr, accept: ValidationAcceptor) {
        // first argument must be positive if provided
        const lengthArg = expr.args[0]?.value;
        if (lengthArg) {
            const length = getLiteral<number>(lengthArg);
            if (length !== undefined && length <= 0) {
                accept('error', 'first argument must be a positive number', {
                    node: expr.args[0]!,
                });
            }
        }
    }

    @func('auth')
    private _checkAuth(expr: InvocationExpr, accept: ValidationAcceptor) {
        if (!expr.$resolvedType) {
            accept(
                'error',
                'cannot resolve `auth()` - make sure you have a model or type with `@auth` attribute or named "User"',
                { node: expr },
            );
        }
    }

    @func('length')
    private _checkLength(expr: InvocationExpr, accept: ValidationAcceptor) {
        const msg = 'argument must be a string or list field';
        const fieldArg = expr.args[0]!.value;
        if (!isDataFieldReference(fieldArg)) {
            accept('error', msg, {
                node: expr.args[0]!,
            });
            return;
        }

        if (isDataModel(fieldArg.$resolvedType?.decl)) {
            accept('error', msg, {
                node: expr.args[0]!,
            });
            return;
        }

        if (!fieldArg.$resolvedType?.array && fieldArg.$resolvedType?.decl !== 'String') {
            accept('error', msg, {
                node: expr.args[0]!,
            });
        }
    }

    @func('regex')
    private _checkRegex(expr: InvocationExpr, accept: ValidationAcceptor) {
        const regex = expr.args[1]?.value;
        if (!isStringLiteral(regex)) {
            accept('error', 'second argument must be a string literal', {
                node: expr.args[1]!,
            });
            return;
        }

        try {
            // try to create a RegExp object to verify the pattern
            new RegExp(regex.value);
        } catch (e) {
            accept('error', 'invalid regular expression: ' + (e as Error).message, {
                node: expr.args[1]!,
            });
        }
    }

    // TODO: move this to policy plugin
    @func('check')
    private _checkCheck(expr: InvocationExpr, accept: ValidationAcceptor) {
        let valid = true;

        const fieldArg = expr.args[0]!.value;
        if (!isDataFieldReference(fieldArg) || !isDataModel(fieldArg.$resolvedType?.decl)) {
            accept('error', 'argument must be a relation field', {
                node: expr.args[0]!,
            });
            valid = false;
        }

        if (fieldArg.$resolvedType?.array) {
            accept('error', 'argument cannot be an array field', {
                node: expr.args[0]!,
            });
            valid = false;
        }

        const opArg = expr.args[1]?.value;
        if (opArg) {
            const operation = getLiteral<string>(opArg);
            if (!operation || !['read', 'create', 'update', 'delete'].includes(operation)) {
                accept('error', 'argument must be a "read", "create", "update", or "delete"', { node: expr.args[1]! });
                valid = false;
            }
        }

        if (!valid) {
            return;
        }

        // check for cyclic relation checking
        const start = fieldArg.$resolvedType?.decl as DataModel;
        const tasks = [expr];
        const seen = new Set<DataModel>();

        while (tasks.length > 0) {
            const currExpr = tasks.pop()!;
            const arg = currExpr.args[0]?.value;

            if (!isDataModel(arg?.$resolvedType?.decl)) {
                continue;
            }

            const currModel = arg!.$resolvedType!.decl;

            if (seen.has(currModel)) {
                if (currModel === start) {
                    accept('error', 'cyclic dependency detected when following the `check()` call', { node: expr });
                } else {
                    // a cycle is detected but it doesn't start from the invocation expression we're checking,
                    // just break here and the cycle will be reported when we validate the start of it
                }
                break;
            } else {
                seen.add(currModel);
            }

            const policyAttrs = currModel.attributes.filter(
                (attr) => attr.decl.$refText === '@@allow' || attr.decl.$refText === '@@deny',
            );
            for (const attr of policyAttrs) {
                const rule = attr.args[1];
                if (!rule) {
                    continue;
                }
                AstUtils.streamAst(rule).forEach((node) => {
                    if (isCheckInvocation(node)) {
                        tasks.push(node as InvocationExpr);
                    }
                });
            }
        }
    }
}
