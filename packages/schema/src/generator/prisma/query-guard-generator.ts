import {
    DataModel,
    DataModelField,
    isDataModel,
    isEnum,
    isLiteralExpr,
} from '@lang/generated/ast';
import {
    FieldInfo,
    PolicyKind,
    PolicyOperationKind,
    RuntimeAttribute,
} from '@zenstackhq/runtime/server';
import path from 'path';
import { Project, SourceFile, VariableDeclarationKind } from 'ts-morph';
import {
    GUARD_FIELD_NAME,
    RUNTIME_PACKAGE,
    UNKNOWN_USER_ID,
} from '../constants';
import { Context } from '../types';
import { resolved } from '../ast-utils';
import ExpressionWriter from './expression-writer';

/**
 * Generates source file that contains Prisma query guard objects used for injecting database queries
 */
export default class QueryGuardGenerator {
    constructor(private readonly context: Context) {}

    async generate(): Promise<void> {
        const project = new Project();
        const sf = project.createSourceFile(
            path.join(this.context.generatedCodeDir, 'src/query/guard.ts'),
            undefined,
            { overwrite: true }
        );

        sf.addImportDeclaration({
            namedImports: [{ name: 'QueryContext' }],
            moduleSpecifier: `${RUNTIME_PACKAGE}/server`,
            isTypeOnly: true,
        });

        // import enums
        for (const e of this.context.schema.declarations.filter((d) =>
            isEnum(d)
        )) {
            sf.addImportDeclaration({
                namedImports: [{ name: e.name }],
                moduleSpecifier: '../../.prisma',
            });
        }

        const models = this.context.schema.declarations.filter((d) =>
            isDataModel(d)
        ) as DataModel[];

        this.generateFieldMapping(models, sf);

        for (const model of models) {
            await this.generateQueryGuardForModel(model, sf);
        }

        sf.formatText({});
        await project.save();
    }

    private generateFieldMapping(models: DataModel[], sourceFile: SourceFile) {
        const mapping = Object.fromEntries(
            models.map((m) => [
                m.name,
                Object.fromEntries(
                    m.fields.map((f) => {
                        const fieldInfo: FieldInfo = {
                            name: f.name,
                            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                            type: f.type.reference
                                ? f.type.reference.$refText
                                : // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                                  f.type.type!,
                            isDataModel: isDataModel(f.type.reference?.ref),
                            isArray: f.type.array,
                            isOptional: f.type.optional,
                            attributes: this.getFieldAttributes(f),
                        };
                        return [f.name, fieldInfo];
                    })
                ),
            ])
        );

        sourceFile.addVariableStatement({
            isExported: true,
            declarationKind: VariableDeclarationKind.Const,
            declarations: [
                {
                    name: '_fieldMapping',
                    initializer: JSON.stringify(mapping),
                },
            ],
        });
    }

    private getFieldAttributes(field: DataModelField): RuntimeAttribute[] {
        return field.attributes
            .map((attr) => {
                const args: Array<{ name?: string; value: unknown }> = [];
                for (const arg of attr.args) {
                    if (!isLiteralExpr(arg.value)) {
                        // attributes with non-literal args are skipped
                        return undefined;
                    }
                    args.push({ name: arg.name, value: arg.value.value });
                }
                return { name: resolved(attr.decl).name, args };
            })
            .filter((d): d is RuntimeAttribute => !!d);
    }

    private getPolicyExpressions(
        model: DataModel,
        kind: PolicyKind,
        operation: PolicyOperationKind
    ) {
        const attrs = model.attributes.filter(
            (attr) => attr.decl.ref?.name === `@@${kind}`
        );
        return attrs
            .filter((attr) => {
                if (
                    !isLiteralExpr(attr.args[0].value) ||
                    typeof attr.args[0].value.value !== 'string'
                ) {
                    return false;
                }
                const ops = attr.args[0].value.value
                    .split(',')
                    .map((s) => s.trim());
                return ops.includes(operation) || ops.includes('all');
            })
            .map((attr) => attr.args[1].value);
    }

    private async generateQueryGuardForModel(
        model: DataModel,
        sourceFile: SourceFile
    ) {
        for (const kind of ['create', 'update', 'read', 'delete']) {
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
                    isExported: true,
                })
                .addBody();

            func.addStatements(
                // make suer user id is always available
                `const user = context.user?.id ? context.user : { ...context.user, id: '${UNKNOWN_USER_ID}' };`
            );

            // r = <guard object>;
            func.addVariableStatement({
                declarationKind: VariableDeclarationKind.Const,
                declarations: [
                    {
                        name: 'r',
                        initializer: (writer) => {
                            const exprWriter = new ExpressionWriter(writer);
                            const denies = this.getPolicyExpressions(
                                model,
                                'deny',
                                kind as PolicyOperationKind
                            );
                            const allows = this.getPolicyExpressions(
                                model,
                                'allow',
                                kind as PolicyOperationKind
                            );

                            const writeDenies = () => {
                                writer.conditionalWrite(
                                    denies.length > 1,
                                    '{ AND: ['
                                );
                                denies.forEach((expr, i) => {
                                    writer.block(() => {
                                        writer.write('NOT: ');
                                        exprWriter.write(expr);
                                    });
                                    writer.conditionalWrite(
                                        i !== denies.length - 1,
                                        ','
                                    );
                                });
                                writer.conditionalWrite(
                                    denies.length > 1,
                                    ']}'
                                );
                            };

                            const writeAllows = () => {
                                writer.conditionalWrite(
                                    allows.length > 1,
                                    '{ OR: ['
                                );
                                allows.forEach((expr, i) => {
                                    exprWriter.write(expr);
                                    writer.conditionalWrite(
                                        i !== allows.length - 1,
                                        ','
                                    );
                                });
                                writer.conditionalWrite(
                                    allows.length > 1,
                                    ']}'
                                );
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
        }
    }
}
