import { ConnectorType, DMMF } from '@prisma/generator-helper';
import {
    PluginOptions,
    createProject,
    emitProject,
    getDataModels,
    getLiteral,
    getPrismaClientImportSpec,
    hasAttribute,
    isEnumFieldReference,
    isForeignKeyField,
    isFromStdlib,
    resolvePath,
    saveProject,
} from '@zenstackhq/sdk';
import { DataModel, DataSource, EnumField, Model, isDataModel, isDataSource, isEnum } from '@zenstackhq/sdk/ast';
import { addMissingInputObjectTypes, resolveAggregateOperationSupport } from '@zenstackhq/sdk/dmmf-helpers';
import { promises as fs } from 'fs';
import { streamAllContents } from 'langium';
import path from 'path';
import { Project } from 'ts-morph';
import { upperCaseFirst } from 'upper-case-first';
import { getDefaultOutputFolder } from '../plugin-utils';
import Transformer from './transformer';
import removeDir from './utils/removeDir';
import { makeFieldSchema, makeValidationRefinements } from './utils/schema-gen';

export async function generate(model: Model, options: PluginOptions, dmmf: DMMF.Document) {
    let output = options.output as string;
    if (!output) {
        const defaultOutputFolder = getDefaultOutputFolder();
        if (defaultOutputFolder) {
            output = path.join(defaultOutputFolder, 'zod');
        } else {
            output = './generated/zod';
        }
    }
    output = resolvePath(output, options);
    await handleGeneratorOutputValue(output);

    const prismaClientDmmf = dmmf;

    const modelOperations = prismaClientDmmf.mappings.modelOperations;
    const inputObjectTypes = prismaClientDmmf.schema.inputObjectTypes.prisma;
    const outputObjectTypes = prismaClientDmmf.schema.outputObjectTypes.prisma;
    const models: DMMF.Model[] = prismaClientDmmf.datamodel.models;

    const project = createProject();

    // common schemas
    await generateCommonSchemas(project, output);

    // enums
    await generateEnumSchemas(
        prismaClientDmmf.schema.enumTypes.prisma,
        prismaClientDmmf.schema.enumTypes.model ?? [],
        project,
        model
    );

    const dataSource = model.declarations.find((d): d is DataSource => isDataSource(d));

    const dataSourceProvider = getLiteral<string>(
        dataSource?.fields.find((f) => f.name === 'provider')?.value
    ) as ConnectorType;

    await generateModelSchemas(project, model, output);

    if (options.modelOnly !== true) {
        // detailed object schemas referenced from input schemas
        Transformer.provider = dataSourceProvider;
        addMissingInputObjectTypes(inputObjectTypes, outputObjectTypes, models);
        const aggregateOperationSupport = resolveAggregateOperationSupport(inputObjectTypes);
        await generateObjectSchemas(inputObjectTypes, project, output, model);

        // input schemas
        const transformer = new Transformer({
            models,
            modelOperations,
            aggregateOperationSupport,
            project,
            zmodel: model,
            inputObjectTypes,
        });
        await transformer.generateInputSchemas();
    }

    // create barrel file
    const exports = [`export * as models from './models'`, `export * as enums from './enums'`];
    if (options.modelOnly !== true) {
        exports.push(`export * as input from './input'`, `export * as objects from './objects'`);
    }
    project.createSourceFile(path.join(output, 'index.ts'), exports.join(';\n'), { overwrite: true });

    // emit
    const shouldCompile = options.compile !== false;
    if (!shouldCompile || options.preserveTsFiles === true) {
        // save ts files
        await saveProject(project);
    }
    if (shouldCompile) {
        await emitProject(project);
    }
}

async function handleGeneratorOutputValue(output: string) {
    // create the output directory and delete contents that might exist from a previous run
    await fs.mkdir(output, { recursive: true });
    const isRemoveContentsOnly = true;
    await removeDir(output, isRemoveContentsOnly);

    Transformer.setOutputPath(output);
}

async function generateCommonSchemas(project: Project, output: string) {
    // Decimal
    project.createSourceFile(
        path.join(output, 'common', 'index.ts'),
        `
import { z } from 'zod';
export const DecimalSchema = z.union([z.number(), z.string(), z.object({d: z.number().array(), e: z.number(), s: z.number()}).passthrough()]);
`,
        { overwrite: true }
    );
}

async function generateEnumSchemas(
    prismaSchemaEnum: DMMF.SchemaEnum[],
    modelSchemaEnum: DMMF.SchemaEnum[],
    project: Project,
    zmodel: Model
) {
    const enumTypes = [...prismaSchemaEnum, ...modelSchemaEnum];
    const enumNames = enumTypes.map((enumItem) => upperCaseFirst(enumItem.name));
    Transformer.enumNames = enumNames ?? [];
    const transformer = new Transformer({
        enumTypes,
        project,
        zmodel,
        inputObjectTypes: [],
    });
    await transformer.generateEnumSchemas();
}

async function generateObjectSchemas(
    inputObjectTypes: DMMF.InputType[],
    project: Project,
    output: string,
    zmodel: Model
) {
    const moduleNames: string[] = [];
    for (let i = 0; i < inputObjectTypes.length; i += 1) {
        const fields = inputObjectTypes[i]?.fields;
        const name = inputObjectTypes[i]?.name;
        const transformer = new Transformer({ name, fields, project, zmodel, inputObjectTypes });
        const moduleName = transformer.generateObjectSchema();
        moduleNames.push(moduleName);
    }
    project.createSourceFile(
        path.join(output, 'objects/index.ts'),
        moduleNames.map((name) => `export * from './${name}';`).join('\n'),
        { overwrite: true }
    );
}

async function generateModelSchemas(project: Project, zmodel: Model, output: string) {
    const schemaNames: string[] = [];
    for (const dm of getDataModels(zmodel)) {
        schemaNames.push(await generateModelSchema(dm, project, output));
    }

    project.createSourceFile(
        path.join(output, 'models', 'index.ts'),
        schemaNames.map((name) => `export * from './${name}';`).join('\n'),
        { overwrite: true }
    );
}

async function generateModelSchema(model: DataModel, project: Project, output: string) {
    const schemaName = `${upperCaseFirst(model.name)}.schema`;
    const sf = project.createSourceFile(path.join(output, 'models', `${schemaName}.ts`), undefined, {
        overwrite: true,
    });
    sf.replaceWithText((writer) => {
        const fields = model.fields.filter(
            (field) =>
                // scalar fields only
                !isDataModel(field.type.reference?.ref) && !isForeignKeyField(field)
        );

        writer.writeLine('/* eslint-disable */');
        writer.writeLine(`import { z } from 'zod';`);

        // import user-defined enums from Prisma as they might be referenced in the expressions
        const importEnums = new Set<string>();
        for (const node of streamAllContents(model)) {
            if (isEnumFieldReference(node)) {
                const field = node.target.ref as EnumField;
                if (!isFromStdlib(field.$container)) {
                    importEnums.add(field.$container.name);
                }
            }
        }
        if (importEnums.size > 0) {
            const prismaImport = getPrismaClientImportSpec(model.$container, path.join(output, 'models'));
            writer.writeLine(`import { ${[...importEnums].join(', ')} } from '${prismaImport}';`);
        }

        // import enum schemas
        const importedEnumSchemas = new Set<string>();
        for (const field of fields) {
            if (field.type.reference?.ref && isEnum(field.type.reference?.ref)) {
                const name = upperCaseFirst(field.type.reference?.ref.name);
                if (!importedEnumSchemas.has(name)) {
                    writer.writeLine(`import { ${name}Schema } from '../enums/${name}.schema';`);
                    importedEnumSchemas.add(name);
                }
            }
        }

        // import Decimal
        if (fields.some((field) => field.type.type === 'Decimal')) {
            writer.writeLine(`import { DecimalSchema } from '../common';`);
            writer.writeLine(`import { Decimal } from 'decimal.js';`);
        }

        // create base schema
        writer.write(`const baseSchema = z.object(`);
        writer.inlineBlock(() => {
            fields.forEach((field) => {
                writer.writeLine(`${field.name}: ${makeFieldSchema(field)},`);
            });
        });
        writer.writeLine(');');

        // compile "@@validate" to ".refine"
        const refinements = makeValidationRefinements(model);
        if (refinements.length > 0) {
            writer.writeLine(`function refine<T, D extends z.ZodTypeDef>(schema: z.ZodType<T, D, T>) { return schema${refinements.join('\n')}; }`);
        }

        // model schema
        let modelSchema = 'baseSchema';
        const fieldsToOmit = fields.filter((field) => hasAttribute(field, '@omit'));
        if (fieldsToOmit.length > 0) {
            modelSchema = makeOmit(
                modelSchema,
                fieldsToOmit.map((f) => f.name)
            );
        }
        if (refinements.length > 0) {
            modelSchema = `refine(${modelSchema})`;
        }
        writer.writeLine(`export const ${upperCaseFirst(model.name)}Schema = ${modelSchema};`);

        // create schema
        let createSchema = 'baseSchema';
        const fieldsWithDefault = fields.filter(
            (field) => hasAttribute(field, '@default') || hasAttribute(field, '@updatedAt') || field.type.array
        );
        if (fieldsWithDefault.length > 0) {
            createSchema = makePartial(
                createSchema,
                fieldsWithDefault.map((f) => f.name)
            );
        }
        if (refinements.length > 0) {
            createSchema = `refine(${createSchema})`;
        }
        writer.writeLine(`export const ${upperCaseFirst(model.name)}CreateSchema = ${createSchema};`);

        // update schema
        let updateSchema = 'baseSchema.partial()';
        if (refinements.length > 0) {
            updateSchema = `refine(${updateSchema})`;
        }
        writer.writeLine(`export const ${upperCaseFirst(model.name)}UpdateSchema = ${updateSchema};`);
    });
    return schemaName;
}

function makePartial(schema: string, fields: string[]) {
    return `${schema}.partial({
        ${fields.map((f) => `${f}: true`).join(', ')},
    })`;
}

function makeOmit(schema: string, fields: string[]) {
    return `${schema}.omit({
        ${fields.map((f) => `${f}: true`).join(', ')},
    })`;
}
