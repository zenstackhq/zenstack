import {
    ExpressionContext,
    PluginError,
    PluginGlobalOptions,
    PluginOptions,
    RUNTIME_PACKAGE,
    TypeScriptExpressionTransformer,
    TypeScriptExpressionTransformerError,
    ensureEmptyDir,
    getAttributeArg,
    getAttributeArgLiteral,
    getDataModels,
    getLiteralArray,
    hasAttribute,
    isDataModelFieldReference,
    isDiscriminatorField,
    isEnumFieldReference,
    isForeignKeyField,
    isFromStdlib,
    isIdField,
    parseOptionAsStrings,
    resolvePath,
    saveSourceFile,
} from '@zenstackhq/sdk';
import { DataModel, EnumField, Model, TypeDef, isArrayExpr, isDataModel, isEnum, isTypeDef } from '@zenstackhq/sdk/ast';
import { addMissingInputObjectTypes, resolveAggregateOperationSupport } from '@zenstackhq/sdk/dmmf-helpers';
import { getPrismaClientImportSpec, supportCreateMany, type DMMF } from '@zenstackhq/sdk/prisma';
import { streamAllContents } from 'langium';
import path from 'path';
import type { CodeBlockWriter, SourceFile } from 'ts-morph';
import { upperCaseFirst } from 'upper-case-first';
import { name } from '.';
import { getDefaultOutputFolder } from '../plugin-utils';
import Transformer from './transformer';
import { ObjectMode } from './types';
import { makeFieldSchema } from './utils/schema-gen';

export class ZodSchemaGenerator {
    private readonly sourceFiles: SourceFile[] = [];
    private readonly globalOptions: PluginGlobalOptions;
    private readonly mode: ObjectMode;

    constructor(
        private readonly model: Model,
        private readonly options: PluginOptions,
        private readonly dmmf: DMMF.Document,
        globalOptions: PluginGlobalOptions | undefined
    ) {
        if (!globalOptions) {
            throw new Error('Global options are required');
        }
        this.globalOptions = globalOptions;

        // options validation
        if (
            this.options.mode &&
            (typeof this.options.mode !== 'string' || !['strip', 'strict', 'passthrough'].includes(this.options.mode))
        ) {
            throw new PluginError(
                name,
                `Invalid mode option: "${this.options.mode}". Must be one of 'strip', 'strict', or 'passthrough'.`
            );
        }

        this.mode = (this.options.mode ?? 'strict') as ObjectMode;
    }

    async generate() {
        let output = this.options.output as string;
        if (!output) {
            const defaultOutputFolder = getDefaultOutputFolder(this.globalOptions);
            if (defaultOutputFolder) {
                output = path.join(defaultOutputFolder, 'zod');
            } else {
                output = './generated/zod';
            }
        }
        output = resolvePath(output, this.options);
        ensureEmptyDir(output);
        Transformer.setOutputPath(output);

        // calculate the models to be excluded
        const excludeModels = this.getExcludedModels();

        const prismaClientDmmf = this.dmmf;

        const modelOperations = prismaClientDmmf.mappings.modelOperations.filter(
            (o) => !excludeModels.find((e) => e === o.model)
        );

        // TODO: better way of filtering than string startsWith?
        const inputObjectTypes = prismaClientDmmf.schema.inputObjectTypes.prisma.filter(
            (type) => !excludeModels.find((e) => type.name.toLowerCase().startsWith(e.toLocaleLowerCase()))
        );
        const outputObjectTypes = prismaClientDmmf.schema.outputObjectTypes.prisma.filter(
            (type) => !excludeModels.find((e) => type.name.toLowerCase().startsWith(e.toLowerCase()))
        );

        const models: DMMF.Model[] = prismaClientDmmf.datamodel.models.filter(
            (m) => !excludeModels.find((e) => e === m.name)
        );

        // common schemas
        await this.generateCommonSchemas(output);

        // enums
        await this.generateEnumSchemas(
            prismaClientDmmf.schema.enumTypes.prisma,
            prismaClientDmmf.schema.enumTypes.model ?? []
        );

        await this.generateModelSchemas(output, excludeModels);

        if (this.options.modelOnly) {
            // generate stub for object and input schemas, so the exports from '@zenstackhq/runtime/zod' are available
            this.sourceFiles.push(
                this.project.createSourceFile(path.join(output, 'objects', 'index.ts'), '', { overwrite: true })
            );
            this.sourceFiles.push(
                this.project.createSourceFile(path.join(output, 'input', 'index.ts'), '', { overwrite: true })
            );
        } else {
            // detailed object schemas referenced from input schemas
            addMissingInputObjectTypes(inputObjectTypes, outputObjectTypes, models);
            const aggregateOperationSupport = resolveAggregateOperationSupport(inputObjectTypes);
            await this.generateObjectSchemas(inputObjectTypes, output);

            // input schemas
            const transformer = new Transformer({
                models,
                modelOperations,
                aggregateOperationSupport,
                project: this.project,
                inputObjectTypes,
                zmodel: this.model,
                mode: this.mode,
            });
            await transformer.generateInputSchemas(this.options, this.model);
            this.sourceFiles.push(...transformer.sourceFiles);
        }

        // create barrel file
        const exports = [`export * as models from './models'`, `export * as enums from './enums'`];
        if (this.options.modelOnly !== true) {
            exports.push(`export * as input from './input'`, `export * as objects from './objects'`);
        }
        this.sourceFiles.push(
            this.project.createSourceFile(path.join(output, 'index.ts'), exports.join(';\n'), { overwrite: true })
        );

        if (this.options.preserveTsFiles === true || this.options.output) {
            // if preserveTsFiles is true or the user provided a custom output directory,
            // save the generated files
            this.sourceFiles.forEach(saveSourceFile);
        }
    }

    private get project() {
        return this.globalOptions.tsProject;
    }

    private getExcludedModels() {
        // resolve "generateModels" option
        const generateModels = parseOptionAsStrings(this.options, 'generateModels', name);
        if (generateModels) {
            if (this.options.modelOnly === true) {
                // no model reference needs to be considered, directly exclude any model not included
                return this.model.declarations
                    .filter((d) => isDataModel(d) && !generateModels.includes(d.name))
                    .map((m) => m.name);
            } else {
                // calculate a transitive closure of models to be included
                const todo = getDataModels(this.model).filter((dm) => generateModels.includes(dm.name));
                const included = new Set<DataModel>();
                while (todo.length > 0) {
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    const dm = todo.pop()!;
                    included.add(dm);

                    // add referenced models to the todo list
                    dm.fields
                        .map((f) => f.type.reference?.ref)
                        .filter((type): type is DataModel => isDataModel(type))
                        .forEach((type) => {
                            if (!included.has(type)) {
                                todo.push(type);
                            }
                        });
                }

                // finally find the models to be excluded
                return getDataModels(this.model)
                    .filter((dm) => !included.has(dm))
                    .map((m) => m.name);
            }
        } else {
            return [];
        }
    }

    private async generateCommonSchemas(output: string) {
        // Decimal
        this.sourceFiles.push(
            this.project.createSourceFile(
                path.join(output, 'common', 'index.ts'),
                `
    import { z } from 'zod';
    export const DecimalSchema = z.union([z.number(), z.string(), z.object({d: z.number().array(), e: z.number(), s: z.number()}).passthrough()]);
    `,
                { overwrite: true }
            )
        );
    }

    private async generateEnumSchemas(
        prismaSchemaEnum: readonly DMMF.SchemaEnum[],
        modelSchemaEnum: readonly DMMF.SchemaEnum[]
    ) {
        const enumTypes = [...prismaSchemaEnum, ...modelSchemaEnum];
        const enumNames = enumTypes.map((enumItem) => upperCaseFirst(enumItem.name));
        Transformer.enumNames = enumNames ?? [];
        const transformer = new Transformer({
            enumTypes,
            project: this.project,
            inputObjectTypes: [],
            zmodel: this.model,
            mode: this.mode,
        });
        await transformer.generateEnumSchemas();
        this.sourceFiles.push(...transformer.sourceFiles);
    }

    private async generateObjectSchemas(inputObjectTypes: DMMF.InputType[], output: string) {
        // whether Prisma's Unchecked* series of input types should be generated
        const generateUnchecked = this.options.noUncheckedInput !== true;

        const moduleNames: string[] = [];
        for (let i = 0; i < inputObjectTypes.length; i += 1) {
            const fields = inputObjectTypes[i]?.fields;
            const name = inputObjectTypes[i]?.name;

            if (!generateUnchecked && name.includes('Unchecked')) {
                continue;
            }

            if (name.includes('CreateMany') && !supportCreateMany(this.model)) {
                continue;
            }

            const transformer = new Transformer({
                name,
                fields,
                project: this.project,
                inputObjectTypes,
                zmodel: this.model,
                mode: this.mode,
            });
            const moduleName = transformer.generateObjectSchema(generateUnchecked, this.options);
            moduleNames.push(moduleName);
            this.sourceFiles.push(...transformer.sourceFiles);
        }

        this.sourceFiles.push(
            this.project.createSourceFile(
                path.join(output, 'objects/index.ts'),
                moduleNames.map((name) => `export * from './${name}';`).join('\n'),
                { overwrite: true }
            )
        );
    }

    private async generateModelSchemas(output: string, excludedModels: string[]) {
        const schemaNames: string[] = [];
        for (const dm of getDataModels(this.model)) {
            if (!excludedModels.includes(dm.name)) {
                schemaNames.push(await this.generateModelSchema(dm, output));
            }
        }

        for (const typeDef of this.model.declarations.filter(isTypeDef)) {
            if (!excludedModels.includes(typeDef.name)) {
                schemaNames.push(await this.generateTypeDefSchema(typeDef, output));
            }
        }

        this.sourceFiles.push(
            this.project.createSourceFile(
                path.join(output, 'models', 'index.ts'),
                schemaNames.map((name) => `export * from './${name}';`).join('\n'),
                { overwrite: true }
            )
        );
    }

    private generateTypeDefSchema(typeDef: TypeDef, output: string) {
        const schemaName = `${upperCaseFirst(typeDef.name)}.schema`;
        const sf = this.project.createSourceFile(path.join(output, 'models', `${schemaName}.ts`), undefined, {
            overwrite: true,
        });
        this.sourceFiles.push(sf);
        sf.replaceWithText((writer) => {
            this.addPreludeAndImports(typeDef, writer, output);

            writer.write(`const baseSchema = z.object(`);
            writer.inlineBlock(() => {
                typeDef.fields.forEach((field) => {
                    writer.writeLine(`${field.name}: ${makeFieldSchema(field)},`);
                });
            });

            switch (this.options.mode) {
                case 'strip':
                    // zod strips by default
                    writer.writeLine(')');
                    break;
                case 'passthrough':
                    writer.writeLine(').passthrough();');
                    break;
                default:
                    writer.writeLine(').strict();');
                    break;
            }

            // compile "@@validate" to a function calling zod's `.refine()`
            const refineFuncName = this.createRefineFunction(typeDef, writer);

            if (refineFuncName) {
                // export a schema without refinement for extensibility: `[Model]WithoutRefineSchema`
                const noRefineSchema = `${upperCaseFirst(typeDef.name)}WithoutRefineSchema`;
                writer.writeLine(`
/**
 * \`${typeDef.name}\` schema prior to calling \`.refine()\` for extensibility.
 */
export const ${noRefineSchema} = baseSchema;
export const ${typeDef.name}Schema = ${refineFuncName}(${noRefineSchema});
`);
            } else {
                writer.writeLine(`export const ${typeDef.name}Schema = baseSchema;`);
            }
        });

        return schemaName;
    }

    private addPreludeAndImports(decl: DataModel | TypeDef, writer: CodeBlockWriter, output: string) {
        writer.writeLine(`import { z } from 'zod';`);

        // import user-defined enums from Prisma as they might be referenced in the expressions
        const importEnums = new Set<string>();
        for (const node of streamAllContents(decl)) {
            if (isEnumFieldReference(node)) {
                const field = node.target.ref as EnumField;
                if (!isFromStdlib(field.$container)) {
                    importEnums.add(field.$container.name);
                }
            }
        }
        if (importEnums.size > 0) {
            const prismaImport = computePrismaClientImport(path.join(output, 'models'), this.options);
            writer.writeLine(`import { ${[...importEnums].join(', ')} } from '${prismaImport}';`);
        }

        // import enum schemas
        const importedEnumSchemas = new Set<string>();
        for (const field of decl.fields) {
            if (field.type.reference?.ref && isEnum(field.type.reference?.ref)) {
                const name = upperCaseFirst(field.type.reference?.ref.name);
                if (!importedEnumSchemas.has(name)) {
                    writer.writeLine(`import { ${name}Schema } from '../enums/${name}.schema';`);
                    importedEnumSchemas.add(name);
                }
            }
        }

        // import Decimal
        if (decl.fields.some((field) => field.type.type === 'Decimal')) {
            writer.writeLine(`import { DecimalSchema } from '../common';`);
            writer.writeLine(`import { Decimal } from 'decimal.js';`);
        }

        // import referenced types' schemas
        const referencedTypes = new Set(
            decl.fields
                .filter((field) => isTypeDef(field.type.reference?.ref) && field.type.reference?.ref.name !== decl.name)
                .map((field) => field.type.reference!.ref!.name)
        );
        for (const refType of referencedTypes) {
            writer.writeLine(`import { ${upperCaseFirst(refType)}Schema } from './${upperCaseFirst(refType)}.schema';`);
        }
    }

    private async generateModelSchema(model: DataModel, output: string) {
        const schemaName = `${upperCaseFirst(model.name)}.schema`;
        const sf = this.project.createSourceFile(path.join(output, 'models', `${schemaName}.ts`), undefined, {
            overwrite: true,
        });
        this.sourceFiles.push(sf);
        sf.replaceWithText((writer) => {
            const scalarFields = model.fields.filter(
                (field) =>
                    // id fields are always included
                    isIdField(field) ||
                    // regular fields only
                    (!isDataModel(field.type.reference?.ref) && !isForeignKeyField(field))
            );

            const relations = model.fields.filter((field) => isDataModel(field.type.reference?.ref));
            const fkFields = model.fields.filter((field) => isForeignKeyField(field));

            this.addPreludeAndImports(model, writer, output);

            // base schema - including all scalar fields, with optionality following the schema
            writer.write(`const baseSchema = z.object(`);
            writer.inlineBlock(() => {
                scalarFields.forEach((field) => {
                    writer.writeLine(`${field.name}: ${makeFieldSchema(field)},`);
                });
            });

            switch (this.options.mode) {
                case 'strip':
                    // zod strips by default
                    writer.writeLine(')');
                    break;
                case 'passthrough':
                    writer.writeLine(').passthrough();');
                    break;
                default:
                    writer.writeLine(').strict();');
                    break;
            }

            // relation fields

            let relationSchema: string | undefined;
            let fkSchema: string | undefined;

            if (relations.length > 0) {
                relationSchema = 'relationSchema';
                writer.write(`const ${relationSchema} = z.object(`);
                writer.inlineBlock(() => {
                    [...relations].forEach((field) => {
                        writer.writeLine(`${field.name}: ${makeFieldSchema(field)},`);
                    });
                });
                writer.writeLine(');');
            }

            if (fkFields.length > 0) {
                fkSchema = 'fkSchema';
                writer.write(`const ${fkSchema} = z.object(`);
                writer.inlineBlock(() => {
                    fkFields.forEach((field) => {
                        writer.writeLine(`${field.name}: ${makeFieldSchema(field)},`);
                    });
                });
                writer.writeLine(');');
            }

            // compile "@@validate" to ".refine"
            const refineFuncName = this.createRefineFunction(model, writer);

            // delegate discriminator fields are to be excluded from mutation schemas
            const delegateDiscriminatorFields = model.fields.filter((field) => isDiscriminatorField(field));
            const omitDiscriminators =
                delegateDiscriminatorFields.length > 0
                    ? `.omit({ ${delegateDiscriminatorFields.map((f) => `${f.name}: true`).join(', ')} })`
                    : '';

            ////////////////////////////////////////////////
            // 1. Model schema
            ////////////////////////////////////////////////

            let modelSchema = 'baseSchema';

            // omit fields
            const fieldsToOmit = scalarFields.filter((field) => hasAttribute(field, '@omit'));
            if (fieldsToOmit.length > 0) {
                modelSchema = this.makeOmit(
                    modelSchema,
                    fieldsToOmit.map((f) => f.name)
                );
            }

            // export schema with only scalar fields: `[Model]ScalarSchema`
            const modelScalarSchema = `${upperCaseFirst(model.name)}ScalarSchema`;
            writer.writeLine(`
/**
 * \`${model.name}\` schema excluding foreign keys and relations.
 */
export const ${modelScalarSchema} = ${modelSchema};
`);
            modelSchema = modelScalarSchema;

            // merge fk fields
            if (fkSchema) {
                modelSchema = this.makeMerge(modelSchema, fkSchema);
            }

            // merge relation fields (all optional)
            if (relationSchema) {
                modelSchema = this.makeMerge(modelSchema, this.makePartial(relationSchema));
            }

            // refine
            if (refineFuncName) {
                // export a schema without refinement for extensibility: `[Model]WithoutRefineSchema`
                const noRefineSchema = `${upperCaseFirst(model.name)}WithoutRefineSchema`;
                writer.writeLine(`
/**
 * \`${model.name}\` schema prior to calling \`.refine()\` for extensibility.
 */
export const ${noRefineSchema} = ${modelSchema};
`);
                modelSchema = `${refineFuncName}(${noRefineSchema})`;
            }

            // export the final model schema: `[Model]Schema`
            writer.writeLine(`
/**
 * \`${model.name}\` schema including all fields (scalar, foreign key, and relations) and validations.
 */
export const ${upperCaseFirst(model.name)}Schema = ${modelSchema};
`);

            ////////////////////////////////////////////////
            // 2. Prisma create & update
            ////////////////////////////////////////////////

            // schema for validating prisma create input (all fields optional)
            let prismaCreateSchema = this.makePassthrough(this.makePartial(`baseSchema${omitDiscriminators}`));
            if (refineFuncName) {
                prismaCreateSchema = `${refineFuncName}(${prismaCreateSchema})`;
            }
            writer.writeLine(`
/**
 * Schema used for validating Prisma create input. For internal use only.
 * @private
 */
export const ${upperCaseFirst(model.name)}PrismaCreateSchema = ${prismaCreateSchema};
`);

            // schema for validating prisma update input (all fields optional)
            // note numeric fields can be simple update or atomic operations
            let prismaUpdateSchema = `z.object({
                ${scalarFields
                    .filter((f) => !isDiscriminatorField(f))
                    .map((field) => {
                        let fieldSchema = makeFieldSchema(field);
                        if (field.type.type === 'Int' || field.type.type === 'Float') {
                            fieldSchema = `z.union([${fieldSchema}, z.record(z.unknown())])`;
                        }
                        return `\t${field.name}: ${fieldSchema}`;
                    })
                    .join(',\n')}
    })`;
            prismaUpdateSchema = this.makePassthrough(this.makePartial(prismaUpdateSchema));
            writer.writeLine(
                `
/**
 * Schema used for validating Prisma update input. For internal use only.
 * @private
 */
export const ${upperCaseFirst(model.name)}PrismaUpdateSchema = ${prismaUpdateSchema};
`
            );

            ////////////////////////////////////////////////
            // 3. Create schema
            ////////////////////////////////////////////////

            let createSchema = `baseSchema${omitDiscriminators}`;
            const fieldsWithDefault = scalarFields.filter(
                (field) => hasAttribute(field, '@default') || hasAttribute(field, '@updatedAt') || field.type.array
            );

            // mark fields with default as optional
            if (fieldsWithDefault.length > 0) {
                // delegate discriminator fields are omitted from the base schema, so we need
                // to take care not to make them partial otherwise the schema won't compile
                createSchema = this.makePartial(
                    createSchema,
                    fieldsWithDefault.filter((f) => !delegateDiscriminatorFields.includes(f)).map((f) => f.name)
                );
            }

            // export schema with only scalar fields: `[Model]CreateScalarSchema`
            const createScalarSchema = `${upperCaseFirst(model.name)}CreateScalarSchema`;
            writer.writeLine(`
/**
 * \`${model.name}\` schema for create operations excluding foreign keys and relations.
 */
export const ${createScalarSchema} = ${createSchema};
`);

            if (fkSchema) {
                // merge fk fields
                createSchema = this.makeMerge(createScalarSchema, fkSchema);
            }

            if (refineFuncName) {
                // export a schema without refinement for extensibility: `[Model]CreateWithoutRefineSchema`
                const noRefineSchema = `${upperCaseFirst(model.name)}CreateWithoutRefineSchema`;
                writer.writeLine(`
/**
 * \`${model.name}\` schema for create operations prior to calling \`.refine()\` for extensibility.
 */
export const ${noRefineSchema} = ${createSchema};
`);
                createSchema = `${refineFuncName}(${noRefineSchema})`;
            }

            // export the final create schema: `[Model]CreateSchema`
            writer.writeLine(`
/**
 * \`${model.name}\` schema for create operations including scalar fields, foreign key fields, and validations.
 */
export const ${upperCaseFirst(model.name)}CreateSchema = ${createSchema};
`);

            ////////////////////////////////////////////////
            // 3. Update schema
            ////////////////////////////////////////////////

            // for update all fields are optional
            let updateSchema = this.makePartial(`baseSchema${omitDiscriminators}`);

            // export schema with only scalar fields: `[Model]UpdateScalarSchema`
            const updateScalarSchema = `${upperCaseFirst(model.name)}UpdateScalarSchema`;
            writer.writeLine(`
/**
 * \`${model.name}\` schema for update operations excluding foreign keys and relations.
 */
export const ${updateScalarSchema} = ${updateSchema};
`);

            updateSchema = updateScalarSchema;

            if (fkSchema) {
                // merge fk fields
                updateSchema = this.makeMerge(updateSchema, this.makePartial(fkSchema));
            }

            if (refineFuncName) {
                // export a schema without refinement for extensibility: `[Model]UpdateWithoutRefineSchema`
                const noRefineSchema = `${upperCaseFirst(model.name)}UpdateWithoutRefineSchema`;
                writer.writeLine(`
/**
 * \`${model.name}\` schema for update operations prior to calling \`.refine()\` for extensibility.
 */
export const ${noRefineSchema} = ${updateSchema};
`);
                updateSchema = `${refineFuncName}(${noRefineSchema})`;
            }

            // export the final update schema: `[Model]UpdateSchema`
            writer.writeLine(`
/**
 * \`${model.name}\` schema for update operations including scalar fields, foreign key fields, and validations.
 */
export const ${upperCaseFirst(model.name)}UpdateSchema = ${updateSchema};
`);
        });

        return schemaName;
    }

    private createRefineFunction(decl: DataModel | TypeDef, writer: CodeBlockWriter) {
        const refinements = this.makeValidationRefinements(decl);
        let refineFuncName: string | undefined;
        if (refinements.length > 0) {
            refineFuncName = `refine${upperCaseFirst(decl.name)}`;
            writer.writeLine(
                `
    /**
    * Schema refinement function for applying \`@@validate\` rules.
    */
    export function ${refineFuncName}<T, D extends z.ZodTypeDef>(schema: z.ZodType<T, D, T>) { return schema${refinements.join(
                    '\n'
                )};
    }
    `
            );
            return refineFuncName;
        } else {
            return undefined;
        }
    }

    private makeValidationRefinements(decl: DataModel | TypeDef) {
        const attrs = decl.attributes.filter((attr) => attr.decl.ref?.name === '@@validate');
        const refinements = attrs
            .map((attr) => {
                const valueArg = getAttributeArg(attr, 'value');
                if (!valueArg) {
                    return undefined;
                }

                const messageArg = getAttributeArgLiteral<string>(attr, 'message');
                const message = messageArg ? `message: ${JSON.stringify(messageArg)},` : '';

                const pathArg = getAttributeArg(attr, 'path');
                const path =
                    pathArg && isArrayExpr(pathArg)
                        ? `path: ['${getLiteralArray<string>(pathArg)?.join(`', '`)}'],`
                        : '';

                const options = `, { ${message} ${path} }`;

                try {
                    let expr = new TypeScriptExpressionTransformer({
                        context: ExpressionContext.ValidationRule,
                        fieldReferenceContext: 'value',
                    }).transform(valueArg);

                    if (isDataModelFieldReference(valueArg)) {
                        // if the expression is a simple field reference, treat undefined
                        // as true since the all fields are optional in validation context
                        expr = `${expr} ?? true`;
                    }

                    return `.refine((value: any) => ${expr}${options})`;
                } catch (err) {
                    if (err instanceof TypeScriptExpressionTransformerError) {
                        throw new PluginError(name, err.message);
                    } else {
                        throw err;
                    }
                }
            })
            .filter((r) => !!r);

        return refinements;
    }

    private makePartial(schema: string, fields?: string[]) {
        if (fields) {
            if (fields.length === 0) {
                return schema;
            } else {
                return `${schema}.partial({
            ${fields.map((f) => `${f}: true`).join(', ')}
        })`;
            }
        } else {
            return `${schema}.partial()`;
        }
    }

    private makeOmit(schema: string, fields: string[]) {
        return `${schema}.omit({
            ${fields.map((f) => `${f}: true`).join(', ')},
        })`;
    }

    private makeMerge(schema1: string, schema2: string): string {
        return `${schema1}.merge(${schema2})`;
    }

    private makePassthrough(schema: string) {
        return `${schema}.passthrough()`;
    }
}

export function computePrismaClientImport(importingFrom: string, options: PluginOptions) {
    let importPath = getPrismaClientImportSpec(importingFrom, options);
    if (importPath.startsWith(RUNTIME_PACKAGE) && !options.output) {
        // default import from `@zenstackhq/runtime` and this plugin is generating
        // into default location, we should correct the prisma client import into a
        // importing from `.zenstack` to avoid cyclic dependencies with runtime
        importPath = importPath.replace(RUNTIME_PACKAGE, '.zenstack');
    }
    return importPath;
}
