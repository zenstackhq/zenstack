import type { DMMF } from '../types';
import { checkIsModelRelationField, checkModelHasManyModelRelation } from './model-helpers';

export function addMissingInputObjectTypesForSelect(
    inputObjectTypes: DMMF.InputType[],
    outputObjectTypes: DMMF.OutputType[],
    models: DMMF.Model[]
) {
    // generate input object types necessary to support ModelSelect._count
    const modelCountOutputTypes = getModelCountOutputTypes(outputObjectTypes);
    const modelCountOutputTypeSelectInputObjectTypes =
        generateModelCountOutputTypeSelectInputObjectTypes(modelCountOutputTypes);
    const modelCountOutputTypeArgsInputObjectTypes =
        generateModelCountOutputTypeArgsInputObjectTypes(modelCountOutputTypes);

    const modelSelectInputObjectTypes = generateModelSelectInputObjectTypes(models);

    const generatedInputObjectTypes = [
        modelCountOutputTypeSelectInputObjectTypes,
        modelCountOutputTypeArgsInputObjectTypes,
        modelSelectInputObjectTypes,
    ].flat();

    for (const inputObjectType of generatedInputObjectTypes) {
        inputObjectTypes.push(inputObjectType);
    }
}

function getModelCountOutputTypes(outputObjectTypes: DMMF.OutputType[]) {
    return outputObjectTypes.filter(({ name }) => name.includes('CountOutputType'));
}

function generateModelCountOutputTypeSelectInputObjectTypes(modelCountOutputTypes: DMMF.OutputType[]) {
    const modelCountOutputTypeSelectInputObjectTypes: DMMF.InputType[] = [];
    for (const modelCountOutputType of modelCountOutputTypes) {
        const { name: modelCountOutputTypeName, fields: modelCountOutputTypeFields } = modelCountOutputType;
        const modelCountOutputTypeSelectInputObjectType: DMMF.InputType = {
            name: `${modelCountOutputTypeName}Select`,
            constraints: {
                maxNumFields: null,
                minNumFields: null,
            },
            fields: modelCountOutputTypeFields.map(({ name }) => ({
                name,
                isRequired: false,
                isNullable: false,
                inputTypes: [
                    {
                        isList: false,
                        type: `Boolean`,
                        location: 'scalar',
                    },
                ],
            })),
        };
        modelCountOutputTypeSelectInputObjectTypes.push(modelCountOutputTypeSelectInputObjectType);
    }
    return modelCountOutputTypeSelectInputObjectTypes;
}

function generateModelCountOutputTypeArgsInputObjectTypes(modelCountOutputTypes: DMMF.OutputType[]) {
    const modelCountOutputTypeArgsInputObjectTypes: DMMF.InputType[] = [];
    for (const modelCountOutputType of modelCountOutputTypes) {
        const { name: modelCountOutputTypeName } = modelCountOutputType;
        const modelCountOutputTypeArgsInputObjectType: DMMF.InputType = {
            name: `${modelCountOutputTypeName}Args`,
            constraints: {
                maxNumFields: null,
                minNumFields: null,
            },
            fields: [
                {
                    name: 'select',
                    isRequired: false,
                    isNullable: false,
                    inputTypes: [
                        {
                            isList: false,
                            type: `${modelCountOutputTypeName}Select`,
                            location: 'inputObjectTypes',
                            namespace: 'prisma',
                        },
                    ],
                },
            ],
        };
        modelCountOutputTypeArgsInputObjectTypes.push(modelCountOutputTypeArgsInputObjectType);
    }
    return modelCountOutputTypeArgsInputObjectTypes;
}

function generateModelSelectInputObjectTypes(models: DMMF.Model[]) {
    const modelSelectInputObjectTypes: DMMF.InputType[] = [];
    for (const model of models) {
        const { name: modelName, fields: modelFields } = model;
        const fields: DMMF.SchemaArg[] = [];

        for (const modelField of modelFields) {
            const { name: modelFieldName, isList, type } = modelField;

            const isRelationField = checkIsModelRelationField(modelField);

            const field: DMMF.SchemaArg = {
                name: modelFieldName,
                isRequired: false,
                isNullable: false,
                inputTypes: [{ isList: false, type: 'Boolean', location: 'scalar' }],
            };

            if (isRelationField) {
                const schemaArgInputType: DMMF.InputTypeRef = {
                    isList: false,
                    type: isList ? `${type}FindManyArgs` : `${type}Args`,
                    location: 'inputObjectTypes',
                    namespace: 'prisma',
                };
                field.inputTypes.push(schemaArgInputType);
            }

            fields.push(field);
        }

        const hasManyRelationToAnotherModel = checkModelHasManyModelRelation(model);

        const shouldAddCountField = hasManyRelationToAnotherModel;
        if (shouldAddCountField) {
            const _countField: DMMF.SchemaArg = {
                name: '_count',
                isRequired: false,
                isNullable: false,
                inputTypes: [
                    { isList: false, type: 'Boolean', location: 'scalar' },
                    {
                        isList: false,
                        type: `${modelName}CountOutputTypeArgs`,
                        location: 'inputObjectTypes',
                        namespace: 'prisma',
                    },
                ],
            };
            fields.push(_countField);
        }

        const modelSelectInputObjectType: DMMF.InputType = {
            name: `${modelName}Select`,
            constraints: {
                maxNumFields: null,
                minNumFields: null,
            },
            fields,
        };
        modelSelectInputObjectTypes.push(modelSelectInputObjectType);
    }
    return modelSelectInputObjectTypes;
}
