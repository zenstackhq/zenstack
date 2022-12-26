import { ConnectorType, DMMF } from '@prisma/generator-helper';
import { Dictionary } from '@prisma/internals';
import { PluginOptions } from '@zenstackhq/sdk';
import { DataSource, isDataSource, Model } from '@zenstackhq/sdk/ast';
import { getLiteral } from '@zenstackhq/sdk/utils';
import { promises as fs } from 'fs';
import {
    addMissingInputObjectTypes,
    hideInputObjectTypesAndRelatedFields,
    resolveAddMissingInputObjectTypeOptions,
    resolveModelsComments,
} from './helpers';
import { resolveAggregateOperationSupport } from './helpers/aggregate-helpers';
import Transformer from './transformer';
import { AggregateOperationSupport } from './types';
import removeDir from './utils/removeDir';

export async function generate(model: Model, options: PluginOptions, dmmf: DMMF.Document) {
    try {
        await handleGeneratorOutputValue((options.output as string) ?? './generated');

        const prismaClientDmmf = dmmf;

        const modelOperations = prismaClientDmmf.mappings.modelOperations;
        const inputObjectTypes = prismaClientDmmf.schema.inputObjectTypes.prisma;
        const outputObjectTypes = prismaClientDmmf.schema.outputObjectTypes.prisma;
        const enumTypes = prismaClientDmmf.schema.enumTypes;
        const models: DMMF.Model[] = prismaClientDmmf.datamodel.models;
        const hiddenModels: string[] = [];
        const hiddenFields: string[] = [];
        resolveModelsComments(models, modelOperations, enumTypes, hiddenModels, hiddenFields);

        await generateEnumSchemas(
            prismaClientDmmf.schema.enumTypes.prisma,
            prismaClientDmmf.schema.enumTypes.model ?? []
        );

        const dataSource = model.declarations.find((d): d is DataSource => isDataSource(d));

        const dataSourceProvider = getLiteral<string>(
            dataSource?.fields.find((f) => f.name === 'provider')?.value
        ) as ConnectorType;

        Transformer.provider = dataSourceProvider;

        const generatorConfigOptions: Dictionary<string> = {};
        Object.entries(options).forEach(([k, v]) => (generatorConfigOptions[k] = v as string));

        const addMissingInputObjectTypeOptions = resolveAddMissingInputObjectTypeOptions(generatorConfigOptions);
        addMissingInputObjectTypes(
            inputObjectTypes,
            outputObjectTypes,
            models,
            modelOperations,
            dataSourceProvider,
            addMissingInputObjectTypeOptions
        );

        const aggregateOperationSupport = resolveAggregateOperationSupport(inputObjectTypes);

        hideInputObjectTypesAndRelatedFields(inputObjectTypes, hiddenModels, hiddenFields);

        await generateObjectSchemas(inputObjectTypes);
        await generateModelSchemas(models, modelOperations, aggregateOperationSupport);
    } catch (error) {
        console.error(error);
    }
}

async function handleGeneratorOutputValue(output: string) {
    // create the output directory and delete contents that might exist from a previous run
    await fs.mkdir(output, { recursive: true });
    const isRemoveContentsOnly = true;
    await removeDir(output, isRemoveContentsOnly);

    Transformer.setOutputPath(output);
}

async function generateEnumSchemas(prismaSchemaEnum: DMMF.SchemaEnum[], modelSchemaEnum: DMMF.SchemaEnum[]) {
    const enumTypes = [...prismaSchemaEnum, ...modelSchemaEnum];
    const enumNames = enumTypes.map((enumItem) => enumItem.name);
    Transformer.enumNames = enumNames ?? [];
    const transformer = new Transformer({
        enumTypes,
    });
    await transformer.generateEnumSchemas();
}

async function generateObjectSchemas(inputObjectTypes: DMMF.InputType[]) {
    for (let i = 0; i < inputObjectTypes.length; i += 1) {
        const fields = inputObjectTypes[i]?.fields;
        const name = inputObjectTypes[i]?.name;
        const transformer = new Transformer({ name, fields });
        await transformer.generateObjectSchema();
    }
}

async function generateModelSchemas(
    models: DMMF.Model[],
    modelOperations: DMMF.ModelMapping[],
    aggregateOperationSupport: AggregateOperationSupport
) {
    const transformer = new Transformer({
        models,
        modelOperations,
        aggregateOperationSupport,
    });
    await transformer.generateModelSchemas();
}
