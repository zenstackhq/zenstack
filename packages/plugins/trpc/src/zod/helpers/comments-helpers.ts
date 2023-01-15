import { DMMF } from '@prisma/generator-helper';

const modelAttributeRegex = /(@@Gen\.)+([A-z])+(\()+(.+)+(\))+/;
const attributeNameRegex = /(?:\.)+([A-Za-z])+(?:\()+/;
const attributeArgsRegex = /(?:\()+([A-Za-z])+:+(.+)+(?:\))+/;

export function resolveModelsComments(
    models: DMMF.Model[],
    modelOperations: DMMF.ModelMapping[],
    enumTypes: { model?: DMMF.SchemaEnum[]; prisma: DMMF.SchemaEnum[] },
    hiddenModels: string[],
    hiddenFields: string[]
) {
    models = collectHiddenModels(models, hiddenModels);
    collectHiddenFields(models, hiddenModels, hiddenFields);
    hideModelOperations(models, modelOperations);
    hideEnums(enumTypes, hiddenModels);
}

function collectHiddenModels(models: DMMF.Model[], hiddenModels: string[]) {
    return models
        .map((model) => {
            if (model.documentation) {
                const attribute = model.documentation?.match(modelAttributeRegex)?.[0];
                const attributeName = attribute?.match(attributeNameRegex)?.[0]?.slice(1, -1);
                if (attributeName !== 'model') model;
                const rawAttributeArgs = attribute?.match(attributeArgsRegex)?.[0]?.slice(1, -1);

                const parsedAttributeArgs: Record<string, unknown> = {};
                if (rawAttributeArgs) {
                    const rawAttributeArgsParts = rawAttributeArgs
                        .split(':')
                        .map((it) => it.trim())
                        .map((part) => (part.startsWith('[') ? part : part.split(',')))
                        .flat()
                        .map((it) => it.trim());

                    for (let i = 0; i < rawAttributeArgsParts.length; i += 2) {
                        const key = rawAttributeArgsParts[i];
                        const value = rawAttributeArgsParts[i + 1];
                        parsedAttributeArgs[key] = JSON.parse(value);
                    }
                }
                if (parsedAttributeArgs.hide) {
                    hiddenModels.push(model.name);
                    return null as unknown as DMMF.Model;
                }
            }
            return model;
        })
        .filter(Boolean);
}

function collectHiddenFields(models: DMMF.Model[], hiddenModels: string[], hiddenFields: string[]) {
    models.forEach((model) => {
        model.fields.forEach((field) => {
            if (hiddenModels.includes(field.type)) {
                hiddenFields.push(field.name);
                if (field.relationFromFields) {
                    field.relationFromFields.forEach((item) => hiddenFields.push(item));
                }
            }
        });
    });
}
function hideEnums(enumTypes: { model?: DMMF.SchemaEnum[]; prisma: DMMF.SchemaEnum[] }, hiddenModels: string[]) {
    enumTypes.prisma = enumTypes.prisma.filter((item) => !hiddenModels.find((model) => item.name.startsWith(model)));
}

function hideModelOperations(models: DMMF.Model[], modelOperations: DMMF.ModelMapping[]) {
    let i = modelOperations.length;
    while (i >= 0) {
        --i;
        const modelOperation = modelOperations[i];
        if (
            modelOperation &&
            !models.find((model) => {
                return model.name === modelOperation.model;
            })
        ) {
            modelOperations.splice(i, 1);
        }
    }
}

export function hideInputObjectTypesAndRelatedFields(
    inputObjectTypes: DMMF.InputType[],
    hiddenModels: string[],
    hiddenFields: string[]
) {
    let j = inputObjectTypes.length;
    while (j >= 0) {
        --j;
        const inputType = inputObjectTypes[j];
        if (
            inputType &&
            (hiddenModels.includes(inputType?.meta?.source as string) ||
                hiddenModels.find((model) => inputType.name.startsWith(model)))
        ) {
            inputObjectTypes.splice(j, 1);
        } else {
            let k = inputType?.fields?.length ?? 0;
            while (k >= 0) {
                --k;
                const field = inputType?.fields?.[k];
                if (field && hiddenFields.includes(field.name)) {
                    inputObjectTypes[j].fields.splice(k, 1);
                }
            }
        }
    }
}
