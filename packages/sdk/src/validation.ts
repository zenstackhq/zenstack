import type { DataModel, DataModelAttribute, DataModelFieldAttribute } from './ast';

function isValidationAttribute(attr: DataModelAttribute | DataModelFieldAttribute) {
    return attr.decl.ref?.attributes.some((attr) => attr.decl.$refText === '@@@validation');
}

/**
 * Returns if the given model contains any data validation rules (both at the model
 * level and at the field level).
 */
export function hasValidationAttributes(model: DataModel) {
    if (model.attributes.some((attr) => isValidationAttribute(attr))) {
        return true;
    }

    if (model.fields.some((field) => field.attributes.some((attr) => isValidationAttribute(attr)))) {
        return true;
    }

    return false;
}
