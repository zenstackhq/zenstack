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
    isInvocationExpr,
    isLiteralExpr,
    isReferenceExpr,
    LiteralExpr,
} from '../../language-server/generated/ast';
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
} from './prisma-builder';

const supportedProviders = ['postgresql', 'mysql', 'sqlite', 'sqlserver'];

export default class PrismaGenerator implements Generator {
    async generate(context: Context) {
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

        await writeFile(
            path.join(context.outDir, 'schema.prisma'),
            prisma.toString()
        );

        console.log(colors.green('Prisma schema generated successfully'));
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
            this.isStringLiteral(fieldValue.args[0])
        ) {
            return new PrismaDataSourceUrl(
                fieldValue.args[0].value as string,
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
            path.join(context.outDir, '.prisma')
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

        for (const attr of decl.attributes) {
            this.generateModelAttribute(model, attr);
        }
    }

    private generateModelField(model: PrismaDataModel, field: DataModelField) {
        const type = {
            type: (field.type.type || field.type.reference?.ref?.name)!,
            array: field.type.array,
            optional: field.type.optional,
        };

        const attributes = field.attributes.map((attr) =>
            this.makeFieldAttribute(attr)
        );
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
}
