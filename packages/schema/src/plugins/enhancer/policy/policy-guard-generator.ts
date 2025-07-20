import {
    DataModel,
    DataModelField,
    Expression,
    InvocationExpr,
    Model,
    ReferenceExpr,
    isDataModel,
    isDataModelField,
    isEnum,
    isMemberAccessExpr,
    isReferenceExpr,
    isThisExpr,
    isTypeDef,
    isAliasDecl,
} from '@zenstackhq/language/ast';

import { PolicyCrudKind, type PolicyOperationKind } from '@zenstackhq/runtime';
import {
    type CodeWriter,
    ExpressionContext,
    FastWriter,
    PluginOptions,
    PolicyAnalysisResult,
    RUNTIME_PACKAGE,
    TypeScriptExpressionTransformer,
    analyzePolicies,
    getDataModels,
    hasAttribute,
    hasValidationAttributes,
    isAuthInvocation,
    isForeignKeyField,
    saveSourceFile,
} from '@zenstackhq/sdk';
import { getPrismaClientImportSpec } from '@zenstackhq/sdk/prisma';
import { lowerCaseFirst } from '@zenstackhq/runtime/local-helpers';
import { streamAst } from 'langium';
import path from 'path';
import { FunctionDeclarationStructure, OptionalKind, Project, SourceFile, VariableDeclarationKind } from 'ts-morph';
import { isCheckInvocation } from '../../../utils/ast-utils';
import { ConstraintTransformer } from './constraint-transformer';
import {
    generateConstantQueryGuardFunction,
    generateEntityCheckerFunction,
    generateNormalizedAuthRef,
    generateQueryGuardFunction,
    generateSelectForRules,
    getPolicyExpressions,
    isEnumReferenced,
} from './utils';

/**
 * Generates source file that contains Prisma query guard objects used for injecting database queries
 */
export class PolicyGenerator {
    private extraFunctions: OptionalKind<FunctionDeclarationStructure>[] = [];

    constructor(private options: PluginOptions) {}

    generate(project: Project, model: Model, output: string) {
        const sf = project.createSourceFile(path.join(output, 'policy.ts'), undefined, { overwrite: true });

        this.writeImports(model, output, sf);

        this.writeAliasFunctions(model);

        const models = getDataModels(model);

        const writer = new FastWriter();
        writer.block(() => {
            this.writePolicy(writer, models);
            this.writeValidationMeta(writer, models);
            this.writeAuthSelector(models, writer);
        });

        sf.addVariableStatement({
            declarationKind: VariableDeclarationKind.Const,
            declarations: [
                {
                    name: 'policy',
                    type: 'PolicyDef',
                    initializer: writer.result,
                },
            ],
        });

        if (this.extraFunctions.length > 0) {
            sf.addFunctions(this.extraFunctions);
        }

        sf.addStatements('export default policy');

        // save ts files if requested explicitly or the user provided
        const preserveTsFiles = this.options.preserveTsFiles === true || !!this.options.output;
        if (preserveTsFiles) {
            saveSourceFile(sf);
        }
    }

    private writeImports(model: Model, output: string, sf: SourceFile) {
        sf.addImportDeclaration({
            namedImports: [
                { name: 'type QueryContext' },
                { name: 'type CrudContract' },
                { name: 'type PermissionCheckerContext' },
            ],
            moduleSpecifier: `${RUNTIME_PACKAGE}`,
        });

        sf.addImportDeclaration({
            namedImports: [{ name: 'allFieldsEqual' }],
            moduleSpecifier: `${RUNTIME_PACKAGE}/validation`,
        });

        sf.addImportDeclaration({
            namedImports: [{ name: 'type PolicyDef' }, { name: 'type PermissionCheckerConstraint' }],
            moduleSpecifier: `${RUNTIME_PACKAGE}/enhancements/node`,
        });

        // import enums
        const prismaImport = getPrismaClientImportSpec(output, this.options);
        for (const e of model.declarations.filter((d) => isEnum(d) && isEnumReferenced(model, d))) {
            sf.addImportDeclaration({
                namedImports: [{ name: e.name }],
                moduleSpecifier: prismaImport,
            });
        }
    }

    private writePolicy(writer: CodeWriter, models: DataModel[]) {
        writer.write('policy:');
        writer.inlineBlock(() => {
            for (const model of models) {
                writer.write(`${lowerCaseFirst(model.name)}:`);

                writer.block(() => {
                    // model-level guards
                    this.writeModelLevelDefs(model, writer);

                    // field-level guards
                    this.writeFieldLevelDefs(model, writer);
                });

                writer.writeLine(',');
            }
        });
        writer.writeLine(',');
    }

    // #region Model-level definitions

    // writes model-level policy def for each operation kind for a model
    // `[modelName]: { [operationKind]: [funcName] },`
    private writeModelLevelDefs(model: DataModel, writer: CodeWriter) {
        const policies = analyzePolicies(model);
        writer.write('modelLevel:');
        writer.inlineBlock(() => {
            this.writeModelReadDef(model, policies, writer);
            this.writeModelCreateDef(model, policies, writer);
            this.writeModelUpdateDef(model, policies, writer);
            this.writeModelPostUpdateDef(model, policies, writer);
            this.writeModelDeleteDef(model, policies, writer);
        });
        writer.writeLine(',');
    }

    // writes `read: ...` for a given model
    private writeModelReadDef(model: DataModel, policies: PolicyAnalysisResult, writer: CodeWriter) {
        writer.write(`read:`);
        writer.inlineBlock(() => {
            this.writeCommonModelDef(model, 'read', policies, writer);
        });
        writer.writeLine(',');
    }

    // writes `create: ...` for a given model
    private writeModelCreateDef(model: DataModel, policies: PolicyAnalysisResult, writer: CodeWriter) {
        writer.write(`create:`);
        writer.inlineBlock(() => {
            this.writeCommonModelDef(model, 'create', policies, writer);

            // create policy has an additional input checker for validating the payload
            this.writeCreateInputChecker(model, writer);
        });
        writer.writeLine(',');
    }

    // writes `inputChecker: [funcName]` for a given model
    private writeCreateInputChecker(model: DataModel, writer: CodeWriter) {
        if (this.canCheckCreateBasedOnInput(model)) {
            const inputCheckFuncName = this.generateCreateInputCheckerFunction(model);
            writer.write(`inputChecker: ${inputCheckFuncName},`);
        }
    }

    private canCheckCreateBasedOnInput(model: DataModel) {
        const allows = getPolicyExpressions(model, 'allow', 'create', false, 'all');
        const denies = getPolicyExpressions(model, 'deny', 'create', false, 'all');

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

    // generates a function for checking "create" input
    private generateCreateInputCheckerFunction(model: DataModel) {
        const statements: string[] = [];
        const allows = getPolicyExpressions(model, 'allow', 'create');
        const denies = getPolicyExpressions(model, 'deny', 'create');

        generateNormalizedAuthRef(model, allows, denies, statements);

        // write allow and deny rules
        const writer = new FastWriter();
        if (allows.length === 0) {
            writer.write('return false;');
        } else {
            const transformer = new TypeScriptExpressionTransformer({
                context: ExpressionContext.AccessPolicy,
                fieldReferenceContext: 'input',
                operationContext: 'create',
            });

            let expr =
                denies.length > 0
                    ? '!(' +
                      denies
                          .map((deny) => {
                              return transformer.transform(deny, false);
                          })
                          .join(' || ') +
                      ')'
                    : undefined;

            const allowStmt = allows
                .map((allow) => {
                    return transformer.transform(allow, false);
                })
                .join(' || ');

            expr = expr ? `${expr} && (${allowStmt})` : allowStmt;
            writer.write('return ' + expr);
        }
        statements.push(writer.result);

        const funcName = model.name + '_create_input';
        this.extraFunctions.push({
            name: funcName,
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

        return funcName;
    }

    // writes `update: ...` for a given model
    private writeModelUpdateDef(model: DataModel, policies: PolicyAnalysisResult, writer: CodeWriter) {
        writer.write(`update:`);
        writer.inlineBlock(() => {
            this.writeCommonModelDef(model, 'update', policies, writer);
        });
        writer.writeLine(',');
    }

    // writes `postUpdate: ...` for a given model
    private writeModelPostUpdateDef(model: DataModel, policies: PolicyAnalysisResult, writer: CodeWriter) {
        writer.write(`postUpdate:`);
        writer.inlineBlock(() => {
            this.writeCommonModelDef(model, 'postUpdate', policies, writer);

            // post-update policy has an additional selector for reading the pre-update entity data
            this.writePostUpdatePreValueSelector(model, writer);
        });
        writer.writeLine(',');
    }

    private writePostUpdatePreValueSelector(model: DataModel, writer: CodeWriter) {
        const allows = getPolicyExpressions(model, 'allow', 'postUpdate');
        const denies = getPolicyExpressions(model, 'deny', 'postUpdate');
        const preValueSelect = generateSelectForRules([...allows, ...denies], 'postUpdate');
        if (preValueSelect) {
            writer.writeLine(`preUpdateSelector: ${JSON.stringify(preValueSelect)},`);
        }
    }

    // writes `delete: ...` for a given model
    private writeModelDeleteDef(model: DataModel, policies: PolicyAnalysisResult, writer: CodeWriter) {
        writer.write(`delete:`);
        writer.inlineBlock(() => {
            this.writeCommonModelDef(model, 'delete', policies, writer);
        });
    }

    // writes `[kind]: ...` for a given model
    private writeCommonModelDef(
        model: DataModel,
        kind: PolicyOperationKind,
        policies: PolicyAnalysisResult,
        writer: CodeWriter
    ) {
        const allows = getPolicyExpressions(model, 'allow', kind);
        const denies = getPolicyExpressions(model, 'deny', kind);

        // policy guard
        this.writePolicyGuard(model, kind, policies, allows, denies, writer);

        // permission checker
        if (kind !== 'postUpdate') {
            this.writePermissionChecker(model, kind, policies, allows, denies, writer);
        }

        // write cross-model comparison rules as entity checker functions
        // because they cannot be checked inside Prisma
        const { functionName, selector } = this.writeEntityChecker(model, kind, false);

        if (this.shouldUseEntityChecker(model, kind, true, false)) {
            writer.write(`entityChecker: { func: ${functionName}, selector: ${JSON.stringify(selector)} },`);
        }
    }

    private shouldUseEntityChecker(
        target: DataModel | DataModelField,
        kind: PolicyOperationKind,
        onlyCrossModelComparison: boolean,
        forOverride: boolean
    ): boolean {
        const allows = getPolicyExpressions(
            target,
            'allow',
            kind,
            forOverride,
            onlyCrossModelComparison ? 'onlyCrossModelComparison' : 'all'
        );
        const denies = getPolicyExpressions(
            target,
            'deny',
            kind,
            forOverride,
            onlyCrossModelComparison ? 'onlyCrossModelComparison' : 'all'
        );

        if (allows.length > 0 || denies.length > 0) {
            return true;
        }

        const allRules = [
            ...getPolicyExpressions(target, 'allow', kind, forOverride, 'all'),
            ...getPolicyExpressions(target, 'deny', kind, forOverride, 'all'),
        ];

        return allRules.some((rule) => {
            return streamAst(rule).some((node) => {
                if (isCheckInvocation(node)) {
                    const expr = node as InvocationExpr;
                    const fieldRef = expr.args[0].value as ReferenceExpr;
                    const targetModel = fieldRef.$resolvedType?.decl as DataModel;
                    return this.shouldUseEntityChecker(targetModel, kind, onlyCrossModelComparison, forOverride);
                }
                return false;
            });
        });
    }

    private writeEntityChecker(target: DataModel | DataModelField, kind: PolicyOperationKind, forOverride: boolean) {
        const allows = getPolicyExpressions(target, 'allow', kind, forOverride, 'all');
        const denies = getPolicyExpressions(target, 'deny', kind, forOverride, 'all');

        const model = isDataModel(target) ? target : (target.$container as DataModel);
        const func = generateEntityCheckerFunction(
            model,
            kind,
            allows,
            denies,
            isDataModelField(target) ? target : undefined,
            forOverride
        );
        this.extraFunctions.push(func);
        const selector = generateSelectForRules([...allows, ...denies], kind, false, kind !== 'postUpdate') ?? {};

        return { functionName: func.name, selector };
    }

    // writes `guard: ...` for a given policy operation kind
    private writePolicyGuard(
        model: DataModel,
        kind: PolicyOperationKind,
        policies: ReturnType<typeof analyzePolicies>,
        allows: Expression[],
        denies: Expression[],
        writer: CodeWriter
    ) {
        // first handle several cases where a constant function can be used

        if (kind === 'update' && allows.length === 0) {
            // no allow rule for 'update', policy is constant based on if there's
            // post-update counterpart
            let func: OptionalKind<FunctionDeclarationStructure>;
            if (getPolicyExpressions(model, 'allow', 'postUpdate').length === 0) {
                func = generateConstantQueryGuardFunction(model, kind, false);
            } else {
                func = generateConstantQueryGuardFunction(model, kind, true);
            }
            this.extraFunctions.push(func);
            writer.write(`guard: ${func.name},`);
            return;
        }

        if (kind === 'postUpdate' && allows.length === 0 && denies.length === 0) {
            // no 'postUpdate' rule, always allow
            const func = generateConstantQueryGuardFunction(model, kind, true);
            this.extraFunctions.push(func);
            writer.write(`guard: ${func.name},`);
            return;
        }

        if (kind in policies && typeof policies[kind as keyof typeof policies] === 'boolean') {
            // constant policy
            const func = generateConstantQueryGuardFunction(
                model,
                kind,
                policies[kind as keyof typeof policies] as boolean
            );
            this.extraFunctions.push(func);
            writer.write(`guard: ${func.name},`);
            return;
        }

        // generate a policy function that evaluates a partial prisma query
        const guardFunc = generateQueryGuardFunction(model, kind, allows, denies);
        this.extraFunctions.push(guardFunc);
        writer.write(`guard: ${guardFunc.name},`);
    }

    /**
     * Generates functions for the Aliases
     */
    private writeAliasFunctions(model: Model) {
        for (const decl of model.declarations) {
            if (isAliasDecl(decl)) {
                const alias = decl;
                const params = alias.params?.map((p) => ({ name: p.name, type: 'any' })) ?? [];
                if (alias.expression.$cstNode?.text.includes('auth()')) {
                    params.push({
                        name: 'user',
                        type: 'PermissionCheckerContext["user"]',
                    });
                }
                const transformer = new TypeScriptExpressionTransformer({
                    context: ExpressionContext.AliasFunction,
                });
                const writer = new FastWriter();
                try {
                    writer.write('return ');
                    writer.write(transformer.transform(alias.expression, false));
                    writer.write(';');
                } catch (e) {
                    writer.write('return undefined /* erreur de transformation de la règle */;');
                }
                this.extraFunctions.push({
                    name: alias.name,
                    returnType: 'any',
                    parameters: params,
                    statements: [writer.result],
                });
            }
        }
    }

    // writes `permissionChecker: ...` for a given policy operation kind
    private writePermissionChecker(
        model: DataModel,
        kind: PolicyCrudKind,
        policies: PolicyAnalysisResult,
        allows: Expression[],
        denies: Expression[],
        writer: CodeWriter
    ) {
        if (this.options.generatePermissionChecker !== true) {
            return;
        }

        if (policies[kind] === true || policies[kind] === false) {
            // constant policy
            writer.write(`permissionChecker: ${policies[kind]},`);
            return;
        }

        if (kind === 'update' && allows.length === 0) {
            // no allow rule for 'update', policy is constant based on if there's
            // post-update counterpart
            if (getPolicyExpressions(model, 'allow', 'postUpdate').length === 0) {
                writer.write(`permissionChecker: false,`);
            } else {
                writer.write(`permissionChecker: true,`);
            }
            return;
        }

        const guardFuncName = this.generatePermissionCheckerFunction(model, kind, allows, denies);
        writer.write(`permissionChecker: ${guardFuncName},`);
    }

    private generatePermissionCheckerFunction(
        model: DataModel,
        kind: string,
        allows: Expression[],
        denies: Expression[]
    ) {
        const statements: string[] = [];

        generateNormalizedAuthRef(model, allows, denies, statements);

        const transformed = new ConstraintTransformer({
            authAccessor: 'user',
        }).transformRules(allows, denies);

        statements.push(`return ${transformed};`);

        const funcName = `${model.name}$checker$${kind}`;
        this.extraFunctions.push({
            name: funcName,
            returnType: 'PermissionCheckerConstraint',
            parameters: [
                {
                    name: 'context',
                    type: 'PermissionCheckerContext',
                },
            ],
            statements,
        });

        return funcName;
    }

    // #endregion

    // #region Field-level definitions

    private writeFieldLevelDefs(model: DataModel, writer: CodeWriter) {
        writer.write('fieldLevel:');
        writer.inlineBlock(() => {
            this.writeFieldReadDef(model, writer);
            this.writeFieldUpdateDef(model, writer);
        });
        writer.writeLine(',');
    }

    private writeFieldReadDef(model: DataModel, writer: CodeWriter) {
        writer.writeLine('read:');
        writer.block(() => {
            for (const field of model.fields) {
                const allows = getPolicyExpressions(field, 'allow', 'read');
                const denies = getPolicyExpressions(field, 'deny', 'read');
                const overrideAllows = getPolicyExpressions(field, 'allow', 'read', true);

                if (allows.length === 0 && denies.length === 0 && overrideAllows.length === 0) {
                    continue;
                }

                writer.write(`${field.name}:`);

                writer.block(() => {
                    // guard
                    const guardFunc = generateQueryGuardFunction(model, 'read', allows, denies, field);
                    this.extraFunctions.push(guardFunc);
                    writer.write(`guard: ${guardFunc.name},`);

                    // checker function
                    // write all field-level rules as entity checker function
                    const { functionName, selector } = this.writeEntityChecker(field, 'read', false);

                    if (this.shouldUseEntityChecker(field, 'read', false, false)) {
                        writer.write(
                            `entityChecker: { func: ${functionName}, selector: ${JSON.stringify(selector)} },`
                        );
                    }

                    if (overrideAllows.length > 0) {
                        // override guard function
                        const denies = getPolicyExpressions(field, 'deny', 'read');
                        const overrideGuardFunc = generateQueryGuardFunction(
                            model,
                            'read',
                            overrideAllows,
                            denies,
                            field,
                            true
                        );
                        this.extraFunctions.push(overrideGuardFunc);
                        writer.write(`overrideGuard: ${overrideGuardFunc.name},`);

                        // additional entity checker for override
                        const { functionName, selector } = this.writeEntityChecker(field, 'read', true);
                        if (this.shouldUseEntityChecker(field, 'read', false, true)) {
                            writer.write(
                                `overrideEntityChecker: { func: ${functionName}, selector: ${JSON.stringify(
                                    selector
                                )} },`
                            );
                        }
                    }
                });
                writer.writeLine(',');
            }
        });
        writer.writeLine(',');
    }

    private writeFieldUpdateDef(model: DataModel, writer: CodeWriter) {
        writer.writeLine('update:');
        writer.block(() => {
            for (const field of model.fields) {
                const allows = getPolicyExpressions(field, 'allow', 'update');
                const denies = getPolicyExpressions(field, 'deny', 'update');
                const overrideAllows = getPolicyExpressions(field, 'allow', 'update', true);

                if (allows.length === 0 && denies.length === 0 && overrideAllows.length === 0) {
                    continue;
                }

                writer.write(`${field.name}:`);

                writer.block(() => {
                    // guard
                    const guardFunc = generateQueryGuardFunction(model, 'update', allows, denies, field);
                    this.extraFunctions.push(guardFunc);
                    writer.write(`guard: ${guardFunc.name},`);

                    // write cross-model comparison rules as entity checker functions
                    // because they cannot be checked inside Prisma
                    const { functionName, selector } = this.writeEntityChecker(field, 'update', false);
                    if (this.shouldUseEntityChecker(field, 'update', true, false)) {
                        writer.write(
                            `entityChecker: { func: ${functionName}, selector: ${JSON.stringify(selector)} },`
                        );
                    }

                    if (overrideAllows.length > 0) {
                        // override guard
                        const overrideGuardFunc = generateQueryGuardFunction(
                            model,
                            'update',
                            overrideAllows,
                            denies,
                            field,
                            true
                        );
                        this.extraFunctions.push(overrideGuardFunc);
                        writer.write(`overrideGuard: ${overrideGuardFunc.name},`);

                        // write cross-model comparison override rules as entity checker functions
                        // because they cannot be checked inside Prisma
                        const { functionName, selector } = this.writeEntityChecker(field, 'update', true);
                        if (this.shouldUseEntityChecker(field, 'update', true, true)) {
                            writer.write(
                                `overrideEntityChecker: { func: ${functionName}, selector: ${JSON.stringify(
                                    selector
                                )} },`
                            );
                        }
                    }
                });
                writer.writeLine(',');
            }
        });
        writer.writeLine(',');
    }

    // #endregion

    //#region Auth selector

    private writeAuthSelector(models: DataModel[], writer: CodeWriter) {
        const authSelector = this.generateAuthSelector(models);
        if (authSelector) {
            writer.write(`authSelector: ${JSON.stringify(authSelector)},`);
        }
    }

    // Generates a { select: ... } object to select `auth()` fields used in policy rules
    private generateAuthSelector(models: DataModel[]) {
        const authRules: Expression[] = [];

        models.forEach((model) => {
            // model-level rules
            const modelPolicyAttrs = model.attributes.filter((attr) =>
                ['@@allow', '@@deny'].includes(attr.decl.$refText)
            );

            // field-level rules
            const fieldPolicyAttrs = model.fields
                .flatMap((f) => f.attributes)
                .filter((attr) => ['@allow', '@deny'].includes(attr.decl.$refText));

            // all rule expression
            const allExpressions = [...modelPolicyAttrs, ...fieldPolicyAttrs]
                .filter((attr) => attr.args.length > 1)
                .map((attr) => attr.args[1].value);

            // collect `auth()` member access
            allExpressions.forEach((rule) => {
                streamAst(rule).forEach((node) => {
                    if (isMemberAccessExpr(node) && isAuthInvocation(node.operand)) {
                        authRules.push(node);
                    }
                });
            });
        });

        if (authRules.length > 0) {
            return generateSelectForRules(authRules, undefined, true);
        } else {
            return undefined;
        }
    }

    // #endregion

    // #region Validation meta

    private writeValidationMeta(writer: CodeWriter, models: DataModel[]) {
        writer.write('validation:');
        writer.inlineBlock(() => {
            for (const model of models) {
                writer.write(`${lowerCaseFirst(model.name)}:`);
                writer.inlineBlock(() => {
                    writer.write(
                        `hasValidation: ${
                            // explicit validation rules
                            hasValidationAttributes(model) ||
                            // type-def fields require schema validation
                            this.hasTypeDefFields(model)
                        }`
                    );
                });
                writer.writeLine(',');
            }
        });
        writer.writeLine(',');
    }

    private hasTypeDefFields(model: DataModel): boolean {
        return model.fields.some((f) => isTypeDef(f.type.reference?.ref));
    }

    // #endregion
}
