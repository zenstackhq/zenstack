import { DataModel, Model, isDataModel, isEnum, isInvocationExpr, isLiteralExpr } from '@zenstackhq/language/ast';
import { PolicyKind, PolicyOperationKind } from '@zenstackhq/runtime';
import { GUARD_FIELD_NAME, PluginOptions } from '@zenstackhq/sdk';
import { resolved } from '@zenstackhq/sdk/utils';
import { camelCase } from 'change-case';
import { streamAllContents } from 'langium';
import path from 'path';
import { Project, SourceFile, VariableDeclarationKind } from 'ts-morph';
import { name } from '.';
import { analyzePolicies } from '../../utils/ast-utils';
import { ALL_OPERATION_KINDS, RUNTIME_PACKAGE, getNodeModulesFolder } from '../plugin-utils';
import { ExpressionWriter } from './expression-writer';

const UNKNOWN_USER_ID = 'zenstack_unknown_user';

/**
 * Generates source file that contains Prisma query guard objects used for injecting database queries
 */
export default class PolicyGuardGenerator {
    async generate(model: Model, options: PluginOptions) {
        const modulesFolder = getNodeModulesFolder();
        const output = options.output
            ? (options.output as string)
            : modulesFolder
            ? path.join(modulesFolder, '.zenstack')
            : undefined;
        if (!output) {
            console.error(`Unable to determine output path, not running plugin ${name}`);
            return;
        }

        const project = new Project();
        const sf = project.createSourceFile(path.join(output, 'policy.ts'), undefined, { overwrite: true });

        sf.addImportDeclaration({
            namedImports: [{ name: 'QueryContext' }],
            moduleSpecifier: `${RUNTIME_PACKAGE}`,
            isTypeOnly: true,
        });

        // import enums
        for (const e of model.declarations.filter((d) => isEnum(d))) {
            sf.addImportDeclaration({
                namedImports: [{ name: e.name }],
                moduleSpecifier: '@prisma/client',
            });
        }

        const models = model.declarations.filter((d) => isDataModel(d)) as DataModel[];

        const policyMap: Record<string, Record<string, string | boolean>> = {};
        for (const model of models) {
            policyMap[model.name] = await this.generateQueryGuardForModel(model, sf);
        }

        sf.addVariableStatement({
            declarationKind: VariableDeclarationKind.Const,
            declarations: [
                {
                    name: 'policy',
                    initializer: (writer) => {
                        writer.block(() => {
                            writer.write('guard:'),
                                writer.block(() => {
                                    for (const [model, map] of Object.entries(policyMap)) {
                                        writer.write(`${camelCase(model)}:`);
                                        writer.block(() => {
                                            for (const [op, func] of Object.entries(map)) {
                                                writer.write(`${op}: ${func},`);
                                            }
                                        });
                                        writer.write(',');
                                    }
                                });
                        });
                    },
                },
            ],
        });

        sf.addStatements('export default policy');

        sf.formatText();
        await project.save();
        await project.emit();
    }

    private getPolicyExpressions(model: DataModel, kind: PolicyKind, operation: PolicyOperationKind) {
        const attrs = model.attributes.filter((attr) => attr.decl.ref?.name === `@@${kind}`);
        return attrs
            .filter((attr) => {
                if (!isLiteralExpr(attr.args[0].value) || typeof attr.args[0].value.value !== 'string') {
                    return false;
                }
                const ops = attr.args[0].value.value.split(',').map((s) => s.trim());
                return ops.includes(operation) || ops.includes('all');
            })
            .map((attr) => attr.args[1].value);
    }

    private async generateQueryGuardForModel(model: DataModel, sourceFile: SourceFile) {
        const result: Record<string, string | boolean> = {};

        const { allowAll, denyAll } = analyzePolicies(model);

        if (allowAll) {
            result['allowAll'] = true;
        }

        if (denyAll) {
            result['denyAll'] = true;
        }

        if (allowAll || denyAll) {
            return result;
        }

        for (const kind of ALL_OPERATION_KINDS) {
            const func = this.generateQueryGuardFunction(sourceFile, model, kind);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            result[kind] = func.getName()!;
        }
        return result;
    }

    private generateQueryGuardFunction(sourceFile: SourceFile, model: DataModel, kind: string) {
        const func = sourceFile
            .addFunction({
                name: model.name + '_' + kind,
                returnType: 'any',
                parameters: [
                    {
                        name: 'context',
                        type: 'QueryContext',
                    },
                ],
            })
            .addBody();

        const denies = this.getPolicyExpressions(model, 'deny', kind as PolicyOperationKind);

        const allows = this.getPolicyExpressions(model, 'allow', kind as PolicyOperationKind);

        if (allows.length === 0) {
            func.addStatements('return undefined');
            return func;
        }

        // check if any allow or deny rule contains 'auth()' invocation
        let hasAuthRef = false;
        for (const node of [...denies, ...allows]) {
            for (const child of streamAllContents(node)) {
                if (isInvocationExpr(child) && resolved(child.function).name === 'auth') {
                    hasAuthRef = true;
                    break;
                }
            }
            if (hasAuthRef) {
                break;
            }
        }

        if (hasAuthRef) {
            func.addStatements(
                // make sure user id is always available
                `const user = context.user?.id ? context.user : { ...context.user, id: '${UNKNOWN_USER_ID}' };`
            );
        }

        // r = <guard object>;
        func.addVariableStatement({
            declarationKind: VariableDeclarationKind.Const,
            declarations: [
                {
                    name: 'r',
                    initializer: (writer) => {
                        const exprWriter = new ExpressionWriter(writer);
                        const writeDenies = () => {
                            writer.conditionalWrite(denies.length > 1, '{ AND: [');
                            denies.forEach((expr, i) => {
                                writer.block(() => {
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
                            writer.writeLine('{ AND: [');
                            writeDenies();
                            writer.writeLine(',');
                            writeAllows();
                            writer.writeLine(']}');
                        } else if (denies.length > 0) {
                            writeDenies();
                        } else if (allows.length > 0) {
                            writeAllows();
                        } else {
                            // disallow any operation
                            writer.write(`{ ${GUARD_FIELD_NAME}: false }`);
                        }
                    },
                },
            ],
        });

        func.addStatements('return r;');
        return func;
    }
}
