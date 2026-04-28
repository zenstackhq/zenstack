import { lowerCaseFirst, upperCaseFirst } from '@zenstackhq/common-helpers';
import { formatDocument, loadDocument, ZModelCodeGenerator } from '@zenstackhq/language';
import {
    Argument,
    ArrayExpr,
    AttributeArg,
    BooleanLiteral,
    ConfigExpr,
    ConfigField,
    DataField,
    DataFieldAttribute,
    DataFieldType,
    DataModel,
    DataModelAttribute,
    DataSource,
    InvocationExpr,
    isDataModel,
    Model,
    NumberLiteral,
    ReferenceExpr,
    StringLiteral,
} from '@zenstackhq/language/ast';
import { hasAttribute } from '@zenstackhq/language/utils';
import { type BetterAuthOptions } from 'better-auth';
import type { DBAdapterSchemaCreation } from 'better-auth/adapters';
import type { BetterAuthDBSchema, DBFieldAttribute, DBFieldType } from 'better-auth/db';
import fs from 'node:fs';
import { match } from 'ts-pattern';
import { getSupportsArrays, type AdapterConfig } from './config';

export async function generateSchema(
    file: string | undefined,
    tables: BetterAuthDBSchema,
    config: AdapterConfig,
    options: BetterAuthOptions,
): Promise<DBAdapterSchemaCreation> {
    let filePath = file;

    if (!filePath) {
        // TODO: respect "zenstack" entry in package.json for default schema file path
        if (fs.existsSync('./schema.zmodel')) {
            filePath = './schema.zmodel';
        } else {
            filePath = './zenstack/schema.zmodel';
        }
    }

    const schemaExists = fs.existsSync(filePath);

    const schema = await updateSchema(filePath, tables, config, options);

    return {
        code: schema ?? '',
        path: filePath,
        overwrite: schemaExists && !!schema,
    };
}

async function updateSchema(
    schemaPath: string,
    tables: BetterAuthDBSchema,
    config: AdapterConfig,
    options: BetterAuthOptions,
) {
    let zmodel: Model | undefined;
    if (fs.existsSync(schemaPath)) {
        const loadResult = await loadDocument(schemaPath);
        if (!loadResult.success) {
            throw new Error(`Failed to load existing schema at ${schemaPath}: ${loadResult.errors.join(', ')}`);
        }
        zmodel = loadResult.model;
    } else {
        zmodel = initializeZmodel(config);
    }

    // collect to-many relations
    const toManyRelations = new Map();
    for (const [tableName, table] of Object.entries(tables)) {
        const fields = tables[tableName]?.fields;
        for (const field in fields) {
            const attr = fields[field]!;
            if (attr.references) {
                const referencedOriginalModel = attr.references.model;
                const referencedCustomModel = tables[referencedOriginalModel]?.modelName || referencedOriginalModel;
                const referencedModelNameCap = upperCaseFirst(referencedCustomModel);
                if (!toManyRelations.has(referencedModelNameCap)) {
                    toManyRelations.set(referencedModelNameCap, new Set());
                }
                const currentCustomModel = table.modelName ?? tableName;
                const currentModelNameCap = upperCaseFirst(currentCustomModel);
                toManyRelations.get(referencedModelNameCap).add(currentModelNameCap);
            }
        }
    }

    let changed = false;

    const supportsArrays = getSupportsArrays(config);
    for (const [name, table] of Object.entries(tables)) {
        const c = addOrUpdateModel(
            name,
            table,
            zmodel,
            tables,
            toManyRelations,
            supportsArrays,
            !!options.advanced?.database?.useNumberId,
        );
        changed = changed || c;
    }

    if (!changed) {
        return undefined;
    }

    const generator = new ZModelCodeGenerator();
    let content = generator.generate(zmodel);

    try {
        content = await formatDocument(content);
    } catch {
        // ignore formatting errors
    }

    return content;
}

// @default(now())
function addDefaultNow(df: DataField) {
    const nowArg: AttributeArg = {
        $type: 'AttributeArg',
    } as any;
    const nowExpr: InvocationExpr = {
        $type: 'InvocationExpr',
        function: { $refText: 'now' },
        args: [],
        $container: nowArg,
    };
    nowArg.value = nowExpr;
    addFieldAttribute(df, '@default', [nowArg]);
}

function createDataModel(modelName: string, zmodel: Model, numericId: boolean) {
    const dataModel: DataModel = {
        $type: 'DataModel',
        name: modelName,
        fields: [],
        attributes: [],
        mixins: [],
        comments: [],
        isView: false,
        $container: zmodel,
    };

    let idField: DataField;
    if (numericId) {
        idField = addModelField(dataModel, 'id', 'Int', false, false);
    } else {
        idField = addModelField(dataModel, 'id', 'String', false, false);
    }
    addFieldAttribute(idField, '@id');

    return dataModel;
}

function addModelField(dataModel: DataModel, fieldName: string, fieldType: string, array: boolean, optional: boolean) {
    const field: DataField = {
        $type: 'DataField',
        name: fieldName,
        attributes: [],
        comments: [],
        $container: dataModel,
    } as any;
    field.type = {
        $type: 'DataFieldType',
        type: fieldType as any,
        array,
        optional,
        $container: field,
    };
    dataModel.fields.push(field);
    return field;
}

function initializeZmodel(config: AdapterConfig) {
    const zmodel: Model = {
        $type: 'Model',
        declarations: [],
        imports: [],
    };

    // datasource db { ... }
    const ds: DataSource = {
        $type: 'DataSource',
        name: 'db',
        fields: [],
        $container: zmodel,
    };
    zmodel.declarations.push(ds);

    // provider = 'sqlite' | 'postgresql'
    const providerField: ConfigField = {
        $type: 'ConfigField',
        name: 'provider',
        $container: ds,
    } as any;
    providerField.value = {
        $type: 'StringLiteral',
        value: config.provider,
        $container: providerField,
    } satisfies ConfigExpr;

    const urlField: ConfigField = {
        $type: 'ConfigField',
        name: 'url',
        $container: ds,
    } as any;

    // env('DATABASE_URL')
    const envCall: InvocationExpr = {
        $type: 'InvocationExpr',
        function: {
            $refText: 'env',
        },
        args: [],
        $container: urlField,
    };

    // 'DATABASE_URL' arg
    const dbUrlArg: Argument = {
        $type: 'Argument',
    } as any;
    dbUrlArg.value = {
        $type: 'StringLiteral',
        value: 'DATABASE_URL',
        $container: dbUrlArg,
    } satisfies ConfigExpr;

    envCall.args = [dbUrlArg];

    urlField.value =
        config.provider === 'sqlite'
            ? {
                  $type: 'StringLiteral',
                  value: 'file:./dev.db',
                  $container: urlField,
              }
            : envCall;

    ds.fields.push(providerField);
    ds.fields.push(urlField);

    return zmodel;
}

function getMappedFieldType({ bigint, type }: DBFieldAttribute, supportsArrays: boolean) {
    return match<DBFieldType, { type: string; array?: boolean }>(type)
        .with('string', () => ({ type: 'String' }))
        .with('number', () => (bigint ? { type: 'BigInt' } : { type: 'Int' }))
        .with('boolean', () => ({ type: 'Boolean' }))
        .with('date', () => ({ type: 'DateTime' }))
        .with('json', () => ({ type: 'Json' }))
        .with('string[]', () => (supportsArrays ? { type: 'String', array: true } : { type: 'Json' }))
        .with('number[]', () => (supportsArrays ? { type: 'Int', array: true } : { type: 'Json' }))
        .when(
            (v) => Array.isArray(v) && v.every((e) => typeof e === 'string'),
            () => {
                // Handle enum types (e.g., ['user', 'admin']), map them to String type for now
                return { type: 'String' };
            },
        )
        .otherwise(() => {
            throw new Error(`Unsupported field type: ${type}`);
        });
}

function addOrUpdateModel(
    tableName: string,
    table: BetterAuthDBSchema[string],
    zmodel: Model,
    tables: BetterAuthDBSchema,
    toManyRelations: Map<string, Set<string>>,
    supportsArrays: boolean,
    numericId: boolean,
): boolean {
    let changed = false;
    const customModelName = tables[tableName]?.modelName ?? tableName;
    const modelName = upperCaseFirst(customModelName);

    let dataModel = zmodel.declarations.find((d): d is DataModel => isDataModel(d) && d.name === modelName);
    if (!dataModel) {
        changed = true;
        dataModel = createDataModel(modelName, zmodel, numericId);
        zmodel.declarations.push(dataModel);
    }

    if (modelName !== tableName && !hasAttribute(dataModel, '@@map')) {
        addModelAttribute(dataModel, '@@map', [createStringAttributeArg(tableName)]);
    }

    for (const [fName, field] of Object.entries(table.fields)) {
        const fieldName = field.fieldName ?? fName;
        if (dataModel.fields.some((f) => f.name === fieldName)) {
            continue;
        }

        changed = true;

        if (!field.references) {
            // scalar field
            const { array, type } = getMappedFieldType(field, supportsArrays);

            const df: DataField = {
                $type: 'DataField',
                name: fieldName,
                attributes: [],
                comments: [],
                $container: dataModel,
            } as any;
            df.type = {
                $type: 'DataFieldType',
                type: type as any,
                array: !!array,
                optional: !field.required,
                $container: df,
            };
            dataModel.fields.push(df);

            // @id
            if (fieldName === 'id') {
                addFieldAttribute(df, '@id');
            }

            // @unique
            if (field.unique) {
                addFieldAttribute(df, '@unique');
            }

            // @default
            if (field.defaultValue !== undefined) {
                if (fieldName === 'createdAt') {
                    // @default(now())
                    addDefaultNow(df);
                } else if (typeof field.defaultValue === 'boolean') {
                    addFieldAttribute(df, '@default', [createBooleanAttributeArg(field.defaultValue)]);
                } else if (typeof field.defaultValue === 'string') {
                    addFieldAttribute(df, '@default', [createStringAttributeArg(field.defaultValue)]);
                } else if (typeof field.defaultValue === 'number') {
                    addFieldAttribute(df, '@default', [createNumberAttributeArg(field.defaultValue)]);
                } else if (typeof field.defaultValue === 'function') {
                    // For other function-based defaults, we'll need to check what they return
                    const defaultVal = field.defaultValue();
                    if (defaultVal instanceof Date) {
                        // @default(now())
                        addDefaultNow(df);
                    } else {
                        console.warn(
                            `Warning: Unsupported default function for field ${fieldName} in model ${table.modelName}. Please adjust manually.`,
                        );
                    }
                }
            }

            // This is a special handling for updatedAt fields
            if (fieldName === 'updatedAt' && field.onUpdate) {
                addFieldAttribute(df, '@updatedAt');
            } else if (field.onUpdate) {
                console.warn(
                    `Warning: 'onUpdate' is only supported on 'updatedAt' fields. Please adjust manually for field ${fieldName} in model ${table.modelName}.`,
                );
            }
        } else {
            // relation

            // fk field
            addModelField(dataModel, fieldName, numericId ? 'Int' : 'String', false, !field.required);

            // relation field
            const referencedOriginalModelName = field.references.model;
            const referencedCustomModelName =
                tables[referencedOriginalModelName]?.modelName || referencedOriginalModelName;

            const relationField: DataField = {
                $type: 'DataField',
                name: lowerCaseFirst(referencedCustomModelName),
                attributes: [],
                comments: [],
                $container: dataModel,
            } as any;
            relationField.type = {
                $type: 'DataFieldType',
                reference: {
                    $refText: upperCaseFirst(referencedCustomModelName),
                },
                array: (field.type as string).endsWith('[]'),
                optional: !field.required,
                $container: relationField,
            } satisfies DataFieldType;

            let action = 'Cascade';
            if (field.references.onDelete === 'no action') action = 'NoAction';
            else if (field.references.onDelete === 'set null') action = 'SetNull';
            else if (field.references.onDelete === 'set default') action = 'SetDefault';
            else if (field.references.onDelete === 'restrict') action = 'Restrict';

            // @relation(fields: [field], references: [referencedField], onDelete: action)
            const relationAttr: DataFieldAttribute = {
                $type: 'DataFieldAttribute',
                decl: {
                    $refText: '@relation',
                },
                args: [],
                $container: relationField,
            };

            // fields: [field]
            const fieldsArg: AttributeArg = {
                $type: 'AttributeArg',
                name: 'fields',
                $container: relationAttr,
            } as any;
            const fieldsExpr: ArrayExpr = {
                $type: 'ArrayExpr',
                items: [],
                $container: fieldsArg,
            };
            const fkRefExpr: ReferenceExpr = {
                $type: 'ReferenceExpr',
                args: [],
                $container: fieldsExpr,
                target: {
                    $refText: fieldName,
                },
            };
            fieldsExpr.items.push(fkRefExpr);
            fieldsArg.value = fieldsExpr;

            // references: [referencedField]
            const referencesArg: AttributeArg = {
                $type: 'AttributeArg',
                name: 'references',
                $container: relationAttr,
            } as any;
            const referencesExpr: ArrayExpr = {
                $type: 'ArrayExpr',
                items: [],
                $container: referencesArg,
            };
            const pkRefExpr: ReferenceExpr = {
                $type: 'ReferenceExpr',
                args: [],
                $container: referencesExpr,
                target: {
                    $refText: field.references.field,
                },
            };
            referencesExpr.items.push(pkRefExpr);
            referencesArg.value = referencesExpr;

            // onDelete: action
            const onDeleteArg: AttributeArg = {
                $type: 'AttributeArg',
                name: 'onDelete',
                $container: relationAttr,
            } as any;
            const onDeleteValueExpr: ReferenceExpr = {
                $type: 'ReferenceExpr',
                target: { $refText: action },
                args: [],
                $container: onDeleteArg,
            };
            onDeleteArg.value = onDeleteValueExpr;

            relationAttr.args.push(...[fieldsArg, referencesArg, onDeleteArg]);
            relationField.attributes.push(relationAttr);

            dataModel.fields.push(relationField);
        }
    }

    // add to-many relations
    if (toManyRelations.has(modelName)) {
        const relations = toManyRelations.get(modelName)!;
        for (const relatedModel of relations) {
            const relationName = `${lowerCaseFirst(relatedModel)}s`;
            if (!dataModel.fields.some((f) => f.name === relationName)) {
                const relationField: DataField = {
                    $type: 'DataField',
                    name: relationName,
                    attributes: [],
                    comments: [],
                    $container: dataModel,
                } as any;
                const relationType: DataFieldType = {
                    $type: 'DataFieldType',
                    reference: {
                        $refText: relatedModel,
                    },
                    array: true,
                    optional: false,
                    $container: relationField,
                };
                relationField.type = relationType;
                dataModel.fields.push(relationField);
            }
        }
    }

    return changed;
}

function addModelAttribute(dataModel: DataModel, name: string, args: Omit<AttributeArg, '$container'>[] = []) {
    const attr: DataModelAttribute = {
        $type: 'DataModelAttribute',
        decl: { $refText: name },
        $container: dataModel,
        args: [],
    };
    const finalArgs = args.map((arg) => ({
        ...arg,
        $container: attr,
    }));
    attr.args.push(...finalArgs);
    dataModel.attributes.push(attr);
}

function addFieldAttribute(dataField: DataField, name: string, args: Omit<AttributeArg, '$container'>[] = []) {
    const attr: DataFieldAttribute = {
        $type: 'DataFieldAttribute',
        decl: { $refText: name },
        $container: dataField,
        args: [],
    };
    const finalArgs = args.map((arg) => ({
        ...arg,
        $container: attr,
    }));
    attr.args.push(...finalArgs);
    dataField.attributes.push(attr);
}

function createBooleanAttributeArg(value: boolean) {
    const arg: AttributeArg = {
        $type: 'AttributeArg',
    } as any;
    const expr: BooleanLiteral = {
        $type: 'BooleanLiteral',
        value,
        $container: arg,
    };
    arg.value = expr;
    return arg;
}

function createNumberAttributeArg(value: number) {
    const arg: AttributeArg = {
        $type: 'AttributeArg',
    } as any;
    const expr: NumberLiteral = {
        $type: 'NumberLiteral',
        value: value.toString(),
        $container: arg,
    };
    arg.value = expr;
    return arg;
}

function createStringAttributeArg(value: string) {
    const arg: AttributeArg = {
        $type: 'AttributeArg',
    } as any;
    const expr: StringLiteral = {
        $type: 'StringLiteral',
        value,
        $container: arg,
    };
    arg.value = expr;
    return arg;
}
