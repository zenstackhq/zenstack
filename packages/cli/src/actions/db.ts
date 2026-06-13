import { formatDocument, ZModelCodeGenerator } from '@zenstackhq/language';
import { DataModel, Enum, isDataField, type DataField, type Model } from '@zenstackhq/language/ast';
import colors from 'colors';
import fs from 'node:fs';
import path from 'node:path';
import ora from 'ora';
import { execPrisma } from '../utils/exec-utils';
import {
    generateTempPrismaSchema,
    getSchemaFile,
    handleSubProcessError,
    loadSchemaDocument,
    requireDataSourceUrl,
} from './action-utils';
import { consolidateEnums, syncEnums, syncRelation, syncTable, type Relation } from './pull';
import { providers as pullProviders } from './pull/provider';
import { getDatasource, getDbName, getRelationFieldsKey, getRelationFkName, getRelationName, isDatabaseManagedAttribute } from './pull/utils';
import type { DataSourceProviderType } from '@zenstackhq/schema';
import { CliError } from '../cli-error';

type PushOptions = {
    schema?: string;
    acceptDataLoss?: boolean;
    forceReset?: boolean;
    randomPrismaSchemaName?: boolean;
};

export type PullOptions = {
    schema?: string;
    output?: string;
    modelCasing: 'pascal' | 'camel' | 'snake' | 'none';
    fieldCasing: 'pascal' | 'camel' | 'snake' | 'none';
    alwaysMap: boolean;
    quote: 'single' | 'double';
    indent: number;
};

function hasRelationFieldsArg(field: DataField) {
    const relationAttr = field.attributes.find((a) => a.decl.ref?.name === '@relation');
    return !!relationAttr?.args.some((a) => a.name === 'fields');
}

function getReferencedModelName(field: DataField) {
    return field.type.reference?.ref ? getDbName(field.type.reference.ref) : undefined;
}

function matchesRelationNameFallback(field: DataField, relationName: string, candidate: DataField) {
    const referencedModelName = getReferencedModelName(field);
    return (
        !!referencedModelName &&
        getRelationName(candidate) === relationName &&
        hasRelationFieldsArg(candidate) === hasRelationFieldsArg(field) &&
        getReferencedModelName(candidate) === referencedModelName
    );
}

/**
 * CLI action for db related commands
 */
export async function run(command: string, options: any) {
    switch (command) {
        case 'push':
            await runPush(options);
            break;
        case 'pull':
            await runPull(options);
            break;
    }
}

async function runPush(options: PushOptions) {
    const schemaFile = getSchemaFile(options.schema);

    // validate datasource url exists
    await requireDataSourceUrl(schemaFile);

    // generate a temp prisma schema file
    const prismaSchemaFile = await generateTempPrismaSchema(schemaFile, {
        randomName: options.randomPrismaSchemaName,
    });

    try {
        // run prisma db push
        const cmd = [
            'db push',
            ` --schema "${prismaSchemaFile}"`,
            options.acceptDataLoss ? ' --accept-data-loss' : '',
            options.forceReset ? ' --force-reset' : '',
            ' --skip-generate',
        ].join('');

        try {
            execPrisma(cmd);
        } catch (err) {
            handleSubProcessError(err);
        }
    } finally {
        if (fs.existsSync(prismaSchemaFile)) {
            fs.unlinkSync(prismaSchemaFile);
        }
    }
}

async function runPull(options: PullOptions) {
    const spinner = ora();
    try {
        const schemaFile = getSchemaFile(options.schema);

        // Determine early if `--out` is a single file output (combined schema) or a directory export.
        const outPath = options.output ? path.resolve(options.output) : undefined;
        const treatAsFile =
            !!outPath &&
            ((fs.existsSync(outPath) && fs.lstatSync(outPath).isFile()) || path.extname(outPath) !== '');

        const { model, services } = await loadSchemaDocument(schemaFile, {
            returnServices: true,
            mergeImports: treatAsFile,
        });

        const SUPPORTED_PROVIDERS = Object.keys(pullProviders) as DataSourceProviderType[];
        const datasource = getDatasource(model);

        if (!SUPPORTED_PROVIDERS.includes(datasource.provider)) {
            throw new CliError(`Unsupported datasource provider: ${datasource.provider}`);
        }

        const provider = pullProviders[datasource.provider];

        if (!provider) {
            throw new CliError(`No introspection provider found for: ${datasource.provider}`);
        }

        spinner.start('Introspecting database...');
        const { enums, tables } = await provider.introspect(datasource.url, { schemas: datasource.allSchemas, modelCasing: options.modelCasing });
        spinner.succeed('Database introspected');

        console.log(colors.blue('Syncing schema...'));

        const newModel: Model = {
            $type: 'Model',
            $container: undefined,
            $containerProperty: undefined,
            $containerIndex: undefined,
            declarations: [...model.declarations.filter((d) => ['DataSource'].includes(d.$type))],
            imports: model.imports,
        };

        syncEnums({
            dbEnums: enums,
            model: newModel,
            services,
            options,
            defaultSchema: datasource.defaultSchema,
            oldModel: model,
            provider,
        });

        const resolvedRelations: Relation[] = [];
        for (const table of tables) {
            const relations = syncTable({
                table,
                model: newModel,
                provider,
                services,
                options,
                defaultSchema: datasource.defaultSchema,
                oldModel: model,
            });
            resolvedRelations.push(...relations);
        }
        // sync relation fields
        for (const relation of resolvedRelations) {
            const similarRelations = resolvedRelations.filter((rr) => {
                return (
                    rr !== relation &&
                    ((rr.schema === relation.schema &&
                        rr.table === relation.table &&
                        rr.references.schema === relation.references.schema &&
                        rr.references.table === relation.references.table) ||
                        (rr.schema === relation.references.schema &&
                            rr.columns[0] === relation.references.columns[0] &&
                            rr.references.schema === relation.schema &&
                            rr.references.table === relation.table))
                );
            }).length;
            const selfRelation =
                relation.references.schema === relation.schema && relation.references.table === relation.table;
            syncRelation({
                model: newModel,
                relation,
                services,
                options,
                selfRelation,
                similarRelations: similarRelations,
            });
        }

        // Consolidate per-column enums (e.g., MySQL's synthetic UserStatus/GroupStatus)
        // back to shared enums from the original schema (e.g., Status)
        consolidateEnums({ newModel, oldModel: model });

        console.log(colors.blue('Schema synced'));

        const baseDir = path.dirname(path.resolve(schemaFile));
        const baseDirUrlPath = new URL(`file://${baseDir}`).pathname;
        const docs = services.shared.workspace.LangiumDocuments.all
            .filter(({ uri }) => uri.path.toLowerCase().startsWith(baseDirUrlPath.toLowerCase()))
            .toArray();
        const docsSet = new Set(docs.map((d) => d.uri.toString()));

        console.log(colors.bold('\nApplying changes to ZModel...'));

        const deletedModels: string[] = [];
        const deletedEnums: string[] = [];
        const addedModels: string[] = [];
        const addedEnums: string[] = [];
        // Hierarchical change tracking: model -> field changes -> attribute changes
        type ModelChanges = {
            addedFields: string[];
            deletedFields: string[];
            updatedFields: string[];
            addedAttributes: string[];
            deletedAttributes: string[];
            updatedAttributes: string[];
        };
        const modelChanges = new Map<string, ModelChanges>();

        const getModelChanges = (modelName: string): ModelChanges => {
            if (!modelChanges.has(modelName)) {
                modelChanges.set(modelName, {
                    addedFields: [],
                    deletedFields: [],
                    updatedFields: [],
                    addedAttributes: [],
                    deletedAttributes: [],
                    updatedAttributes: [],
                });
            }
            return modelChanges.get(modelName)!;
        };

        // Delete models
        services.shared.workspace.IndexManager.allElements('DataModel', docsSet)
            .filter(
                (declaration) =>
                    !newModel.declarations.find((d) => getDbName(d) === getDbName(declaration.node as any)),
            )
            .forEach((decl) => {
                const model = decl.node!.$container as Model;
                const index = model.declarations.findIndex((d) => d === decl.node);
                model.declarations.splice(index, 1);
                deletedModels.push(colors.red(`- Model ${decl.name} deleted`));
            });

        // Delete Enums
        if (provider.isSupportedFeature('NativeEnum'))
            services.shared.workspace.IndexManager.allElements('Enum', docsSet)
                .filter(
                    (declaration) =>
                        !newModel.declarations.find((d) => getDbName(d) === getDbName(declaration.node as any)),
                )
                .forEach((decl) => {
                    const model = decl.node!.$container as Model;
                    const index = model.declarations.findIndex((d) => d === decl.node);
                    model.declarations.splice(index, 1);
                    deletedEnums.push(colors.red(`- Enum ${decl.name} deleted`));
                });
        // Add/update models and their fields
        newModel.declarations
            .filter((d) => d.$type === DataModel.$type || d.$type === Enum.$type)
            .forEach((_declaration) => {
                const newDataModel = _declaration as DataModel | Enum;
                const declarations = services.shared.workspace.IndexManager.allElements(newDataModel.$type, docsSet).toArray();
                const originalDataModel = declarations.find((d) => getDbName(d.node as any) === getDbName(newDataModel))
                    ?.node as DataModel | Enum | undefined;
                if (!originalDataModel) {

                    if (newDataModel.$type === 'DataModel') {
                        addedModels.push(colors.green(`+ Model ${newDataModel.name} added`));
                    } else if (newDataModel.$type === 'Enum') {
                        addedEnums.push(colors.green(`+ Enum ${newDataModel.name} added`));
                    }

                    model.declarations.push(newDataModel);
                    (newDataModel as any).$container = model;
                    newDataModel.fields.forEach((f) => {
                        if (f.$type === 'DataField' && f.type.reference?.ref) {
                            const ref = declarations.find(
                                (d) => getDbName(d.node as any) === getDbName(f.type.reference!.ref as any),
                            )?.node;
                            if (ref && f.type.reference) {
                                // Replace the entire reference object — Langium References
                                // from parsed documents expose `ref` as a getter-only property.
                                (f.type as any).reference = {
                                    ref,
                                    $refText: (ref as any).name ?? (f.type.reference as any).$refText,
                                };
                            }
                        }
                    });
                    return;
                }

                newDataModel.fields.forEach((f) => {
                    // Prioritized matching: exact db name > relation fields key > relation FK name > relation name > type reference
                    let originalFields = originalDataModel.fields.filter((d) => getDbName(d) === getDbName(f));

                    if (originalFields.length === 0) {
                        // Try matching by relation fields key (the `fields` attribute in @relation)
                        // This matches relation fields by their FK field references
                        const newFieldsKey = isDataField(f) ? getRelationFieldsKey(f) : undefined;
                        if (newFieldsKey) {
                            originalFields = originalDataModel.fields.filter(
                                (d) => isDataField(d) && getRelationFieldsKey(d) === newFieldsKey,
                            );
                        }
                    }

                    if (originalFields.length === 0) {
                        // Try matching by relation FK name (the `map` attribute in @relation)
                        const newFkName = isDataField(f) ? getRelationFkName(f) : undefined;
                        if (newFkName) {
                            originalFields = originalDataModel.fields.filter(
                                (d) => isDataField(d) && getRelationFkName(d) === newFkName,
                            );
                        }
                    }

                    if (originalFields.length === 0) {
                        // Try matching by relation name (the `name` arg in @relation)
                        // This is essential for back-reference fields that only have a relation name
                        const newRelName = isDataField(f) ? getRelationName(f) : undefined;
                        if (newRelName) {
                            originalFields = originalDataModel.fields.filter(
                                (d) =>
                                    isDataField(d) &&
                                    isDataField(f) &&
                                    matchesRelationNameFallback(f, newRelName, d),
                            );
                        }
                    }

                    if (originalFields.length === 0) {
                        // Try matching by type reference
                        // We need this because for relations that don't have @relation, we can only check if the original exists by the field type.
                        // Yes, in this case it can potentially result in multiple original fields, but we only want to ensure that at least one relation exists.
                        originalFields = originalDataModel.fields.filter(
                            (d) =>
                                isDataField(f) &&
                                isDataField(d) &&
                                f.type.reference?.ref &&
                                d.type.reference?.ref &&
                                getDbName(f.type.reference.ref) === getDbName(d.type.reference.ref),
                        );
                    }

                    if (originalFields.length > 1) {
                        // If this is a back-reference relation field (no `fields` attribute),
                        // silently skip when there are multiple potential matches
                        const isBackReferenceField = isDataField(f) && !getRelationFieldsKey(f);
                        if (!isBackReferenceField) {
                            console.warn(
                                colors.yellow(
                                    `Found more original fields, need to tweak the search algorithm. ${originalDataModel.name}->[${originalFields.map((of) => of.name).join(', ')}](${f.name})`,
                                ),
                            );
                        }
                        return;
                    }
                    const originalField = originalFields.at(0);

                    // Update existing field if type, optionality, or array flag changed
                    if (originalField && f.$type === 'DataField' && originalField.$type === 'DataField') {
                        const newType = f.type;
                        const oldType = originalField.type;
                        const fieldUpdates: string[] = [];

                        // Check and update builtin type (e.g., String -> Int)
                        // Skip if old type is an Enum reference and provider doesn't support native enums
                        const isOldTypeEnumWithoutNativeSupport =
                            oldType.reference?.ref?.$type === 'Enum' && !provider.isSupportedFeature('NativeEnum');
                        if (newType.type && oldType.type !== newType.type && !isOldTypeEnumWithoutNativeSupport) {
                            fieldUpdates.push(`type: ${oldType.type} -> ${newType.type}`);
                            (oldType as any).type = newType.type;
                        }

                        // Check and update type reference (e.g., User -> Profile)
                        if (newType.reference?.ref && oldType.reference?.ref) {
                            const newRefName = getDbName(newType.reference.ref);
                            const oldRefName = getDbName(oldType.reference.ref);
                            if (newRefName !== oldRefName) {
                                fieldUpdates.push(`reference: ${oldType.reference.$refText} -> ${newType.reference.$refText}`);
                                // Replace the entire reference object — Langium References
                                // from parsed documents expose `ref` as a getter-only property.
                                (oldType as any).reference = {
                                    ref: newType.reference.ref,
                                    $refText: newType.reference.$refText,
                                };
                            }
                        } else if (newType.reference?.ref && !oldType.reference) {
                            // Changed from builtin to reference type
                            fieldUpdates.push(`type: ${oldType.type} -> ${newType.reference.$refText}`);
                            (oldType as any).reference = newType.reference;
                            (oldType as any).type = undefined;
                        } else if (!newType.reference && oldType.reference?.ref && newType.type) {
                            // Changed from reference to builtin type
                            // Skip if old type is an Enum and provider doesn't support native enums (e.g., SQLite stores enums as strings)
                            const isEnumWithoutNativeSupport =
                                oldType.reference.ref.$type === 'Enum' && !provider.isSupportedFeature('NativeEnum');
                            if (!isEnumWithoutNativeSupport) {
                                fieldUpdates.push(`type: ${oldType.reference.$refText} -> ${newType.type}`);
                                (oldType as any).type = newType.type;
                                (oldType as any).reference = undefined;
                            }
                        }

                        // Check and update optionality (e.g., String -> String?)
                        if (!!newType.optional !== !!oldType.optional) {
                            fieldUpdates.push(`optional: ${!!oldType.optional} -> ${!!newType.optional}`);
                            (oldType as any).optional = newType.optional;
                        }

                        // Check and update array flag (e.g., String -> String[])
                        if (!!newType.array !== !!oldType.array) {
                            fieldUpdates.push(`array: ${!!oldType.array} -> ${!!newType.array}`);
                            (oldType as any).array = newType.array;
                        }

                        if (fieldUpdates.length > 0) {
                            getModelChanges(originalDataModel.name).updatedFields.push(
                                colors.yellow(`~ ${originalField.name} (${fieldUpdates.join(', ')})`),
                            );
                        }

                        // Update @default attribute arguments if changed
                        const newDefaultAttr = f.attributes.find((a) => a.decl.$refText === '@default');
                        const oldDefaultAttr = originalField.attributes.find((a) => a.decl.$refText === '@default');
                        if (newDefaultAttr && oldDefaultAttr) {
                            // Compare attribute arguments by serializing them (avoid circular refs with $type fallback)
                            const serializeArgs = (args: any[]) =>
                                args.map((arg) => {
                                    if (arg.value?.$type === 'StringLiteral') return `"${arg.value.value}"`;
                                    if (arg.value?.$type === 'NumberLiteral') return String(arg.value.value);
                                    if (arg.value?.$type === 'BooleanLiteral') return String(arg.value.value);
                                    if (arg.value?.$type === 'InvocationExpr') return arg.value.function?.$refText ?? '';
                                    if (arg.value?.$type === 'ReferenceExpr') return arg.value.target?.$refText ?? '';
                                    if (arg.value?.$type === 'ArrayExpr') {
                                        return `[${(arg.value.items ?? []).map((item: any) => {
                                            if (item.$type === 'ReferenceExpr') return item.target?.$refText ?? '';
                                            return item.$type ?? 'unknown';
                                        }).join(',')}]`;
                                    }
                                    // Fallback: use $type to avoid circular reference issues
                                    return arg.value?.$type ?? 'unknown';
                                }).join(',');

                            const newArgsStr = serializeArgs(newDefaultAttr.args ?? []);
                            const oldArgsStr = serializeArgs(oldDefaultAttr.args ?? []);

                            if (newArgsStr !== oldArgsStr) {
                                // Replace old @default arguments with new ones
                                (oldDefaultAttr as any).args = newDefaultAttr.args.map((arg) => ({
                                    ...arg,
                                    $container: oldDefaultAttr,
                                }));
                                getModelChanges(originalDataModel.name).updatedAttributes.push(
                                    colors.yellow(`~ @default on ${originalDataModel.name}.${originalField.name}`),
                                );
                            }
                        }
                    }

                    if (!originalField) {
                        getModelChanges(originalDataModel.name).addedFields.push(colors.green(`+ ${f.name}`));
                        (f as any).$container = originalDataModel;
                        originalDataModel.fields.push(f as any);
                        if (f.$type === 'DataField' && f.type.reference?.ref) {
                            const ref = declarations.find(
                                (d) => getDbName(d.node as any) === getDbName(f.type.reference!.ref as any),
                            )?.node as DataModel | undefined;
                            if (ref) {
                                // Replace the entire reference object — Langium References
                                // from parsed documents expose `ref` as a getter-only property.
                                (f.type as any).reference = {
                                    ref,
                                    $refText: ref.name ?? (f.type.reference as any).$refText,
                                };
                            }
                        }
                        return;
                    }

                    // Track deleted attributes (in original but not in new)
                    originalField.attributes
                        .filter(
                            (attr) =>
                                !f.attributes.find((d) => d.decl.$refText === attr.decl.$refText) && 
                                isDatabaseManagedAttribute(attr.decl.$refText),
                        )
                        .forEach((attr) => {
                            const field = attr.$container;
                            const index = field.attributes.findIndex((d) => d === attr);
                            field.attributes.splice(index, 1);
                            getModelChanges(originalDataModel.name).deletedAttributes.push(
                                colors.yellow(`- ${attr.decl.$refText} from field: ${originalDataModel.name}.${field.name}`),
                            );
                        });

                    // Track added attributes (in new but not in original)
                    f.attributes
                        .filter(
                            (attr) =>
                                !originalField.attributes.find((d) => d.decl.$refText === attr.decl.$refText) &&
                                isDatabaseManagedAttribute(attr.decl.$refText),
                        )
                        .forEach((attr) => {
                          // attach the new attribute to the original field
                            const cloned = { ...attr, $container: originalField } as typeof attr;
                            originalField.attributes.push(cloned);
                            getModelChanges(originalDataModel.name).addedAttributes.push(
                                colors.green(`+ ${attr.decl.$refText} to field: ${originalDataModel.name}.${f.name}`),
                            );
                        });
                });
                originalDataModel.fields
                    .filter((f) => {
                        // Prioritized matching: exact db name > relation fields key > relation FK name > relation name > type reference
                        const matchByDbName = newDataModel.fields.find((d) => getDbName(d) === getDbName(f));
                        if (matchByDbName) return false;

                        // Try matching by relation fields key (the `fields` attribute in @relation)
                        const originalFieldsKey = isDataField(f) ? getRelationFieldsKey(f) : undefined;
                        if (originalFieldsKey) {
                            const matchByFieldsKey = newDataModel.fields.find(
                                (d) => isDataField(d) && getRelationFieldsKey(d) === originalFieldsKey,
                            );
                            if (matchByFieldsKey) return false;
                        }

                        const originalFkName = isDataField(f) ? getRelationFkName(f) : undefined;
                        if (originalFkName) {
                            const matchByFkName = newDataModel.fields.find(
                                (d) => isDataField(d) && getRelationFkName(d) === originalFkName,
                            );
                            if (matchByFkName) return false;
                        }

                        // Try matching by relation name (for named back-reference fields)
                        const originalRelName = isDataField(f) ? getRelationName(f) : undefined;
                        if (originalRelName) {
                            const matchByRelName = newDataModel.fields.find(
                                (d) =>
                                    isDataField(d) &&
                                    isDataField(f) &&
                                    matchesRelationNameFallback(f, originalRelName, d),
                            );
                            if (matchByRelName) return false;
                        }

                        const matchByTypeRef = newDataModel.fields.find(
                            (d) =>
                                isDataField(f) &&
                                isDataField(d) &&
                                f.type.reference?.ref &&
                                d.type.reference?.ref &&
                                getDbName(f.type.reference.ref) === getDbName(d.type.reference.ref),
                        );
                        return !matchByTypeRef;
                    })
                    .forEach((f) => {
                        const _model = f.$container;
                        const index = _model.fields.findIndex((d) => d === f);
                        _model.fields.splice(index, 1);
                        getModelChanges(_model.name).deletedFields.push(colors.red(`- ${f.name}`));
                    });
            });

        if (deletedModels.length > 0) {
            console.log(colors.bold('\nDeleted Models:'));
            deletedModels.forEach((msg) => {
                console.log(msg);
            });
        }

        if (deletedEnums.length > 0) {
            console.log(colors.bold('\nDeleted Enums:'));
            deletedEnums.forEach((msg) => {
                console.log(msg);
            });
        }

        if (addedModels.length > 0) {
            console.log(colors.bold('\nAdded Models:'));
            addedModels.forEach((msg) => {
                console.log(msg);
            });
        }

        if (addedEnums.length > 0) {
            console.log(colors.bold('\nAdded Enums:'));
            addedEnums.forEach((msg) => {
                console.log(msg);
            });
        }

        // Print hierarchical model changes
        if (modelChanges.size > 0) {
            console.log(colors.bold('\nModel Changes:'));
            modelChanges.forEach((changes, modelName) => {
                const hasChanges =
                    changes.addedFields.length > 0 ||
                    changes.deletedFields.length > 0 ||
                    changes.updatedFields.length > 0 ||
                    changes.addedAttributes.length > 0 ||
                    changes.deletedAttributes.length > 0 ||
                    changes.updatedAttributes.length > 0;

                if (hasChanges) {
                    console.log(colors.cyan(`  ${modelName}:`));

                    if (changes.addedFields.length > 0) {
                        console.log(colors.gray('    Added Fields:'));
                        changes.addedFields.forEach((msg) => {
                            console.log(`      ${msg}`);
                        });
                    }

                    if (changes.deletedFields.length > 0) {
                        console.log(colors.gray('    Deleted Fields:'));
                        changes.deletedFields.forEach((msg) => {
                            console.log(`      ${msg}`);
                        });
                    }

                    if (changes.updatedFields.length > 0) {
                        console.log(colors.gray('    Updated Fields:'));
                        changes.updatedFields.forEach((msg) => {
                            console.log(`      ${msg}`);
                        });
                    }

                    if (changes.addedAttributes.length > 0) {
                        console.log(colors.gray('    Added Attributes:'));
                        changes.addedAttributes.forEach((msg) => {
                            console.log(`      ${msg}`);
                        });
                    }

                    if (changes.deletedAttributes.length > 0) {
                        console.log(colors.gray('    Deleted Attributes:'));
                        changes.deletedAttributes.forEach((msg) => {
                            console.log(`      ${msg}`);
                        });
                    }

                    if (changes.updatedAttributes.length > 0) {
                        console.log(colors.gray('    Updated Attributes:'));
                        changes.updatedAttributes.forEach((msg) => {
                            console.log(`      ${msg}`);
                        });
                    }
                }
            });
        }

        const generator = new ZModelCodeGenerator({
            quote: options.quote ?? 'single',
            indent: options.indent ?? 4,
        });

        if (options.output) {
            if (treatAsFile) {
                const zmodelSchema = await formatDocument(generator.generate(newModel));
                console.log(colors.blue(`Writing to ${outPath}`));
                fs.mkdirSync(path.dirname(outPath), { recursive: true });
                fs.writeFileSync(outPath, zmodelSchema);
            } else {
                // Otherwise treat `--out` as a directory path. Create it if needed.
                fs.mkdirSync(outPath!, { recursive: true });

                // Preserve the directory structure relative to the schema file location (options.schema base).
                const baseDir = path.dirname(path.resolve(schemaFile));

                for (const {
                    uri,
                    parseResult: { value: documentModel },
                } of docs) {
                    const zmodelSchema = await formatDocument(generator.generate(documentModel));

                    // Map input file path -> output file path under `--out`
                    const relPath = path.relative(baseDir, uri.fsPath);
                    const targetFile = path.join(outPath!, relPath);

                    fs.mkdirSync(path.dirname(targetFile), { recursive: true });
                    console.log(colors.blue(`Writing to ${targetFile}`));
                    fs.writeFileSync(targetFile, zmodelSchema);
                }
            }
        } else {
            for (const {
                uri,
                parseResult: { value: documentModel },
            } of docs) {
                const zmodelSchema = await formatDocument(generator.generate(documentModel));
                console.log(colors.blue(`Writing to ${path.relative(process.cwd(), uri.fsPath).replace(/\\/g, '/')}`));
                fs.writeFileSync(uri.fsPath, zmodelSchema);
            }
        }

        console.log(colors.green.bold('\nPull completed successfully!'));
    } catch (error) {
        spinner.fail('Pull failed');
        console.error(error);
        throw error;
    }
}
