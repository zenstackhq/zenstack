import type { DMMF } from '@prisma/generator-helper';
import { checkModelHasModelRelation } from './model-helpers';

export function addMissingInputObjectTypesForModelArgs(inputObjectTypes: DMMF.InputType[], models: DMMF.Model[]) {
    const modelArgsInputObjectTypes = generateModelArgsInputObjectTypes(models);

    for (const modelArgsInputObjectType of modelArgsInputObjectTypes) {
        inputObjectTypes.push(modelArgsInputObjectType);
    }
}
function generateModelArgsInputObjectTypes(models: DMMF.Model[]) {
    const modelArgsInputObjectTypes: DMMF.InputType[] = [];
    for (const model of models) {
        const { name: modelName } = model;
        const fields: DMMF.SchemaArg[] = [];

        const selectField: DMMF.SchemaArg = {
            name: 'select',
            isRequired: false,
            isNullable: false,
            inputTypes: [
                {
                    isList: false,
                    type: `${modelName}Select`,
                    location: 'inputObjectTypes',
                    namespace: 'prisma',
                },
            ],
        };
        fields.push(selectField);

        const hasRelationToAnotherModel = checkModelHasModelRelation(model);

        if (hasRelationToAnotherModel) {
            const includeField: DMMF.SchemaArg = {
                name: 'include',
                isRequired: false,
                isNullable: false,
                inputTypes: [
                    {
                        isList: false,
                        type: `${modelName}Include`,
                        location: 'inputObjectTypes',
                        namespace: 'prisma',
                    },
                ],
            };
            fields.push(includeField);
        }

        const modelArgsInputObjectType: DMMF.InputType = {
            name: `${modelName}Args`,
            constraints: {
                maxNumFields: null,
                minNumFields: null,
            },
            fields,
        };
        modelArgsInputObjectTypes.push(modelArgsInputObjectType);
    }
    return modelArgsInputObjectTypes;
}
