import { ExpressionUtils } from './expression-utils';
import type {
    DataSourceProviderType,
    EnumDef,
    FieldDef,
    ModelDef,
    ProcedureDef,
    SchemaDef,
    TypeDefDef,
} from './schema';

type Accessors = {
    /**
     * The data source provider type of the schema, e.g. "sqlite", "postgresql", etc.
     */
    get providerType(): DataSourceProviderType;

    /**
     * Gets a model definition by name. Returns `undefined` if the model is not found.
     */
    getModel(name: string): ModelDef | undefined;

    /**
     * Gets a model definition by name. Throws an error if the model is not found.
     */
    requireModel(name: string): ModelDef;

    /**
     * Gets a field definition by model/type and field name. Returns `undefined` if the field is not found.
     */
    getField(modelOrType: string, field: string): FieldDef | undefined;

    /**
     * Gets a field definition by model/type and field name. Throws an error if the field is not found.
     */
    requireField(modelOrType: string, field: string): FieldDef;

    /***
     * Gets an enum definition by name. Returns `undefined` if the enum is not found.
     */
    getEnum(name: string): EnumDef | undefined;

    /**
     * Gets an enum definition by name. Throws an error if the enum is not found.
     */
    requireEnum(name: string): EnumDef;

    /**
     * Gets a type definition by name. Returns `undefined` if the type definition is not found.
     * @param name
     */
    getTypeDef(name: string): TypeDefDef | undefined;

    /**
     * Gets a type definition by name. Throws an error if the type definition is not found.
     */
    requireTypeDef(name: string): TypeDefDef;

    /**
     * Gets a procedure definition by name. Returns `undefined` if the procedure is not found.
     */
    getProcedure(name: string): ProcedureDef | undefined;

    /**
     * Gets a procedure definition by name. Throws an error if the procedure is not found.
     */
    requireProcedure(name: string): ProcedureDef;

    /**
     * Gets the unique fields of a model, including both singular and compound unique fields.
     */
    getUniqueFields(
        model: string,
    ): Array<{ name: string; def: FieldDef } | { name: string; defs: Record<string, FieldDef> }>;

    /**
     * Gets the delegate discriminator field for a model, if defined via `@@delegate` attribute. Returns `undefined` if not available.
     */
    getDelegateDiscriminator(model: string): string | undefined;
};

export class InvalidSchemaError extends Error {
    constructor(message: string) {
        super(message);
    }
}

type AccessorTarget = { schema: SchemaDef };

function _requireModel(schema: SchemaDef, name: string): ModelDef {
    const model = schema.models[name];
    if (!model) throw new InvalidSchemaError(`Model "${name}" not found in schema`);
    return model;
}

function _getField(schema: SchemaDef, modelOrType: string, field: string): FieldDef | undefined {
    const modelDef = schema.models?.[modelOrType];
    if (modelDef) {
        return modelDef.fields[field];
    }
    const typeDef = schema.typeDefs?.[modelOrType];
    if (typeDef) {
        return typeDef.fields[field];
    }
    return undefined;
}

function _requireField(schema: SchemaDef, modelOrType: string, field: string): FieldDef {
    const fieldDef = _getField(schema, modelOrType, field);
    if (!fieldDef) throw new InvalidSchemaError(`Field "${modelOrType}.${field}" not found in schema`);
    return fieldDef;
}

function _requireModelField(schema: SchemaDef, model: string, field: string) {
    const modelDef = _requireModel(schema, model);
    const fieldDef = modelDef.fields[field];
    if (!fieldDef) throw new InvalidSchemaError(`Field "${model}.${field}" not found in schema`);
    return fieldDef;
}

const accessors: Accessors = {
    get providerType() {
        return (this as unknown as AccessorTarget).schema.provider.type;
    },

    getModel(this: { schema: SchemaDef }, name: string) {
        return this.schema.models[name];
    },

    requireModel(this: { schema: SchemaDef }, name: string) {
        return _requireModel(this.schema, name);
    },

    getField(this: { schema: SchemaDef }, modelOrType: string, field: string) {
        return _getField(this.schema, modelOrType, field);
    },

    requireField(this: { schema: SchemaDef }, modelOrType: string, field: string) {
        return _requireField(this.schema, modelOrType, field);
    },

    getEnum(this: { schema: SchemaDef }, name: string) {
        return this.schema.enums?.[name];
    },

    requireEnum(this: { schema: SchemaDef }, name: string) {
        const enumDef = this.schema.enums?.[name];
        if (!enumDef) throw new InvalidSchemaError(`Enum "${name}" not found in schema`);
        return enumDef;
    },

    getTypeDef(this: { schema: SchemaDef }, name: string) {
        return this.schema.typeDefs?.[name];
    },

    requireTypeDef(this: { schema: SchemaDef }, name: string) {
        const typeDef = this.schema.typeDefs?.[name];
        if (!typeDef) throw new InvalidSchemaError(`TypeDef "${name}" not found in schema`);
        return typeDef;
    },

    getProcedure(this: { schema: SchemaDef }, name: string) {
        return this.schema.procedures?.[name];
    },

    requireProcedure(this: { schema: SchemaDef }, name: string) {
        const procedure = this.schema.procedures?.[name];
        if (!procedure) throw new InvalidSchemaError(`Procedure "${name}" not found in schema`);
        return procedure;
    },

    getUniqueFields(this: { schema: SchemaDef }, model: string) {
        const modelDef = _requireModel(this.schema, model);
        const result: Array<{ name: string; def: FieldDef } | { name: string; defs: Record<string, FieldDef> }> = [];
        for (const [key, value] of Object.entries(modelDef.uniqueFields)) {
            if (value === null || typeof value !== 'object') {
                throw new InvalidSchemaError(`Invalid unique field definition for "${model}.${key}"`);
            }

            if (typeof value.type === 'string') {
                // singular unique field
                result.push({ name: key, def: _requireModelField(this.schema, model, key) });
            } else {
                // compound unique field
                result.push({
                    name: key,
                    defs: Object.fromEntries(
                        Object.keys(value).map((k) => [k, _requireModelField(this.schema, model, k)]),
                    ),
                });
            }
        }
        return result;
    },

    getDelegateDiscriminator(this: { schema: SchemaDef }, model: string) {
        const modelDef = _requireModel(this.schema, model);
        const delegateAttr = modelDef.attributes?.find((attr) => attr.name === '@@delegate');
        if (!delegateAttr) {
            return undefined;
        }
        const discriminator = delegateAttr.args?.find((arg) => arg.name === 'discriminator');
        if (!discriminator || !ExpressionUtils.isField(discriminator.value)) {
            throw new InvalidSchemaError(`Discriminator field not defined for model "${model}"`);
        }
        return discriminator.value.field;
    },
};

export type SchemaAccessor<Schema extends SchemaDef> = Schema & Accessors;

export interface SchemaAccessorConstructor {
    new <Schema extends SchemaDef>(schema: Schema): SchemaAccessor<Schema>;
}

export const SchemaAccessor = function <Schema extends SchemaDef>(this: any, schema: Schema) {
    return new Proxy(
        { schema },
        {
            get(target, prop) {
                const descriptor = Object.getOwnPropertyDescriptor(accessors, prop);
                if (descriptor?.get) {
                    return descriptor.get.call(target);
                }
                if (prop in accessors) {
                    return (accessors as any)[prop].bind(target);
                }
                return (schema as any)[prop];
            },
        },
    );
} as unknown as SchemaAccessorConstructor;
