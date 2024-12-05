import semver from 'semver';
import { getPrismaVersion, type DMMF } from '../prisma';
import { checkModelHasModelRelation } from './model-helpers';

export function addMissingInputObjectTypesForModelArgs(
    inputObjectTypes: DMMF.InputType[],
    models: readonly DMMF.Model[]
) {
    const modelArgsInputObjectTypes = generateModelArgsInputObjectTypes(models);

    for (const modelArgsInputObjectType of modelArgsInputObjectTypes) {
        inputObjectTypes.push(modelArgsInputObjectType);
    }
}
function generateModelArgsInputObjectTypes(models: readonly DMMF.Model[]) {
    const modelArgsInputObjectTypes: DMMF.InputType[] = [];
    const prismaVersion = getPrismaVersion();
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
            name:
                prismaVersion && semver.gte(prismaVersion, '6.0.0')
                    ? `${modelName}DefaultArgs` // Prisma 6+ removed [Model]Args type
                    : `${modelName}Args`,
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
