/* eslint-disable @typescript-eslint/no-explicit-any */
import type { PolicyKind, PolicyOperationKind } from '@zenstackhq/runtime';
import {
    ExpressionContext,
    PluginError,
    TypeScriptExpressionTransformer,
    TypeScriptExpressionTransformerError,
    getAttributeArg,
    getAuthModel,
    getDataModels,
    getIdFields,
    getLiteral,
    isAuthInvocation,
    isEnumFieldReference,
    isFromStdlib,
    isFutureExpr,
    resolved,
} from '@zenstackhq/sdk';
import {
    Enum,
    Model,
    isDataModel,
    isDataModelField,
    isExpression,
    isInvocationExpr,
    isMemberAccessExpr,
    isReferenceExpr,
    isThisExpr,
    type DataModel,
    type DataModelField,
    type Expression,
} from '@zenstackhq/sdk/ast';
import { streamAllContents, streamAst, streamContents } from 'langium';
import { SourceFile, WriterFunction } from 'ts-morph';
import { name } from '..';
import { isCollectionPredicate } from '../../../utils/ast-utils';
import { ExpressionWriter, FALSE, TRUE } from './expression-writer';

/**
 * Get policy expressions for the given model or field and operation kind
 */
export function getPolicyExpressions(
    target: DataModel | DataModelField,
    kind: PolicyKind,
    operation: PolicyOperationKind,
    override = false
) {
    const attributes = target.attributes;
    const attrName = isDataModel(target) ? `@@${kind}` : `@${kind}`;
    const attrs = attributes.filter((attr) => {
        if (attr.decl.ref?.name !== attrName) {
            return false;
        }

        if (override) {
            const overrideArg = getAttributeArg(attr, 'override');
            return overrideArg && getLiteral<boolean>(overrideArg) === true;
        } else {
            return true;
        }
    });

    const checkOperation = operation === 'postUpdate' ? 'update' : operation;

    let result = attrs
        .filter((attr) => {
            const opsValue = getLiteral<string>(attr.args[0].value);
            if (!opsValue) {
                return false;
            }
            const ops = opsValue.split(',').map((s) => s.trim());
            return ops.includes(checkOperation) || ops.includes('all');
        })
        .map((attr) => attr.args[1].value);

    if (operation === 'update') {
        result = processUpdatePolicies(result, false);
    } else if (operation === 'postUpdate') {
        result = processUpdatePolicies(result, true);
    }

    return result;
}

function hasFutureReference(expr: Expression) {
    for (const node of streamAst(expr)) {
        if (isInvocationExpr(node) && node.function.ref?.name === 'future' && isFromStdlib(node.function.ref)) {
            return true;
        }
    }
    return false;
}

function processUpdatePolicies(expressions: Expression[], postUpdate: boolean) {
    const hasFutureRef = expressions.some(hasFutureReference);
    if (postUpdate) {
        // when compiling post-update rules, if any rule contains `future()` reference,
        // we include all as post-update rules
        return hasFutureRef ? expressions : [];
    } else {
        // when compiling pre-update rules, if any rule contains `future()` reference,
        // we completely skip pre-update check and defer them to post-update
        return hasFutureRef ? [] : expressions;
    }
}

/**
 * Generates a "select" object that contains (recursively) fields referenced by the
 * given policy rules
 */
export function generateSelectForRules(rules: Expression[], forAuthContext = false): object {
    const result: any = {};
    const addPath = (path: string[]) => {
        let curr = result;
        path.forEach((seg, i) => {
            if (i === path.length - 1) {
                curr[seg] = true;
            } else {
                if (!curr[seg]) {
                    curr[seg] = { select: {} };
                }
                curr = curr[seg].select;
            }
        });
    };

    // visit a reference or member access expression to build a
    // selection path
    const visit = (node: Expression): string[] | undefined => {
        if (isThisExpr(node)) {
            return [];
        }

        if (isReferenceExpr(node)) {
            const target = resolved(node.target);
            if (isDataModelField(target)) {
                // a field selection, it's a terminal
                return [target.name];
            }
        }

        if (isMemberAccessExpr(node)) {
            if (forAuthContext && isAuthInvocation(node.operand)) {
                return [node.member.$refText];
            }

            if (isFutureExpr(node.operand)) {
                // future().field is not subject to pre-update select
                return undefined;
            }

            // build a selection path inside-out for chained member access
            const inner = visit(node.operand);
            if (inner) {
                return [...inner, node.member.$refText];
            }
        }

        return undefined;
    };

    // collect selection paths from the given expression
    const collectReferencePaths = (expr: Expression): string[][] => {
        if (isThisExpr(expr) && !isMemberAccessExpr(expr.$container)) {
            // a standalone `this` expression, include all id fields
            const model = expr.$resolvedType?.decl as DataModel;
            const idFields = getIdFields(model);
            return idFields.map((field) => [field.name]);
        }

        if (isMemberAccessExpr(expr) || isReferenceExpr(expr)) {
            const path = visit(expr);
            if (path) {
                if (isDataModel(expr.$resolvedType?.decl)) {
                    // member selection ended at a data model field, include its id fields
                    const idFields = getIdFields(expr.$resolvedType?.decl as DataModel);
                    return idFields.map((field) => [...path, field.name]);
                } else {
                    return [path];
                }
            } else {
                return [];
            }
        } else if (isCollectionPredicate(expr)) {
            const path = visit(expr.left);
            if (path) {
                // recurse into RHS
                const rhs = collectReferencePaths(expr.right);
                // combine path of LHS and RHS
                return rhs.map((r) => [...path, ...r]);
            } else {
                return [];
            }
        } else if (isInvocationExpr(expr)) {
            // recurse into function arguments
            return expr.args.flatMap((arg) => collectReferencePaths(arg.value));
        } else {
            // recurse
            const children = streamContents(expr)
                .filter((child): child is Expression => isExpression(child))
                .toArray();
            return children.flatMap((child) => collectReferencePaths(child));
        }
    };

    for (const rule of rules) {
        const paths = collectReferencePaths(rule);
        paths.forEach((p) => addPath(p));
    }

    return Object.keys(result).length === 0 ? undefined : result;
}

/**
 * Generates a query guard function that returns a partial Prisma query for the given model or field
 */
export function generateQueryGuardFunction(
    sourceFile: SourceFile,
    model: DataModel,
    kind: PolicyOperationKind,
    allows: Expression[],
    denies: Expression[],
    forField?: DataModelField,
    fieldOverride = false
) {
    const statements: (string | WriterFunction)[] = [];

    generateNormalizedAuthRef(model, allows, denies, statements);

    const hasFieldAccess = [...denies, ...allows].some((rule) =>
        streamAst(rule).some(
            (child) =>
                // this.???
                isThisExpr(child) ||
                // future().???
                isFutureExpr(child) ||
                // field reference
                (isReferenceExpr(child) && isDataModelField(child.target.ref))
        )
    );

    if (!hasFieldAccess) {
        // none of the rules reference model fields, we can compile down to a plain boolean
        // function in this case (so we can skip doing SQL queries when validating)
        statements.push((writer) => {
            const transformer = new TypeScriptExpressionTransformer({
                context: ExpressionContext.AccessPolicy,
                isPostGuard: kind === 'postUpdate',
            });
            try {
                denies.forEach((rule) => {
                    writer.write(`if (${transformer.transform(rule, false)}) { return ${FALSE}; }`);
                });
                allows.forEach((rule) => {
                    writer.write(`if (${transformer.transform(rule, false)}) { return ${TRUE}; }`);
                });
            } catch (err) {
                if (err instanceof TypeScriptExpressionTransformerError) {
                    throw new PluginError(name, err.message);
                } else {
                    throw err;
                }
            }

            if (forField) {
                if (allows.length === 0) {
                    // if there's no allow rule, for field-level rules, by default we allow
                    writer.write(`return ${TRUE};`);
                } else {
                    // if there's any allow rule, we deny unless any allow rule evaluates to true
                    writer.write(`return ${FALSE};`);
                }
            } else {
                // for model-level rules, the default is always deny
                writer.write(`return ${FALSE};`);
            }
        });
    } else {
        statements.push((writer) => {
            writer.write('return ');
            const exprWriter = new ExpressionWriter(writer, kind === 'postUpdate');
            const writeDenies = () => {
                writer.conditionalWrite(denies.length > 1, '{ AND: [');
                denies.forEach((expr, i) => {
                    writer.inlineBlock(() => {
                        writer.write('NOT: ');
                        exprWriter.write(expr);
                    });
                    writer.conditionalWrite(i !== denies.length - 1, ',');
                });
                writer.conditionalWrite(denies.length > 1, ']}');
            };

            const writeAllows = () => {
                writer.conditionalWrite(allows.length > 1, '{ OR: [');
                allows.forEach((expr, i) => {
                    exprWriter.write(expr);
                    writer.conditionalWrite(i !== allows.length - 1, ',');
                });
                writer.conditionalWrite(allows.length > 1, ']}');
            };

            if (allows.length > 0 && denies.length > 0) {
                // include both allow and deny rules
                writer.write('{ AND: [');
                writeDenies();
                writer.write(',');
                writeAllows();
                writer.write(']}');
            } else if (denies.length > 0) {
                // only deny rules
                writeDenies();
            } else if (allows.length > 0) {
                // only allow rules
                writeAllows();
            } else {
                // disallow any operation
                writer.write(`{ OR: [] }`);
            }
            writer.write(';');
        });
    }

    const func = sourceFile.addFunction({
        name: `${model.name}${forField ? '$' + forField.name : ''}${fieldOverride ? '$override' : ''}_${kind}`,
        returnType: 'any',
        parameters: [
            {
                name: 'context',
                type: 'QueryContext',
            },
            {
                // for generating field references used by field comparison in the same model
                name: 'db',
                type: 'CrudContract',
            },
        ],
        statements,
    });

    return func;
}

/**
 * Generates a normalized auth reference for the given policy rules
 */
export function generateNormalizedAuthRef(
    model: DataModel,
    allows: Expression[],
    denies: Expression[],
    statements: (string | WriterFunction)[]
) {
    // check if any allow or deny rule contains 'auth()' invocation
    const hasAuthRef = [...allows, ...denies].some((rule) => streamAst(rule).some((child) => isAuthInvocation(child)));

    if (hasAuthRef) {
        const authModel = getAuthModel(getDataModels(model.$container, true));
        if (!authModel) {
            throw new PluginError(name, 'Auth model not found');
        }
        const userIdFields = getIdFields(authModel);
        if (!userIdFields || userIdFields.length === 0) {
            throw new PluginError(name, 'User model does not have an id field');
        }

        // normalize user to null to avoid accidentally use undefined in filter
        statements.push(`const user: any = context.user ?? null;`);
    }
}

/**
 * Check if the given enum is referenced in the model
 */
export function isEnumReferenced(model: Model, decl: Enum): unknown {
    return streamAllContents(model).some((node) => {
        if (isDataModelField(node) && node.type.reference?.ref === decl) {
            // referenced as field type
            return true;
        }
        if (isEnumFieldReference(node) && node.target.ref?.$container === decl) {
            // enum field is referenced
            return true;
        }
        return false;
    });
}
