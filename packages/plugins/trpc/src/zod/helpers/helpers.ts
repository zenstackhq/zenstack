import { DMMF, ConnectorType, Dictionary } from '@prisma/generator-helper';
import Transformer from '../transformer';
import { addMissingInputObjectTypesForMongoDbRawOpsAndQueries } from './mongodb-helpers';
import {
    addMissingInputObjectTypesForAggregate,
    addMissingInputObjectTypesForSelect,
    addMissingInputObjectTypesForInclude,
    addMissingInputObjectTypesForModelArgs,
} from '@zenstackhq/sdk/dmmf-helpers';

interface AddMissingInputObjectTypeOptions {
    isGenerateSelect: boolean;
    isGenerateInclude: boolean;
}

export function addMissingInputObjectTypes(
    inputObjectTypes: DMMF.InputType[],
    outputObjectTypes: DMMF.OutputType[],
    models: DMMF.Model[],
    modelOperations: DMMF.ModelMapping[],
    dataSourceProvider: ConnectorType,
    options: AddMissingInputObjectTypeOptions
) {
    // TODO: remove once Prisma fix this issue: https://github.com/prisma/prisma/issues/14900
    if (dataSourceProvider === 'mongodb') {
        addMissingInputObjectTypesForMongoDbRawOpsAndQueries(modelOperations, outputObjectTypes, inputObjectTypes);
    }
    addMissingInputObjectTypesForAggregate(inputObjectTypes, outputObjectTypes);
    if (options.isGenerateSelect) {
        addMissingInputObjectTypesForSelect(inputObjectTypes, outputObjectTypes, models);
        Transformer.setIsGenerateSelect(true);
    }
    if (options.isGenerateSelect || options.isGenerateInclude) {
        addMissingInputObjectTypesForModelArgs(inputObjectTypes, models);
    }
    if (options.isGenerateInclude) {
        addMissingInputObjectTypesForInclude(inputObjectTypes, models);
        Transformer.setIsGenerateInclude(true);
    }
}

export function resolveAddMissingInputObjectTypeOptions(
    generatorConfigOptions: Dictionary<string>
): AddMissingInputObjectTypeOptions {
    return {
        isGenerateSelect: generatorConfigOptions.isGenerateSelect !== 'false',
        isGenerateInclude: generatorConfigOptions.isGenerateInclude !== 'false',
    };
}
