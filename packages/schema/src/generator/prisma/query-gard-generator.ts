import {
    DataModel,
    isDataModel,
    isEnum,
    isLiteralExpr,
} from '@lang/generated/ast';
import { PolicyKind, PolicyOperationKind } from '@zenstackhq/runtime';
import path from 'path';
import { Project, SourceFile, VariableDeclarationKind } from 'ts-morph';
import { GUARD_FIELD_NAME, RUNTIME_PACKAGE } from '../constants';
import { Context } from '../types';
import ExpressionWriter from './expression-writer';

export default class QueryGuardGenerator {
    constructor(private readonly context: Context) {}

    async generate() {
        const project = new Project();
        const sf = project.createSourceFile(
            path.join(this.context.outDir, 'query/guard.ts'),
            undefined,
            { overwrite: true }
        );

        sf.addImportDeclaration({
            namedImports: [{ name: 'QueryContext' }],
            moduleSpecifier: RUNTIME_PACKAGE,
            isTypeOnly: true,
        });

        // import enums
        for (const e of this.context.schema.declarations.filter((d) =>
            isEnum(d)
        )) {
            sf.addImportDeclaration({
                namedImports: [{ name: e.name }],
                moduleSpecifier: '../.prisma',
            });
        }

        const models = this.context.schema.declarations.filter((d) =>
            isDataModel(d)
        ) as DataModel[];

        this.generateFieldMapping(models, sf);

        models.forEach((model) => this.generateQueryGuardForModel(model, sf));

        sf.formatText({});
        await project.save();
    }

    private generateFieldMapping(models: DataModel[], sourceFile: SourceFile) {
        const mapping = Object.fromEntries(
            models.map((m) => [
                m.name,
                Object.fromEntries(
                    m.fields
                        .filter((f) => isDataModel(f.type.reference?.ref))
                        .map((f) => [
                            f.name,
                            {
                                type: f.type.reference!.ref!.name,
                                isArray: f.type.array,
                            },
                        ])
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

    private getPolicyExpressions(
        model: DataModel,
        kind: PolicyKind,
        operation: PolicyOperationKind
    ) {
        const attrs = model.attributes.filter(
            (attr) => attr.decl.ref?.name === kind
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

            func.addStatements('const { user } = context;');

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
