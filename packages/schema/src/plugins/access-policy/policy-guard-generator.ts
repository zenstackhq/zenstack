import {
    DataModel,
    DataModelAttribute,
    DataModelField,
    DataModelFieldAttribute,
    Enum,
    Expression,
    Model,
    isBinaryExpr,
    isDataModel,
    isDataModelField,
    isEnum,
    isExpression,
    isInvocationExpr,
    isMemberAccessExpr,
    isReferenceExpr,
    isThisExpr,
    isUnaryExpr,
} from '@zenstackhq/language/ast';
import {
    FIELD_LEVEL_READ_CHECKER_PREFIX,
    FIELD_LEVEL_READ_CHECKER_SELECTOR,
    FIELD_LEVEL_UPDATE_GUARD_PREFIX,
    HAS_FIELD_LEVEL_POLICY_FLAG,
    PRE_UPDATE_VALUE_SELECTOR,
    type PolicyKind,
    type PolicyOperationKind,
} from '@zenstackhq/runtime';
import {
    ExpressionContext,
    PluginError,
    PluginGlobalOptions,
    PluginOptions,
    RUNTIME_PACKAGE,
    analyzePolicies,
    createProject,
    emitProject,
    getAuthModel,
    getDataModels,
    getLiteral,
    getPrismaClientImportSpec,
    hasAttribute,
    hasValidationAttributes,
    isEnumFieldReference,
    isForeignKeyField,
    isFromStdlib,
    isFutureExpr,
    resolvePath,
    resolved,
    saveProject,
} from '@zenstackhq/sdk';
import { streamAllContents, streamAst, streamContents } from 'langium';
import { lowerCaseFirst } from 'lower-case-first';
import path from 'path';
import { FunctionDeclaration, SourceFile, VariableDeclarationKind, WriterFunction } from 'ts-morph';
import { name } from '.';
import { getIdFields, isAuthInvocation, isCollectionPredicate } from '../../utils/ast-utils';
import {
    TypeScriptExpressionTransformer,
    TypeScriptExpressionTransformerError,
} from '../../utils/typescript-expression-transformer';
import { ALL_OPERATION_KINDS, getDefaultOutputFolder } from '../plugin-utils';
import { ExpressionWriter, FALSE, TRUE } from './expression-writer';

/**
 * Generates source file that contains Prisma query guard objects used for injecting database queries
 */
export default class PolicyGenerator {
    async generate(model: Model, options: PluginOptions, globalOptions?: PluginGlobalOptions) {
        let output = options.output ? (options.output as string) : getDefaultOutputFolder(globalOptions);
        if (!output) {
            throw new PluginError(options.name, `Unable to determine output path, not running plugin`);
        }
        output = resolvePath(output, options);

        const project = createProject();
        const sf = project.createSourceFile(path.join(output, 'policy.ts'), undefined, { overwrite: true });
        sf.addStatements('/* eslint-disable */');

        sf.addImportDeclaration({
            namedImports: [
                { name: 'type QueryContext' },
                { name: 'type DbOperations' },
                { name: 'hasAllFields' },
                { name: 'allFieldsEqual' },
                { name: 'type PolicyDef' },
            ],
            moduleSpecifier: `${RUNTIME_PACKAGE}`,
        });

        // import enums
        const prismaImport = getPrismaClientImportSpec(model, output);
        for (const e of model.declarations.filter((d) => isEnum(d) && this.isEnumReferenced(model, d))) {
            sf.addImportDeclaration({
                namedImports: [{ name: e.name }],
                moduleSpecifier: prismaImport,
            });
        }

        const models = getDataModels(model);

        const policyMap: Record<string, Record<string, string | boolean | object>> = {};
        for (const model of models) {
            policyMap[model.name] = await this.generateQueryGuardForModel(model, sf);
        }

        sf.addVariableStatement({
            declarationKind: VariableDeclarationKind.Const,
            declarations: [
                {
                    name: 'policy',
                    type: 'PolicyDef',
                    initializer: (writer) => {
                        writer.block(() => {
                            writer.write('guard:');
                            writer.inlineBlock(() => {
                                for (const [model, map] of Object.entries(policyMap)) {
                                    writer.write(`${lowerCaseFirst(model)}:`);
                                    writer.inlineBlock(() => {
                                        for (const [op, func] of Object.entries(map)) {
                                            if (typeof func === 'object') {
                                                writer.write(`${op}: ${JSON.stringify(func)},`);
                                            } else {
                                                writer.write(`${op}: ${func},`);
                                            }
                                        }
                                    });
                                    writer.write(',');
                                }
                            });
                            writer.writeLine(',');

                            writer.write('validation:');
                            writer.inlineBlock(() => {
                                for (const model of models) {
                                    writer.write(`${lowerCaseFirst(model.name)}:`);
                                    writer.inlineBlock(() => {
                                        writer.write(`hasValidation: ${hasValidationAttributes(model)}`);
                                    });
                                    writer.writeLine(',');
                                }
                            });
                        });
                    },
                },
            ],
        });

        sf.addStatements('export default policy');

        let shouldCompile = true;
        if (typeof options.compile === 'boolean') {
            // explicit override
            shouldCompile = options.compile;
        } else if (globalOptions) {
            shouldCompile = globalOptions.compile;
        }

        if (!shouldCompile || options.preserveTsFiles === true) {
            // save ts files
            await saveProject(project);
        }
        if (shouldCompile) {
            await emitProject(project);
        }
    }

    private isEnumReferenced(model: Model, decl: Enum): unknown {
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

    private getPolicyExpressions(target: DataModel | DataModelField, kind: PolicyKind, operation: PolicyOperationKind) {
        const attributes = target.attributes as (DataModelAttribute | DataModelFieldAttribute)[];
        const attrName = isDataModel(target) ? `@@${kind}` : `@${kind}`;
        const attrs = attributes.filter((attr) => attr.decl.ref?.name === attrName);

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
            result = this.processUpdatePolicies(result, false);
        } else if (operation === 'postUpdate') {
            result = this.processUpdatePolicies(result, true);
        }

        return result;
    }

    private processUpdatePolicies(expressions: Expression[], postUpdate: boolean) {
        const hasFutureReference = expressions.some((expr) => this.hasFutureReference(expr));
        if (postUpdate) {
            // when compiling post-update rules, if any rule contains `future()` reference,
            // we include all as post-update rules
            return hasFutureReference ? expressions : [];
        } else {
            // when compiling pre-update rules, if any rule contains `future()` reference,
            // we completely skip pre-update check and defer them to post-update
            return hasFutureReference ? [] : expressions;
        }
    }

    private visitPolicyExpression(expr: Expression, postUpdate: boolean): Expression | undefined {
        if (isBinaryExpr(expr) && (expr.operator === '&&' || expr.operator === '||')) {
            const left = this.visitPolicyExpression(expr.left, postUpdate);
            const right = this.visitPolicyExpression(expr.right, postUpdate);
            if (!left) return right;
            if (!right) return left;
            return { ...expr, left, right };
        }

        if (isUnaryExpr(expr) && expr.operator === '!') {
            const operand = this.visitPolicyExpression(expr.operand, postUpdate);
            if (!operand) return undefined;
            return { ...expr, operand };
        }

        if (postUpdate && !this.hasFutureReference(expr)) {
            return undefined;
        } else if (!postUpdate && this.hasFutureReference(expr)) {
            return undefined;
        }

        return expr;
    }

    private hasFutureReference(expr: Expression) {
        for (const node of streamAst(expr)) {
            if (isInvocationExpr(node) && node.function.ref?.name === 'future' && isFromStdlib(node.function.ref)) {
                return true;
            }
        }
        return false;
    }

    private async generateQueryGuardForModel(model: DataModel, sourceFile: SourceFile) {
        const result: Record<string, string | boolean | object> = {};

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const policies: any = analyzePolicies(model);

        for (const kind of ALL_OPERATION_KINDS) {
            if (policies[kind] === true || policies[kind] === false) {
                result[kind] = policies[kind];
                if (kind === 'create') {
                    result[kind + '_input'] = policies[kind];
                }
                continue;
            }

            const denies = this.getPolicyExpressions(model, 'deny', kind);
            const allows = this.getPolicyExpressions(model, 'allow', kind);

            if (kind === 'update' && allows.length === 0) {
                // no allow rule for 'update', policy is constant based on if there's
                // post-update counterpart
                if (this.getPolicyExpressions(model, 'allow', 'postUpdate').length === 0) {
                    result[kind] = false;
                    continue;
                } else {
                    result[kind] = true;
                    continue;
                }
            }

            if (kind === 'postUpdate' && allows.length === 0 && denies.length === 0) {
                // no rule 'postUpdate', always allow
                result[kind] = true;
                continue;
            }

            const guardFunc = this.generateQueryGuardFunction(sourceFile, model, kind, allows, denies);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            result[kind] = guardFunc.getName()!;

            if (kind === 'postUpdate') {
                const preValueSelect = this.generateSelectForRules(allows, denies);
                if (preValueSelect) {
                    result[PRE_UPDATE_VALUE_SELECTOR] = preValueSelect;
                }
            }

            if (kind === 'create' && this.canCheckCreateBasedOnInput(model, allows, denies)) {
                const inputCheckFunc = this.generateInputCheckFunction(sourceFile, model, kind, allows, denies);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                result[kind + '_input'] = inputCheckFunc.getName()!;
            }
        }

        // generate field read checkers
        this.generateReadFieldsGuards(model, sourceFile, result);

        // generate field update guards
        this.generateUpdateFieldsGuards(model, sourceFile, result);

        return result;
    }

    private generateReadFieldsGuards(
        model: DataModel,
        sourceFile: SourceFile,
        result: Record<string, string | boolean | object>
    ) {
        const allFieldsAllows: Expression[] = [];
        const allFieldsDenies: Expression[] = [];

        for (const field of model.fields) {
            const allows = this.getPolicyExpressions(field, 'allow', 'read');
            const denies = this.getPolicyExpressions(field, 'deny', 'read');
            if (denies.length === 0 && allows.length === 0) {
                continue;
            }

            allFieldsAllows.push(...allows);
            allFieldsDenies.push(...denies);

            const guardFunc = this.generateReadFieldGuardFunction(sourceFile, field, allows, denies);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            result[`${FIELD_LEVEL_READ_CHECKER_PREFIX}${field.name}`] = guardFunc.getName()!;
        }

        if (allFieldsAllows.length > 0 || allFieldsDenies.length > 0) {
            result[HAS_FIELD_LEVEL_POLICY_FLAG] = true;
            const readFieldCheckSelect = this.generateSelectForRules(allFieldsAllows, allFieldsDenies);
            if (readFieldCheckSelect) {
                result[FIELD_LEVEL_READ_CHECKER_SELECTOR] = readFieldCheckSelect;
            }
        }
    }

    private generateReadFieldGuardFunction(
        sourceFile: SourceFile,
        field: DataModelField,
        allows: Expression[],
        denies: Expression[]
    ) {
        const statements: (string | WriterFunction)[] = [];

        this.generateNormalizedAuthRef(field.$container as DataModel, allows, denies, statements);

        // compile rules down to typescript expressions
        statements.push((writer) => {
            const transformer = new TypeScriptExpressionTransformer({
                context: ExpressionContext.AccessPolicy,
                fieldReferenceContext: 'input',
            });

            const denyStmt =
                denies.length > 0
                    ? '!(' +
                      denies
                          .map((deny) => {
                              return transformer.transform(deny);
                          })
                          .join(' || ') +
                      ')'
                    : undefined;

            const allowStmt =
                allows.length > 0
                    ? '(' +
                      allows
                          .map((allow) => {
                              return transformer.transform(allow);
                          })
                          .join(' || ') +
                      ')'
                    : undefined;

            let expr: string | undefined;

            if (denyStmt && allowStmt) {
                expr = `${denyStmt} && ${allowStmt}`;
            } else if (denyStmt) {
                expr = denyStmt;
            } else if (allowStmt) {
                expr = allowStmt;
            } else {
                throw new Error('should not happen');
            }

            writer.write('return ' + expr);
        });

        const func = sourceFile.addFunction({
            name: `${field.$container.name}$${field.name}_read`,
            returnType: 'boolean',
            parameters: [
                {
                    name: 'input',
                    type: 'any',
                },
                {
                    name: 'context',
                    type: 'QueryContext',
                },
            ],
            statements,
        });

        return func;
    }

    private generateUpdateFieldsGuards(
        model: DataModel,
        sourceFile: SourceFile,
        result: Record<string, string | boolean | object>
    ) {
        for (const field of model.fields) {
            const allows = this.getPolicyExpressions(field, 'allow', 'update');
            const denies = this.getPolicyExpressions(field, 'deny', 'update');

            if (denies.length === 0 && allows.length === 0) {
                continue;
            }

            const guardFunc = this.generateQueryGuardFunction(sourceFile, model, 'update', allows, denies, field);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            result[`${FIELD_LEVEL_UPDATE_GUARD_PREFIX}${field.name}`] = guardFunc.getName()!;
        }
    }

    private canCheckCreateBasedOnInput(model: DataModel, allows: Expression[], denies: Expression[]) {
        return [...allows, ...denies].every((rule) => {
            return streamAst(rule).every((expr) => {
                if (isThisExpr(expr)) {
                    return false;
                }
                if (isReferenceExpr(expr)) {
                    if (isDataModel(expr.$resolvedType?.decl)) {
                        // if policy rules uses relation fields,
                        // we can't check based on create input
                        return false;
                    }

                    if (
                        isDataModelField(expr.target.ref) &&
                        expr.target.ref.$container === model &&
                        hasAttribute(expr.target.ref, '@default')
                    ) {
                        // reference to field of current model
                        // if it has default value, we can't check
                        // based on create input
                        return false;
                    }

                    if (isDataModelField(expr.target.ref) && isForeignKeyField(expr.target.ref)) {
                        // reference to foreign key field
                        // we can't check based on create input
                        return false;
                    }
                }

                return true;
            });
        });
    }

    // generates a "select" object that contains (recursively) fields referenced by the
    // given policy rules
    private generateSelectForRules(allows: Expression[], denies: Expression[]): object {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
            if (isReferenceExpr(node)) {
                const target = resolved(node.target);
                if (isDataModelField(target)) {
                    // a field selection, it's a terminal
                    return [target.name];
                }
            } else if (isMemberAccessExpr(node)) {
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
            } else {
                // recurse
                const children = streamContents(expr)
                    .filter((child): child is Expression => isExpression(child))
                    .toArray();
                return children.flatMap((child) => collectReferencePaths(child));
            }
        };

        for (const rule of [...allows, ...denies]) {
            const paths = collectReferencePaths(rule);
            paths.forEach((p) => addPath(p));
        }

        return Object.keys(result).length === 0 ? undefined : result;
    }

    private generateQueryGuardFunction(
        sourceFile: SourceFile,
        model: DataModel,
        kind: PolicyOperationKind,
        allows: Expression[],
        denies: Expression[],
        forField?: DataModelField
    ): FunctionDeclaration {
        const statements: (string | WriterFunction)[] = [];

        this.generateNormalizedAuthRef(model, allows, denies, statements);

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
            name: `${model.name}${forField ? '$' + forField.name : ''}_${kind}`,
            returnType: 'any',
            parameters: [
                {
                    name: 'context',
                    type: 'QueryContext',
                },
                {
                    // for generating field references used by field comparison in the same model
                    name: 'db',
                    type: 'Record<string, DbOperations>',
                },
            ],
            statements,
        });

        return func;
    }

    private generateInputCheckFunction(
        sourceFile: SourceFile,
        model: DataModel,
        kind: 'create' | 'update',
        allows: Expression[],
        denies: Expression[]
    ): FunctionDeclaration {
        const statements: (string | WriterFunction)[] = [];

        this.generateNormalizedAuthRef(model, allows, denies, statements);

        statements.push((writer) => {
            if (allows.length === 0) {
                writer.write('return false;');
                return;
            }

            const transformer = new TypeScriptExpressionTransformer({
                context: ExpressionContext.AccessPolicy,
                fieldReferenceContext: 'input',
            });

            let expr =
                denies.length > 0
                    ? '!(' +
                      denies
                          .map((deny) => {
                              return transformer.transform(deny);
                          })
                          .join(' || ') +
                      ')'
                    : undefined;

            const allowStmt = allows
                .map((allow) => {
                    return transformer.transform(allow);
                })
                .join(' || ');

            expr = expr ? `${expr} && (${allowStmt})` : allowStmt;
            writer.write('return ' + expr);
        });

        const func = sourceFile.addFunction({
            name: model.name + '_' + kind + '_input',
            returnType: 'boolean',
            parameters: [
                {
                    name: 'input',
                    type: 'any',
                },
                {
                    name: 'context',
                    type: 'QueryContext',
                },
            ],
            statements,
        });

        return func;
    }

    private generateNormalizedAuthRef(
        model: DataModel,
        allows: Expression[],
        denies: Expression[],
        statements: (string | WriterFunction)[]
    ) {
        // check if any allow or deny rule contains 'auth()' invocation
        const hasAuthRef = [...allows, ...denies].some((rule) =>
            streamAst(rule).some((child) => isAuthInvocation(child))
        );

        if (hasAuthRef) {
            const authModel = getAuthModel(getDataModels(model.$container));
            if (!authModel) {
                throw new PluginError(name, 'Auth model not found');
            }
            const userIdFields = getIdFields(authModel);
            if (!userIdFields || userIdFields.length === 0) {
                throw new PluginError(name, 'User model does not have an id field');
            }

            // normalize user to null to avoid accidentally use undefined in filter
            statements.push(
                `const user = hasAllFields(context.user, [${userIdFields
                    .map((f) => "'" + f.name + "'")
                    .join(', ')}]) ? context.user as any : null;`
            );
        }
    }
}
