import {
    DataModel,
    DataModelField,
    Enum,
    Expression,
    Model,
    isBinaryExpr,
    isUnaryExpr,
    isDataModel,
    isDataModelField,
    isEnum,
    isExpression,
    isInvocationExpr,
    isMemberAccessExpr,
    isReferenceExpr,
    isThisExpr,
} from '@zenstackhq/language/ast';
import {
    FIELD_LEVEL_OVERRIDE_READ_GUARD_PREFIX,
    FIELD_LEVEL_OVERRIDE_UPDATE_GUARD_PREFIX,
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
    PluginOptions,
    RUNTIME_PACKAGE,
    TypeScriptExpressionTransformer,
    TypeScriptExpressionTransformerError,
    Z3ExpressionTransformer,
    analyzePolicies,
    getAttributeArg,
    getAuthModel,
    getDataModels,
    getIdFields,
    getLiteral,
    getPrismaClientImportSpec,
    hasAttribute,
    hasValidationAttributes,
    isAuthInvocation,
    isEnumFieldReference,
    isForeignKeyField,
    isFromStdlib,
    isFutureExpr,
    resolved,
} from '@zenstackhq/sdk';
import { streamAllContents, streamAst, streamContents } from 'langium';
import { lowerCaseFirst } from 'lower-case-first';
import path from 'path';
import { FunctionDeclaration, Project, SourceFile, VariableDeclarationKind, WriterFunction } from 'ts-morph';
import { name } from '..';
import { isCollectionPredicate } from '../../../utils/ast-utils';
import { ALL_OPERATION_KINDS, CRUD_OPERATION_KINDS } from '../../plugin-utils';
import { ExpressionWriter, FALSE, TRUE } from './expression-writer';

/**
 * Generates source file that contains Prisma query guard objects used for injecting database queries
 */
export class PolicyGenerator {
    async generate(project: Project, model: Model, _options: PluginOptions, output: string) {
        const sf = project.createSourceFile(path.join(output, 'policy.ts'), undefined, { overwrite: true });
        sf.addStatements('/* eslint-disable */');

        sf.addImportDeclaration({
            namedImports: [
                { name: 'type QueryContext' },
                { name: 'type CrudContract' },
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

        sf.addStatements(`
        const processCondition = (
            variable: any,
            condition: any, // string conditions are processed as assertions
            z3: any,
          ): any[] => {
            const assertions: any[] = [];
            if (typeof condition === 'undefined' || typeof condition === 'string') {
              // noop
              // user properties are not pre-processed so we have to filter them out if string
            } else if (typeof condition === 'number') {
              assertions.push(variable.eq(condition));
            } else if (typeof condition === 'boolean') {
              assertions.push(variable.eq(condition));
            } else if ('OR' in condition) {
              const orCondition = condition;
              const tempAssertions: any[] = [];
              for (const condition of orCondition.OR) {
                if (typeof condition === 'string') {
                  // string are pre-processed and transformed as Assertion
                  throw 'Invalid OR condition';
                }
                tempAssertions.push(...processCondition(variable, condition, z3));
              }
              const orAssertion = z3.Or(...tempAssertions);
              assertions.push(orAssertion);
            } else if (z3.isBool(variable)) {
              assertions.push(variable);
            } else {
              const tempAssertions: any[] = [];
              for (const operator of Object.keys(condition)) {
                const value = condition[operator];
                switch (operator) {
                    case 'eq':
                        tempAssertions.push(variable.eq(value));
                        break;
                    case 'ne':
                        tempAssertions.push(variable.neq(value));
                        break;
                    case 'lt':
                        tempAssertions.push(variable.lt(value));
                        break;
                    case 'le':
                        tempAssertions.push(variable.le(value));
                        break;
                    case 'gt':
                        tempAssertions.push(variable.gt(value));
                        break;
                    case 'ge':
                        tempAssertions.push(variable.ge(value));
                        break;
                    default:
                        throw new Error('Invalid operator');
                }
            }
              if (tempAssertions.length > 1) {
                const andAssertion = z3.And(...tempAssertions);
                assertions.push(andAssertion);
              } else if (tempAssertions.length === 1) {
                assertions.push(...tempAssertions);
              }
            }
            return assertions;
          };
        `);

        // TODO: handle string and array functions in fieldStringValueMap (in, startsWith, includes, etc.)
        sf.addFunction({
            name: 'checkStringCondition',
            parameters: [
                {
                    name: 'args',
                    type: 'any',
                },
                {
                    name: 'fieldStringValueMap',
                    type: 'Record<string, string> = {}',
                },
            ],
            returnType: 'boolean',
            statements: (writer) => {
                writer.write(`
                const key = Object.keys(fieldStringValueMap)[0];
                const condition = args[key];
                if (typeof condition === 'string') {
                    return args[key] === fieldStringValueMap[key];
                }
                if (typeof condition === 'object' && 'in' in condition) {
                    return condition.in.some(condition === fieldStringValueMap[key]);
                }
                if (typeof condition === 'object' && 'startsWith' in condition) {
                    return fieldStringValueMap[key].startsWith(condition.startsWith);
                };
                return true;
                `);
            },
        });

        sf.addFunction({
            name: 'buildAssertion',
            parameters: [
                {
                    name: 'z3',
                    type: 'any',
                },
                {
                    name: 'variables',
                    type: 'Record<string, any>',
                },
                {
                    name: 'args',
                    type: 'Record<string, any> = {}',
                },
                {
                    name: 'user?',
                    type: 'any',
                },
                {
                    name: 'fieldStringValueMap',
                    type: 'Record<string, string> = {}',
                },
            ],
            returnType: 'any',
            statements: (writer) => {
                writer.write(`
                const assertions: any[] = [];
  if ('OR' in args) {
    const tempAssertions: any[] = [];
    for (const arg of args.OR) {
      tempAssertions.push(buildAssertion(z3, variables, arg, user, fieldStringValueMap));
    }
    const orAssertion = z3.Or(...tempAssertions);
    assertions.push(orAssertion);
  }

  // handle string conditions
  // TODO: handle string conditions for user properties
  const condition = checkStringCondition(args, fieldStringValueMap);
  if (condition === false) {
    return z3.Bool.val(false);
  }

  const tempAssertions: any[] = [];

  for (const property of Object.keys(args)) {  
    const condition = args[property];
    // TODO: handle nested properties
    const variable = variables[property];
    if (variable) {
      tempAssertions.push(...processCondition(variable, condition, z3));
    }
  }

  // avoid empty assertions in case of unique value or boolean
  if (tempAssertions.length > 1) {
    const andAssertion = z3.And(...tempAssertions);
    assertions.push(andAssertion);
  } else if (tempAssertions.length === 1) {
    assertions.push(...tempAssertions);
  }

  return z3.And(...assertions);
                `);
            },
        });

        const models = getDataModels(model);

        const policyMap: Record<string, Record<string, string | boolean | object>> = {};
        const permissionMap: Record<string, Record<string, string | boolean | object>> = {};
        for (const model of models) {
            policyMap[model.name] = await this.generateQueryGuardForModel(model, sf);
            permissionMap[model.name] = await this.generatePermissionCheckerForModel(model, sf);
        }

        const authSelector = this.generateAuthSelector(models);

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
                            writer.writeLine(',');

                            writer.write('permission:');
                            writer.inlineBlock(() => {
                                for (const [model, map] of Object.entries(permissionMap)) {
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

                            if (authSelector) {
                                writer.writeLine(',');
                                writer.write(`authSelector: ${JSON.stringify(authSelector)}`);
                            }
                        });
                    },
                },
            ],
        });

        sf.addStatements('export default policy;');
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
            return this.generateSelectForRules(authRules, true);
        } else {
            return undefined;
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

    private getPolicyExpressions(
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
                const preValueSelect = this.generateSelectForRules([...allows, ...denies]);
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
        this.generateReadFieldsCheckers(model, sourceFile, result);

        // generate field read override guards
        this.generateReadFieldsOverrideGuards(model, sourceFile, result);

        // generate field update guards
        this.generateUpdateFieldsGuards(model, sourceFile, result);

        return result;
    }

    private async generatePermissionCheckerForModel(model: DataModel, sourceFile: SourceFile) {
        const result: Record<string, string | boolean | object> = {};

        for (const kind of CRUD_OPERATION_KINDS) {
            const denies = this.getPolicyExpressions(model, 'deny', kind);
            const allows = this.getPolicyExpressions(model, 'allow', kind);

            const checkFunc = this.generatePermissionCheckerFunction(sourceFile, model, kind, allows, denies);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            result[kind] = checkFunc.getName()!;
        }

        return result;
    }

    private generateReadFieldsCheckers(
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

            const guardFunc = this.generateReadFieldCheckerFunction(sourceFile, field, allows, denies);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            result[`${FIELD_LEVEL_READ_CHECKER_PREFIX}${field.name}`] = guardFunc.getName()!;
        }

        if (allFieldsAllows.length > 0 || allFieldsDenies.length > 0) {
            result[HAS_FIELD_LEVEL_POLICY_FLAG] = true;
            const readFieldCheckSelect = this.generateSelectForRules([...allFieldsAllows, ...allFieldsDenies]);
            if (readFieldCheckSelect) {
                result[FIELD_LEVEL_READ_CHECKER_SELECTOR] = readFieldCheckSelect;
            }
        }
    }

    private generateReadFieldCheckerFunction(
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

    private generateReadFieldsOverrideGuards(
        model: DataModel,
        sourceFile: SourceFile,
        result: Record<string, string | boolean | object>
    ) {
        for (const field of model.fields) {
            const overrideAllows = this.getPolicyExpressions(field, 'allow', 'read', true);
            if (overrideAllows.length > 0) {
                const denies = this.getPolicyExpressions(field, 'deny', 'read');
                const overrideGuardFunc = this.generateQueryGuardFunction(
                    sourceFile,
                    model,
                    'read',
                    overrideAllows,
                    denies,
                    field,
                    true
                );
                result[`${FIELD_LEVEL_OVERRIDE_READ_GUARD_PREFIX}${field.name}`] = overrideGuardFunc.getName()!;
            }
        }
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

            const overrideAllows = this.getPolicyExpressions(field, 'allow', 'update', true);
            if (overrideAllows.length > 0) {
                const overrideGuardFunc = this.generateQueryGuardFunction(
                    sourceFile,
                    model,
                    'update',
                    overrideAllows,
                    denies,
                    field,
                    true
                );
                result[`${FIELD_LEVEL_OVERRIDE_UPDATE_GUARD_PREFIX}${field.name}`] = overrideGuardFunc.getName()!;
            }
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
    private generateSelectForRules(rules: Expression[], forAuthContext = false): object {
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

    private generateQueryGuardFunction(
        sourceFile: SourceFile,
        model: DataModel,
        kind: PolicyOperationKind,
        allows: Expression[],
        denies: Expression[],
        forField?: DataModelField,
        fieldOverride = false
    ) {
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

    private generatePermissionCheckerFunction(
        sourceFile: SourceFile,
        model: DataModel,
        kind: PolicyOperationKind,
        allows: Expression[],
        denies: Expression[]
    ) {
        const statements: (string | WriterFunction)[] = [];

        statements.push((writer) => {
            const transformer = new Z3ExpressionTransformer({
                context: ExpressionContext.AccessPolicy,
            });
            try {
                writer.writeLine('const solver = new z3.Solver();');

                const variables: Record<string, string> = this.generateVariables([...denies, ...allows]);
                Object.keys(variables).forEach((key) => {
                    writer.writeLine(`const ${key} = ${variables[key]};`);
                });
                writer.writeLine(`const _withAuth = !!user?.id;`);
                writer.writeLine(
                    `const variables = { ${Object.keys(variables)
                        .map((v) => v)
                        .join(', ')} };`
                );

                const denyStmt =
                    denies.length > 1
                        ? 'z3.Not(z3.Or(' +
                          denies
                              .map((deny) => {
                                  return transformer.transform(deny);
                              })
                              .join(', ') +
                          '))'
                        : denies.length === 1
                        ? `z3.Not(${transformer.transform(denies[0])})`
                        : undefined;
                const allowStmt =
                    allows.length > 1
                        ? 'z3.Or(' +
                          allows
                              .map((allow) => {
                                  return transformer.transform(allow);
                              })
                              .join(', ') +
                          ')'
                        : allows.length === 1
                        ? transformer.transform(allows[0])
                        : undefined;
                let assertion;
                if (denyStmt && allowStmt) {
                    assertion = `z3.And(${denyStmt}, ${allowStmt})`;
                } else if (denyStmt) {
                    assertion = denyStmt;
                } else if (allowStmt) {
                    assertion = allowStmt;
                } else {
                    assertion = `z3.Bool.val(false)`;
                }
                writer.writeLine(`const assertion = ${assertion};`);
                writer.writeLine(`const assertionFromArgs = buildAssertion(z3, variables, args, user);`);
                writer.writeLine(`solver.add(z3.And(assertion, assertionFromArgs));`);
                writer.write(`return (await solver.check()) === "sat";`);
            } catch (err) {
                if (err instanceof TypeScriptExpressionTransformerError) {
                    throw new PluginError(name, err.message);
                } else {
                    throw err;
                }
            }
        });

        const func = sourceFile.addFunction({
            isAsync: true,
            name: `check_${model.name}_${kind}`,
            returnType: 'Promise<boolean>',
            parameters: [
                {
                    name: 'z3',
                    type: 'any',
                },
                {
                    name: 'args',
                    type: 'Record<string, any>',
                },
                {
                    name: 'user?',
                    type: 'any',
                },
            ],
            statements,
        });

        return func;
    }
    generateVariables(expressions: Expression[]): Record<string, string> {
        const result: Record<string, string> = {};
        expressions.forEach((expr) => {
            const variables = this.collectVariablesTypes(expr);
            Object.keys(variables).forEach((key) => {
                if (!result[key]) {
                    switch (variables[key]) {
                        case 'NumberLiteral':
                            result[key] = `z3.Int.const("${key}")`;
                            break;
                        case 'BooleanLiteral':
                            result[key] = `z3.Bool.const("${key}")`;
                            break;
                        default:
                            break;
                    }
                }
            });
        });
        return result;
    }
    collectVariablesTypes(expr: Expression): Record<string, Expression['$type']> {
        const result: Record<string, Expression['$type']> = {};
        const visit = (node: Expression) => {
            if (isReferenceExpr(node)) {
                const variableName = node.target.ref?.name ?? 'unknown';
                result[variableName] = 'BooleanLiteral';
            } else if (isBinaryExpr(node) && typeof (node.right.$type !== 'StringLiteral')) {
                if (isReferenceExpr(node.left)) {
                    // const variableName = `${lowerCaseFirst(
                    //     node.left.target.ref?.$container.name ?? ''
                    // )}${upperCaseFirst(node.left.target?.ref?.name ?? '')}`;
                    const variableName = `${node.left.target?.ref?.name}`;
                    result[variableName] = node.right.$type;
                    // visit(node.right);
                    // } else if (isUnaryExpr(node) && node.operator === '!') {
                    //     visit(node.operand);
                } else {
                    visit(node.left);
                    visit(node.right);
                }
            } else if (isMemberAccessExpr(node) || isUnaryExpr(node)) {
                visit(node.operand);
            }
        };
        visit(expr);
        return result;
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
}
