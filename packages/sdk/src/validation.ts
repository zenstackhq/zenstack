import {
    isDataModel,
    isTypeDef,
    type DataModel,
    type DataModelAttribute,
    type DataModelFieldAttribute,
    type TypeDef,
} from './ast';

function isValidationAttribute(attr: DataModelAttribute | DataModelFieldAttribute) {
    return attr.decl.ref?.attributes.some((attr) => attr.decl.$refText === '@@@validation');
}

/**
 * Returns if the given model contains any data validation rules (both at the model
 * level and at the field level).
 */
export function hasValidationAttributes(
    decl: DataModel | TypeDef,
    seen: Set<DataModel | TypeDef> = new Set()
): boolean {
    if (seen.has(decl)) {
        return false;
    }
    seen.add(decl);

    if (isDataModel(decl)) {
        if (decl.attributes.some((attr) => isValidationAttribute(attr))) {
            return true;
        }
    }

    if (
        decl.fields.some((field) => {
            if (isTypeDef(field.type.reference?.ref)) {
                return hasValidationAttributes(field.type.reference?.ref, seen);
            } else {
                return field.attributes.some((attr) => isValidationAttribute(attr));
            }
        })
    ) {
        return true;
    }

    return false;
}
