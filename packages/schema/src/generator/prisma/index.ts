import { writeFile } from 'fs/promises';
import { AstNode } from 'langium';
import path from 'path';
import colors from 'colors';
import {
    AttributeArg,
    DataModel,
    DataModelAttribute,
    DataModelField,
    DataModelFieldAttribute,
    DataSource,
    Enum,
    Expression,
    InvocationExpr,
    isArrayExpr,
    isEnum,
    isInvocationExpr,
    isLiteralExpr,
    isReferenceExpr,
    LiteralExpr,
} from '@lang/generated/ast';
import { Context, Generator, GeneratorError } from '../types';
import {
    AttributeArg as PrismaAttributeArg,
    AttributeArgValue as PrismaAttributeArgValue,
    DataSourceUrl as PrismaDataSourceUrl,
    FieldAttribute as PrismaFieldAttribute,
    ModelAttribute as PrismaModelAttribute,
    Model as PrismaDataModel,
    FieldReference as PrismaFieldReference,
    FieldReferenceArg as PrismaFieldReferenceArg,
    FunctionCall as PrismaFunctionCall,
    FunctionCallArg as PrismaFunctionCallArg,
    PrismaModel,
    ModelFieldType,
} from './prisma-builder';
import { execSync } from 'child_process';
import { Project, SourceFile, VariableDeclarationKind } from 'ts-morph';
import { RUNTIME_PACKAGE } from '../constants';
import type { PolicyKind, PolicyOperationKind } from '@zenstackhq/runtime';
import ExpressionWriter from '../server/data/expression-writer';
import { extractDataModelsWithAllowRules } from '../utils';
import { camelCase } from 'change-case';

const supportedProviders = ['postgresql', 'mysql', 'sqlite', 'sqlserver'];
const supportedAttrbutes = [
    'id',
    'index',
    'relation',
    'default',
    'createdAt',
    'updatedAt',
    'unique',
];

export default class PrismaGenerator implements Generator {
    async generate(context: Context) {
        // generate prisma schema
        const schemaFile = await this.generateSchema(context);

        // run prisma generate and install @prisma/client
        await this.generatePrismaClient(schemaFile);

        // generate prisma query guard
        await this.generateQueryGuard(context);

        console.log(colors.blue(`  ✔️ Prisma schema and query code generated`));
    }

    private async generateSchema(context: Context) {
        const { schema } = context;
        const prisma = new PrismaModel();

        for (const decl of schema.declarations) {
            switch (decl.$type) {
                case DataSource:
                    this.generateDataSource(
                        context,
                        prisma,
                        decl as DataSource
                    );
                    break;

                case Enum:
                    this.generateEnum(context, prisma, decl as Enum);
                    break;

                case DataModel:
                    this.generateModel(context, prisma, decl as DataModel);
                    break;
            }
        }

        this.generateGenerator(context, prisma);

        const outFile = path.join(context.outDir, 'schema.prisma');
        await writeFile(outFile, prisma.toString());
        return outFile;
    }

    async generatePrismaClient(schemaFile: string) {
        try {
            execSync('npx prisma -v');
        } catch (err) {
            execSync(`npm i prisma @prisma/client`);
            console.log(colors.blue('  ✔️ Prisma package installed'));
        }

        execSync(`npx prisma generate --schema "${schemaFile}"`);
    }

    private isStringLiteral(node: AstNode): node is LiteralExpr {
        return isLiteralExpr(node) && typeof node.value === 'string';
    }

    private generateDataSource(
        context: Context,
        prisma: PrismaModel,
        dataSource: DataSource
    ) {
        let provider: string | undefined = undefined;
        let url: PrismaDataSourceUrl | undefined = undefined;
        let shadowDatabaseUrl: PrismaDataSourceUrl | undefined = undefined;

        for (const f of dataSource.fields) {
            switch (f.name) {
                case 'provider': {
                    if (this.isStringLiteral(f.value)) {
                        provider = f.value.value as string;
                    } else {
                        throw new GeneratorError(
                            'Datasource provider must be set to a string'
                        );
                    }
                    if (!supportedProviders.includes(provider)) {
                        throw new GeneratorError(
                            `Provider ${provider} is not supported. Supported providers: ${supportedProviders.join(
                                ', '
                            )}`
                        );
                    }
                    break;
                }

                case 'url': {
                    const r = this.extractDataSourceUrl(f.value);
                    if (!r) {
                        throw new GeneratorError(
                            'Invalid value for datasource url'
                        );
                    }
                    url = r;
                    break;
                }

                case 'shadowDatabaseUrl': {
                    const r = this.extractDataSourceUrl(f.value);
                    if (!r) {
                        throw new GeneratorError(
                            'Invalid value for datasource url'
                        );
                    }
                    shadowDatabaseUrl = r;
                    break;
                }
            }
        }

        if (!provider) {
            throw new GeneratorError('Datasource is missing "provider" field');
        }
        if (!url) {
            throw new GeneratorError('Datasource is missing "url" field');
        }

        prisma.addDataSource(dataSource.name, provider, url, shadowDatabaseUrl);
    }

    private extractDataSourceUrl(fieldValue: LiteralExpr | InvocationExpr) {
        if (this.isStringLiteral(fieldValue)) {
            return new PrismaDataSourceUrl(fieldValue.value as string, false);
        } else if (
            isInvocationExpr(fieldValue) &&
            fieldValue.function.ref?.name === 'env' &&
            fieldValue.args.length === 1 &&
            this.isStringLiteral(fieldValue.args[0].value)
        ) {
            return new PrismaDataSourceUrl(
                fieldValue.args[0].value.value as string,
                true
            );
        } else {
            return null;
        }
    }

    private generateGenerator(context: Context, prisma: PrismaModel) {
        prisma.addGenerator(
            'client',
            'prisma-client-js',
            path.join(context.outDir, '.prisma'),
            ['fieldReference']
        );
    }

    private generateModel(
        context: Context,
        prisma: PrismaModel,
        decl: DataModel
    ) {
        const model = prisma.addModel(decl.name);
        for (const field of decl.fields) {
            this.generateModelField(model, field);
        }

        // add an "zenstack_guard" field for dealing with pure auth() related conditions
        model.addField('zenstack_guard', 'Boolean', [
            new PrismaFieldAttribute('default', [
                new PrismaAttributeArg(
                    undefined,
                    new PrismaAttributeArgValue('Boolean', true)
                ),
            ]),
        ]);

        for (const attr of decl.attributes.filter((attr) =>
            supportedAttrbutes.includes(attr.decl.ref?.name!)
        )) {
            this.generateModelAttribute(model, attr);
        }
    }

    private generateModelField(model: PrismaDataModel, field: DataModelField) {
        const type = new ModelFieldType(
            (field.type.type || field.type.reference?.ref?.name)!,
            field.type.array,
            field.type.optional
        );

        const attributes = field.attributes
            .filter((attr) => supportedAttrbutes.includes(attr.decl.ref?.name!))
            .map((attr) => this.makeFieldAttribute(attr));
        model.addField(field.name, type, attributes);
    }

    private makeFieldAttribute(attr: DataModelFieldAttribute) {
        return new PrismaFieldAttribute(
            attr.decl.ref?.name!,
            attr.args.map((arg) => this.makeAttributeArg(arg))
        );
    }

    makeAttributeArg(arg: AttributeArg): PrismaAttributeArg {
        return new PrismaAttributeArg(
            arg.name,
            this.makeAttributeArgValue(arg.value)
        );
    }

    makeAttributeArgValue(node: Expression): PrismaAttributeArgValue {
        if (isLiteralExpr(node)) {
            switch (typeof node.value) {
                case 'string':
                    return new PrismaAttributeArgValue('String', node.value);
                case 'number':
                    return new PrismaAttributeArgValue('Number', node.value);
                case 'boolean':
                    return new PrismaAttributeArgValue('Boolean', node.value);
                default:
                    throw new GeneratorError(
                        `Unexpected literal type: ${typeof node.value}`
                    );
            }
        } else if (isArrayExpr(node)) {
            return new PrismaAttributeArgValue(
                'Array',
                new Array(
                    ...node.items.map((item) =>
                        this.makeAttributeArgValue(item)
                    )
                )
            );
        } else if (isReferenceExpr(node)) {
            return new PrismaAttributeArgValue(
                'FieldReference',
                new PrismaFieldReference(
                    node.target.ref?.name!,
                    node.args.map(
                        (arg) =>
                            new PrismaFieldReferenceArg(arg.name, arg.value)
                    )
                )
            );
        } else if (isInvocationExpr(node)) {
            // invocation
            return new PrismaAttributeArgValue(
                'FunctionCall',
                this.makeFunctionCall(node)
            );
        } else {
            throw new GeneratorError(
                `Unsupported attribute argument expression type: ${node.$type}`
            );
        }
    }

    makeFunctionCall(node: InvocationExpr): PrismaFunctionCall {
        return new PrismaFunctionCall(
            node.function.ref?.name!,
            node.args.map((arg) => {
                if (!isLiteralExpr(arg.value)) {
                    throw new GeneratorError(
                        'Function call argument must be literal'
                    );
                }
                return new PrismaFunctionCallArg(arg.name, arg.value.value);
            })
        );
    }

    private generateModelAttribute(
        model: PrismaDataModel,
        attr: DataModelAttribute
    ) {
        model.attributes.push(
            new PrismaModelAttribute(
                attr.decl.ref?.name!,
                attr.args.map((arg) => this.makeAttributeArg(arg))
            )
        );
    }

    private generateEnum(context: Context, prisma: PrismaModel, decl: Enum) {
        prisma.addEnum(
            decl.name,
            decl.fields.map((f) => f.name)
        );
    }

    private async generateQueryGuard(context: Context) {
        const project = new Project();
        const sf = project.createSourceFile(
            path.join(context.outDir, 'query/guard.ts'),
            undefined,
            { overwrite: true }
        );

        sf.addImportDeclaration({
            namedImports: [{ name: 'QueryContext' }],
            moduleSpecifier: RUNTIME_PACKAGE,
            isTypeOnly: true,
        });

        // import enums
        for (const e of context.schema.declarations.filter((d) => isEnum(d))) {
            sf.addImportDeclaration({
                namedImports: [{ name: e.name }],
                moduleSpecifier: '../.prisma',
            });
        }

        const models = extractDataModelsWithAllowRules(context.schema);
        models.forEach((model) =>
            this.generateQueryGuardForModel(model as DataModel, sf)
        );

        sf.formatText({});
        await project.save();
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
                    name: camelCase(model.name) + '_' + kind,
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
                                writer.write('undefined');
                            }
                        },
                    },
                ],
            });

            func.addStatements('return r;');
        }
    }
}
