import { lowerCaseFirst } from 'lower-case-first';

/**
 * Runtime information of a data model or field attribute
 */
export type RuntimeAttribute = {
    /**
     * Attribute name
     */
    name: string;

    /**
     * Attribute arguments
     */
    args: Array<{ name?: string; value: unknown }>;
};

/**
 * Function for computing default value for a field
 */
export type FieldDefaultValueProvider = (userContext: unknown) => unknown;

/**
 * Runtime information of a data model field
 */
export type FieldInfo = {
    /**
     * Field name
     */
    name: string;

    /**
     * Field type name
     */
    type: string;

    /**
     * If the field is an ID field or part of a multi-field ID
     */
    isId?: boolean;

    /**
     * If the field type is a data model (or an optional/array of data model)
     */
    isDataModel?: boolean;

    /**
     * If the field is an array
     */
    isArray?: boolean;

    /**
     * If the field is optional
     */
    isOptional?: boolean;

    /**
     * Attributes on the field
     */
    attributes?: RuntimeAttribute[];

    /**
     * If the field is a relation field, the field name of the reverse side of the relation
     */
    backLink?: string;

    /**
     * If the field is the owner side of a relation
     */
    isRelationOwner?: boolean;

    /**
     * If the field is a foreign key field
     */
    isForeignKey?: boolean;

    /**
     * If the field is a foreign key field, the field name of the corresponding relation field.
     * Only available on foreign key fields.
     */
    relationField?: string;

    /**
     * Mapping from foreign key field names to relation field names.
     * Only available on relation fields.
     */
    foreignKeyMapping?: Record<string, string>;

    /**
     * Model from which the field is inherited
     */
    inheritedFrom?: string;

    /**
     * A function that provides a default value for the field
     */
    defaultValueProvider?: FieldDefaultValueProvider;

    /**
     * If the field is an auto-increment field
     */
    isAutoIncrement?: boolean;
};

/**
 * Metadata for a model-level unique constraint
 * e.g.: @@unique([a, b])
 */
export type UniqueConstraint = { name: string; fields: string[] };

/**
 * Metadata for a data model
 */
export type ModelInfo = {
    /**
     * Model name
     */
    name: string;

    /**
     * Base types
     */
    baseTypes?: string[];

    /**
     * Fields
     */
    fields: Record<string, FieldInfo>;

    /**
     * Unique constraints
     */
    uniqueConstraints?: Record<string, UniqueConstraint>;

    /**
     * Attributes on the model
     */
    attributes?: RuntimeAttribute[];

    /**
     * Discriminator field name
     */
    discriminator?: string;
};

/**
 * ZModel data model metadata
 */
export type ModelMeta = {
    /**
     * Data models
     */
    models: Record<string, ModelInfo>;

    /**
     * Mapping from model name to models that will be deleted because of it due to cascade delete
     */
    deleteCascade?: Record<string, string[]>;

    /**
     * Name of model that backs the `auth()` function
     */
    authModel?: string;
};

/**
 * Resolves a model field to its metadata. Returns undefined if not found.
 */
export function resolveField(modelMeta: ModelMeta, model: string, field: string): FieldInfo | undefined {
    return modelMeta.models[lowerCaseFirst(model)]?.fields?.[field];
}

/**
 * Resolves a model field to its metadata. Throws an error if not found.
 */
export function requireField(modelMeta: ModelMeta, model: string, field: string) {
    const f = resolveField(modelMeta, model, field);
    if (!f) {
        throw new Error(`Field ${model}.${field} cannot be resolved`);
    }
    return f;
}

/**
 * Gets all fields of a model.
 */
export function getFields(modelMeta: ModelMeta, model: string) {
    return modelMeta.models[lowerCaseFirst(model)]?.fields;
}

/**
 * Gets unique constraints of a model.
 */
export function getUniqueConstraints(modelMeta: ModelMeta, model: string) {
    return modelMeta.models[lowerCaseFirst(model)]?.uniqueConstraints;
}
