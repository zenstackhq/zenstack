import { ConnectorType, DMMF } from '@prisma/generator-helper';
import { Dictionary } from '@prisma/internals';
import {
    AUXILIARY_FIELDS,
    PluginOptions,
    createProject,
    emitProject,
    getDataModels,
    getLiteral,
    hasAttribute,
    isForeignKeyField,
    resolvePath,
    saveProject,
    isEnumFieldReference,
    getPrismaClientImportSpec,
} from '@zenstackhq/sdk';
import { DataModel, DataSource, EnumField, Model, isDataModel, isDataSource, isEnum } from '@zenstackhq/sdk/ast';
import {
    AggregateOperationSupport,
    addMissingInputObjectTypes,
    resolveAggregateOperationSupport,
} from '@zenstackhq/sdk/dmmf-helpers';
import { promises as fs } from 'fs';
import path from 'path';
import { Project } from 'ts-morph';
import { getDefaultOutputFolder } from '../plugin-utils';
import Transformer from './transformer';
import removeDir from './utils/removeDir';
import { upperCaseFirst } from 'upper-case-first';
import { makeFieldSchema, makeValidationRefinements } from './utils/schema-gen';
import { streamAllContents } from 'langium';
import { isFromStdlib } from 'src/language-server/utils';

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

    Transformer.provider = dataSourceProvider;

    const generatorConfigOptions: Dictionary<string> = {};
    Object.entries(options).forEach(([k, v]) => (generatorConfigOptions[k] = v as string));

    addMissingInputObjectTypes(inputObjectTypes, outputObjectTypes, models);

    const aggregateOperationSupport = resolveAggregateOperationSupport(inputObjectTypes);

    await generateObjectSchemas(inputObjectTypes, project, output, model);
    await generateModelSchemas(models, modelOperations, aggregateOperationSupport, project, model, output);

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

async function generateEnumSchemas(
    prismaSchemaEnum: DMMF.SchemaEnum[],
    modelSchemaEnum: DMMF.SchemaEnum[],
    project: Project,
    zmodel: Model
) {
    const enumTypes = [...prismaSchemaEnum, ...modelSchemaEnum];
    const enumNames = enumTypes.map((enumItem) => enumItem.name);
    Transformer.enumNames = enumNames ?? [];
    const transformer = new Transformer({
        enumTypes,
        project,
        zmodel,
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
        const transformer = new Transformer({ name, fields, project, zmodel });
        const moduleName = transformer.generateObjectSchema();
        moduleNames.push(moduleName);
    }
    project.createSourceFile(
        path.join(output, 'objects/index.ts'),
        moduleNames.map((name) => `export * from './${name}';`).join('\n'),
        { overwrite: true }
    );
}

async function generateModelSchemas(
    models: DMMF.Model[],
    modelOperations: DMMF.ModelMapping[],
    aggregateOperationSupport: AggregateOperationSupport,
    project: Project,
    zmodel: Model,
    output: string
) {
    const transformer = new Transformer({
        models,
        modelOperations,
        aggregateOperationSupport,
        project,
        zmodel,
    });
    await transformer.generateInputSchemas();

    const schemaNames: string[] = [];
    for (const dm of getDataModels(zmodel)) {
        schemaNames.push(await generateModelSchema(dm, project, output));
    }

    project.createSourceFile(
        path.join(output, 'models', 'index.ts'),
        schemaNames.map((name) => `export * from './${name}';`).join('\n'),
        { overwrite: true }
    );

    project.createSourceFile(
        path.join(output, 'index.ts'),
        `export * as input from './input';
    export * as models from './models';
    export * as objects from './objects';
    export * as enums from './enums';
    `,
        { overwrite: true }
    );
}

async function generateModelSchema(model: DataModel, project: Project, output: string) {
    const schemaName = `${upperCaseFirst(model.name)}.schema`;
    const sf = project.createSourceFile(path.join(output, 'models', `${schemaName}.ts`), undefined, {
        overwrite: true,
    });
    sf.replaceWithText((writer) => {
        writer.writeLine('/* eslint-disable */');

        // import enums
        const importEnums = new Set<string>();
        for (const node of streamAllContents(model)) {
            if (isEnumFieldReference(node)) {
                const field = node.target.ref as EnumField;
                importEnums.add(field.$container.name);
            }
        }
        if (importEnums.size > 0) {
            const prismaImport = getPrismaClientImportSpec(model.$container, path.join(output, 'models'));
            writer.writeLine(`import { ${[...importEnums].join(', ')} } from '${prismaImport}';`);
        }

        const fields = model.fields.filter(
            (field) =>
                !AUXILIARY_FIELDS.includes(field.name) &&
                // scalar fields only
                !isDataModel(field.type.reference?.ref) &&
                !isForeignKeyField(field)
        );

        writer.writeLine(`import { z } from 'zod';`);

        // import enums
        for (const field of fields) {
            if (
                field.type.reference?.ref &&
                isEnum(field.type.reference?.ref) &&
                !isFromStdlib(field.type.reference?.ref)
            ) {
                const name = upperCaseFirst(field.type.reference?.ref.name);
                writer.writeLine(`import { ${name}Schema } from '../enums/${name}.schema';`);
            }
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
            writer.writeLine(`function refine(schema: z.ZodType) { return schema${refinements.join('\n')}; }`);
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
