import type { DMMF } from '@prisma/generator-helper';
import { checkIsModelRelationField, checkModelHasModelRelation, checkModelHasManyModelRelation } from './model-helpers';

export function addMissingInputObjectTypesForInclude(inputObjectTypes: DMMF.InputType[], models: DMMF.Model[]) {
    // generate input object types necessary to support ModelInclude with relation support
    const generatedIncludeInputObjectTypes = generateModelIncludeInputObjectTypes(models);

    for (const includeInputObjectType of generatedIncludeInputObjectTypes) {
        inputObjectTypes.push(includeInputObjectType);
    }
}
function generateModelIncludeInputObjectTypes(models: DMMF.Model[]) {
    const modelIncludeInputObjectTypes: DMMF.InputType[] = [];
    for (const model of models) {
        const { name: modelName, fields: modelFields } = model;
        const fields: DMMF.SchemaArg[] = [];

        for (const modelField of modelFields) {
            const { name: modelFieldName, isList, type } = modelField;

            const isRelationField = checkIsModelRelationField(modelField);

            if (isRelationField) {
                const field: DMMF.SchemaArg = {
                    name: modelFieldName,
                    isRequired: false,
                    isNullable: false,
                    inputTypes: [
                        { isList: false, type: 'Boolean', location: 'scalar' },
                        {
                            isList: false,
                            type: isList ? `${type}FindManyArgs` : `${type}Args`,
                            location: 'inputObjectTypes',
                            namespace: 'prisma',
                        },
                    ],
                };
                fields.push(field);
            }
        }

        /**
         * include is not generated for models that do not have a relation with any other models
         * -> continue onto the next model
         */
        const hasRelationToAnotherModel = checkModelHasModelRelation(model);
        if (!hasRelationToAnotherModel) {
            continue;
        }

        const hasManyRelationToAnotherModel = checkModelHasManyModelRelation(model);

        const shouldAddCountField = hasManyRelationToAnotherModel;
        if (shouldAddCountField) {
            const inputTypes: DMMF.SchemaArgInputType[] = [{ isList: false, type: 'Boolean', location: 'scalar' }];
            inputTypes.push({
                isList: false,
                type: `${modelName}CountOutputTypeArgs`,
                location: 'inputObjectTypes',
                namespace: 'prisma',
            });
            const _countField: DMMF.SchemaArg = {
                name: '_count',
                isRequired: false,
                isNullable: false,
                inputTypes,
            };
            fields.push(_countField);
        }

        const modelIncludeInputObjectType: DMMF.InputType = {
            name: `${modelName}Include`,
            constraints: {
                maxNumFields: null,
                minNumFields: null,
            },
            fields,
        };
        modelIncludeInputObjectTypes.push(modelIncludeInputObjectType);
    }
    return modelIncludeInputObjectTypes;
}
