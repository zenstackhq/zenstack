import { ConnectorType, DMMF } from '@prisma/generator-helper';
import { Dictionary } from '@prisma/internals';
import {
    AUXILIARY_FIELDS,
    PluginOptions,
    createProject,
    emitProject,
    getDataModels,
    getLiteral,
    isForeignKeyField,
    resolvePath,
    saveProject,
} from '@zenstackhq/sdk';
import { DataModel, DataSource, Model, isDataModel, isDataSource, isEnum } from '@zenstackhq/sdk/ast';
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
import { makeFieldSchema } from './utils/schema-gen';

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

    const exports =
        schemaNames.map((name) => `export * from './models/${name}'`).join('\n') +
        `\nexport * as InputSchemas from './input';`;

    project.createSourceFile(path.join(output, 'index.ts'), exports, { overwrite: true });
}

async function generateModelSchema(model: DataModel, project: Project, output: string) {
    const schemaName = `${upperCaseFirst(model.name)}.schema`;
    const sf = project.createSourceFile(path.join(output, 'models', `${schemaName}.ts`), undefined, {
        overwrite: true,
    });
    sf.replaceWithText((writer) => {
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
            if (field.type.reference?.ref && isEnum(field.type.reference?.ref)) {
                const name = upperCaseFirst(field.type.reference?.ref.name);
                writer.writeLine(`import { ${name}Schema } from '../enums/${name}.schema';`);
            }
        }

        writer.write(`export const ${upperCaseFirst(model.name)}Schema = z.object(`);
        writer.inlineBlock(() => {
            fields.forEach((field) => {
                writer.writeLine(`${field.name}: ${makeFieldSchema(field, false)},`);
            });
        });
        writer.writeLine(');');

        writer.write(`export const ${upperCaseFirst(model.name)}CreateSchema = z.object(`);
        writer.inlineBlock(() => {
            fields.forEach((field) => {
                writer.writeLine(`${field.name}: ${makeFieldSchema(field, true)},`);
            });
        });
        writer.writeLine(');');

        writer.write(
            `export const ${upperCaseFirst(model.name)}UpdateSchema = ${upperCaseFirst(model.name)}Schema.partial();`
        );
    });
    return schemaName;
}
