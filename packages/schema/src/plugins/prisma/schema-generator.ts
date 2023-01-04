import {
    AstNode,
    Attribute,
    AttributeArg,
    DataModel,
    DataModelAttribute,
    DataModelField,
    DataModelFieldAttribute,
    DataSource,
    Enum,
    Expression,
    Generator,
    InvocationExpr,
    LiteralExpr,
    Model,
    isArrayExpr,
    isInvocationExpr,
    isLiteralExpr,
    isReferenceExpr,
} from '@zenstackhq/language/ast';
import {
    GUARD_FIELD_NAME,
    PluginError,
    PluginOptions,
    TRANSACTION_FIELD_NAME,
    getLiteral,
    getLiteralArray,
    resolved,
} from '@zenstackhq/sdk';
import fs from 'fs';
import { writeFile } from 'fs/promises';
import path from 'path';
import { analyzePolicies } from '../../utils/ast-utils';
import { execSync } from '../../utils/exec-utils';
import {
    ModelFieldType,
    AttributeArg as PrismaAttributeArg,
    AttributeArgValue as PrismaAttributeArgValue,
    Model as PrismaDataModel,
    DataSourceUrl as PrismaDataSourceUrl,
    FieldAttribute as PrismaFieldAttribute,
    FieldReference as PrismaFieldReference,
    FieldReferenceArg as PrismaFieldReferenceArg,
    FunctionCall as PrismaFunctionCall,
    FunctionCallArg as PrismaFunctionCallArg,
    PrismaModel,
    ModelAttribute as PrismaModelAttribute,
} from './prisma-builder';

/**
 * Generates Prisma schema file
 */
export default class PrismaSchemaGenerator {
    async generate(model: Model, options: PluginOptions) {
        const prisma = new PrismaModel();

        for (const decl of model.declarations) {
            switch (decl.$type) {
                case DataSource:
                    this.generateDataSource(prisma, decl as DataSource);
                    break;

                case Enum:
                    this.generateEnum(prisma, decl as Enum);
                    break;

                case DataModel:
                    this.generateModel(prisma, decl as DataModel);
                    break;

                case Generator:
                    this.generateGenerator(prisma, decl as Generator);
                    break;
            }
        }

        const outFile = (options.output as string) ?? './prisma/schema.prisma';
        if (!fs.existsSync(path.dirname(outFile))) {
            fs.mkdirSync(path.dirname(outFile), { recursive: true });
        }
        await writeFile(outFile, prisma.toString());

        // run 'prisma generate'
        await execSync(`npx prisma generate --schema ${outFile}`);
    }

    private generateDataSource(prisma: PrismaModel, dataSource: DataSource) {
        let provider: string | undefined = undefined;
        let url: PrismaDataSourceUrl | undefined = undefined;
        let shadowDatabaseUrl: PrismaDataSourceUrl | undefined = undefined;

        for (const f of dataSource.fields) {
            switch (f.name) {
                case 'provider': {
                    if (this.isStringLiteral(f.value)) {
                        provider = f.value.value as string;
                    } else {
                        throw new PluginError('Datasource provider must be set to a string');
                    }
                    break;
                }

                case 'url': {
                    const r = this.extractDataSourceUrl(f.value);
                    if (!r) {
                        throw new PluginError('Invalid value for datasource url');
                    }
                    url = r;
                    break;
                }

                case 'shadowDatabaseUrl': {
                    const r = this.extractDataSourceUrl(f.value);
                    if (!r) {
                        throw new PluginError('Invalid value for datasource url');
                    }
                    shadowDatabaseUrl = r;
                    break;
                }
            }
        }

        if (!provider) {
            throw new PluginError('Datasource is missing "provider" field');
        }
        if (!url) {
            throw new PluginError('Datasource is missing "url" field');
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
            return new PrismaDataSourceUrl(fieldValue.args[0].value.value as string, true);
        } else {
            return null;
        }
    }

    private generateGenerator(prisma: PrismaModel, decl: Generator) {
        prisma.addGenerator(
            decl.name,
            decl.fields.map((f) => {
                const value = isArrayExpr(f.value) ? getLiteralArray(f.value) : getLiteral(f.value);
                return { name: f.name, value };
            })
        );
    }

    private generateModel(prisma: PrismaModel, decl: DataModel) {
        const model = prisma.addModel(decl.name);
        for (const field of decl.fields) {
            this.generateModelField(model, field);
        }

        const { allowAll, denyAll, hasFieldValidation } = analyzePolicies(decl);

        if ((!allowAll && !denyAll) || hasFieldValidation) {
            // generate auxiliary fields for policy check

            // add an "zenstack_guard" field for dealing with pure auth() related conditions
            model.addField(GUARD_FIELD_NAME, 'Boolean', [
                new PrismaFieldAttribute('@default', [
                    new PrismaAttributeArg(undefined, new PrismaAttributeArgValue('Boolean', true)),
                ]),
            ]);

            // add an "zenstack_transaction" field for tracking records created/updated with nested writes
            model.addField(TRANSACTION_FIELD_NAME, 'String?');

            // create an index for "zenstack_transaction" field
            model.addAttribute('@@index', [
                new PrismaAttributeArg(
                    undefined,
                    new PrismaAttributeArgValue('Array', [
                        new PrismaAttributeArgValue('FieldReference', TRANSACTION_FIELD_NAME),
                    ])
                ),
            ]);
        }

        for (const attr of decl.attributes.filter((attr) => attr.decl.ref && this.isPrismaAttribute(attr.decl.ref))) {
            this.generateModelAttribute(model, attr);
        }
    }

    private isPrismaAttribute(attr: Attribute) {
        return !!attr.attributes.find((a) => a.decl.ref?.name === '@@@prisma');
    }

    private generateModelField(model: PrismaDataModel, field: DataModelField) {
        const fieldType = field.type.type || field.type.reference?.ref?.name;
        if (!fieldType) {
            throw new PluginError(`Field type is not resolved: ${field.$container.name}.${field.name}`);
        }

        const type = new ModelFieldType(fieldType, field.type.array, field.type.optional);

        const attributes = field.attributes
            .filter((attr) => attr.decl.ref && this.isPrismaAttribute(attr.decl.ref))
            .map((attr) => this.makeFieldAttribute(attr));
        model.addField(field.name, type, attributes);
    }

    private makeFieldAttribute(attr: DataModelFieldAttribute) {
        return new PrismaFieldAttribute(
            resolved(attr.decl).name,
            attr.args.map((arg) => this.makeAttributeArg(arg))
        );
    }

    private makeAttributeArg(arg: AttributeArg): PrismaAttributeArg {
        return new PrismaAttributeArg(arg.name, this.makeAttributeArgValue(arg.value));
    }

    private makeAttributeArgValue(node: Expression): PrismaAttributeArgValue {
        if (isLiteralExpr(node)) {
            switch (typeof node.value) {
                case 'string':
                    return new PrismaAttributeArgValue('String', node.value);
                case 'number':
                    return new PrismaAttributeArgValue('Number', node.value);
                case 'boolean':
                    return new PrismaAttributeArgValue('Boolean', node.value);
                default:
                    throw new PluginError(`Unexpected literal type: ${typeof node.value}`);
            }
        } else if (isArrayExpr(node)) {
            return new PrismaAttributeArgValue(
                'Array',
                new Array(...node.items.map((item) => this.makeAttributeArgValue(item)))
            );
        } else if (isReferenceExpr(node)) {
            return new PrismaAttributeArgValue(
                'FieldReference',
                new PrismaFieldReference(
                    resolved(node.target).name,
                    node.args.map((arg) => new PrismaFieldReferenceArg(arg.name, arg.value))
                )
            );
        } else if (isInvocationExpr(node)) {
            // invocation
            return new PrismaAttributeArgValue('FunctionCall', this.makeFunctionCall(node));
        } else {
            throw new PluginError(`Unsupported attribute argument expression type: ${node.$type}`);
        }
    }

    makeFunctionCall(node: InvocationExpr): PrismaFunctionCall {
        return new PrismaFunctionCall(
            resolved(node.function).name,
            node.args.map((arg) => {
                if (!isLiteralExpr(arg.value)) {
                    throw new PluginError('Function call argument must be literal');
                }
                return new PrismaFunctionCallArg(arg.name, arg.value.value);
            })
        );
    }

    private generateModelAttribute(model: PrismaDataModel, attr: DataModelAttribute) {
        model.attributes.push(
            new PrismaModelAttribute(
                resolved(attr.decl).name,
                attr.args.map((arg) => this.makeAttributeArg(arg))
            )
        );
    }

    private generateEnum(prisma: PrismaModel, decl: Enum) {
        prisma.addEnum(
            decl.name,
            decl.fields.map((f) => f.name)
        );
    }

    private isStringLiteral(node: AstNode): node is LiteralExpr {
        return isLiteralExpr(node) && typeof node.value === 'string';
    }
}
