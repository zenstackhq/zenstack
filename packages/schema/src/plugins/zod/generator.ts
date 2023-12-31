import { ConnectorType, DMMF } from '@prisma/generator-helper';
import {
    PluginGlobalOptions,
    PluginOptions,
    createProject,
    emitProject,
    getDataModels,
    getLiteral,
    getPrismaClientImportSpec,
    hasAttribute,
    isEnumFieldReference,
    isForeignKeyField,
    isFromStdlib,
    parseOptionAsStrings,
    resolvePath,
    saveProject,
} from '@zenstackhq/sdk';
import { DataModel, DataSource, EnumField, Model, isDataModel, isDataSource, isEnum } from '@zenstackhq/sdk/ast';
import { addMissingInputObjectTypes, resolveAggregateOperationSupport } from '@zenstackhq/sdk/dmmf-helpers';
import { promises as fs } from 'fs';
import { streamAllContents } from 'langium';
import path from 'path';
import { Project } from 'ts-morph';
import { upperCaseFirst } from 'upper-case-first';
import { name } from '.';
import { getDefaultOutputFolder } from '../plugin-utils';
import Transformer from './transformer';
import removeDir from './utils/removeDir';
import { makeFieldSchema, makeValidationRefinements, getFieldSchemaDefault } from './utils/schema-gen';

export async function generate(
    model: Model,
    options: PluginOptions,
    dmmf: DMMF.Document,
    globalOptions?: PluginGlobalOptions
) {
    let output = options.output as string;
    if (!output) {
        const defaultOutputFolder = getDefaultOutputFolder(globalOptions);
        if (defaultOutputFolder) {
            output = path.join(defaultOutputFolder, 'zod');
        } else {
            output = './generated/zod';
        }
    }
    output = resolvePath(output, options);
    await handleGeneratorOutputValue(output);

    // calculate the models to be excluded
    const excludeModels = getExcludedModels(model, options);

    const prismaClientDmmf = dmmf;

    const modelOperations = prismaClientDmmf.mappings.modelOperations.filter(
        (o) => !excludeModels.find((e) => e === o.model)
    );

    // TODO: better way of filtering than string startsWith?
    const inputObjectTypes = prismaClientDmmf.schema.inputObjectTypes.prisma.filter(
        (type) => !excludeModels.find((e) => type.name.toLowerCase().startsWith(e.toLocaleLowerCase()))
    );
    const outputObjectTypes = prismaClientDmmf.schema.outputObjectTypes.prisma.filter(
        (type) => !excludeModels.find((e) => type.name.toLowerCase().startsWith(e.toLowerCase()))
    );

    const models: DMMF.Model[] = prismaClientDmmf.datamodel.models.filter(
        (m) => !excludeModels.find((e) => e === m.name)
    );

    // whether Prisma's Unchecked* series of input types should be generated
    const generateUnchecked = options.noUncheckedInput !== true;

    const project = createProject();

    // common schemas
    await generateCommonSchemas(project, output);

    // enums
    await generateEnumSchemas(
        prismaClientDmmf.schema.enumTypes.prisma,
        prismaClientDmmf.schema.enumTypes.model ?? [],
        project,
        model
    );

    const dataSource = model.declarations.find((d): d is DataSource => isDataSource(d));

    const dataSourceProvider = getLiteral<string>(
        dataSource?.fields.find((f) => f.name === 'provider')?.value
    ) as ConnectorType;

    await generateModelSchemas(project, model, output, excludeModels);

    if (options.modelOnly !== true) {
        // detailed object schemas referenced from input schemas
        Transformer.provider = dataSourceProvider;
        addMissingInputObjectTypes(inputObjectTypes, outputObjectTypes, models);
        const aggregateOperationSupport = resolveAggregateOperationSupport(inputObjectTypes);
        await generateObjectSchemas(inputObjectTypes, project, output, model, generateUnchecked);

        // input schemas
        const transformer = new Transformer({
            models,
            modelOperations,
            aggregateOperationSupport,
            project,
            zmodel: model,
            inputObjectTypes,
        });
        await transformer.generateInputSchemas(generateUnchecked);
    }

    // create barrel file
    const exports = [`export * as models from './models'`, `export * as enums from './enums'`];
    if (options.modelOnly !== true) {
        exports.push(`export * as input from './input'`, `export * as objects from './objects'`);
    }
    project.createSourceFile(path.join(output, 'index.ts'), exports.join(';\n'), { overwrite: true });

    // emit
    let shouldCompile = true;
    if (typeof options.compile === 'boolean') {
        // explicit override
        shouldCompile = options.compile;
    } else if (globalOptions) {
        // from CLI or config file
        shouldCompile = globalOptions.compile;
    }

    if (!shouldCompile || options.preserveTsFiles === true) {
        // save ts files
        await saveProject(project);
    }
    if (shouldCompile) {
        await emitProject(project);
    }
}

function getExcludedModels(model: Model, options: PluginOptions) {
    // resolve "generateModels" option
    const generateModels = parseOptionAsStrings(options, 'generateModels', name);
    if (generateModels) {
        if (options.modelOnly === true) {
            // no model reference needs to be considered, directly exclude any model not included
            return model.declarations
                .filter((d) => isDataModel(d) && !generateModels.includes(d.name))
                .map((m) => m.name);
        } else {
            // calculate a transitive closure of models to be included
            const todo = getDataModels(model).filter((dm) => generateModels.includes(dm.name));
            const included = new Set<DataModel>();
            while (todo.length > 0) {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                const dm = todo.pop()!;
                included.add(dm);

                // add referenced models to the todo list
                dm.fields
                    .map((f) => f.type.reference?.ref)
                    .filter((type): type is DataModel => isDataModel(type))
                    .forEach((type) => {
                        if (!included.has(type)) {
                            todo.push(type);
                        }
                    });
            }

            // finally find the models to be excluded
            return getDataModels(model)
                .filter((dm) => !included.has(dm))
                .map((m) => m.name);
        }
    } else {
        return [];
    }
}

async function handleGeneratorOutputValue(output: string) {
    // create the output directory and delete contents that might exist from a previous run
    await fs.mkdir(output, { recursive: true });
    const isRemoveContentsOnly = true;
    await removeDir(output, isRemoveContentsOnly);

    Transformer.setOutputPath(output);
}

async function generateCommonSchemas(project: Project, output: string) {
    // Decimal
    project.createSourceFile(
        path.join(output, 'common', 'index.ts'),
        `
import { z } from 'zod';
export const DecimalSchema = z.union([z.number(), z.string(), z.object({d: z.number().array(), e: z.number(), s: z.number()}).passthrough()]);
`,
        { overwrite: true }
    );
}

async function generateEnumSchemas(
    prismaSchemaEnum: DMMF.SchemaEnum[],
    modelSchemaEnum: DMMF.SchemaEnum[],
    project: Project,
    zmodel: Model
) {
    const enumTypes = [...prismaSchemaEnum, ...modelSchemaEnum];
    const enumNames = enumTypes.map((enumItem) => upperCaseFirst(enumItem.name));
    Transformer.enumNames = enumNames ?? [];
    const transformer = new Transformer({
        enumTypes,
        project,
        zmodel,
        inputObjectTypes: [],
    });
    await transformer.generateEnumSchemas();
}

async function generateObjectSchemas(
    inputObjectTypes: DMMF.InputType[],
    project: Project,
    output: string,
    zmodel: Model,
    generateUnchecked: boolean
) {
    const moduleNames: string[] = [];
    for (let i = 0; i < inputObjectTypes.length; i += 1) {
        const fields = inputObjectTypes[i]?.fields;
        const name = inputObjectTypes[i]?.name;
        if (!generateUnchecked && name.includes('Unchecked')) {
            continue;
        }
        const transformer = new Transformer({ name, fields, project, zmodel, inputObjectTypes });
        const moduleName = transformer.generateObjectSchema(generateUnchecked);
        moduleNames.push(moduleName);
    }
    project.createSourceFile(
        path.join(output, 'objects/index.ts'),
        moduleNames.map((name) => `export * from './${name}';`).join('\n'),
        { overwrite: true }
    );
}

async function generateModelSchemas(project: Project, zmodel: Model, output: string, excludedModels: string[]) {
    const schemaNames: string[] = [];
    for (const dm of getDataModels(zmodel)) {
        if (!excludedModels.includes(dm.name)) {
            schemaNames.push(await generateModelSchema(dm, project, output));
        }
    }

    project.createSourceFile(
        path.join(output, 'models', 'index.ts'),
        schemaNames.map((name) => `export * from './${name}';`).join('\n'),
        { overwrite: true }
    );
}

async function generateModelSchema(model: DataModel, project: Project, output: string) {
    const schemaName = `${upperCaseFirst(model.name)}.schema`;
    const sf = project.createSourceFile(path.join(output, 'models', `${schemaName}.ts`), undefined, {
        overwrite: true,
    });
    sf.replaceWithText((writer) => {
        const scalarFields = model.fields.filter(
            (field) =>
                // regular fields only
                !isDataModel(field.type.reference?.ref) && !isForeignKeyField(field)
        );

        const relations = model.fields.filter((field) => isDataModel(field.type.reference?.ref));
        const fkFields = model.fields.filter((field) => isForeignKeyField(field));

        writer.writeLine('/* eslint-disable */');
        writer.writeLine(`import { z } from 'zod';`);

        // import user-defined enums from Prisma as they might be referenced in the expressions
        const importEnums = new Set<string>();
        for (const node of streamAllContents(model)) {
            if (isEnumFieldReference(node)) {
                const field = node.target.ref as EnumField;
                if (!isFromStdlib(field.$container)) {
                    importEnums.add(field.$container.name);
                }
            }
        }
        if (importEnums.size > 0) {
            const prismaImport = getPrismaClientImportSpec(model.$container, path.join(output, 'models'));
            writer.writeLine(`import { ${[...importEnums].join(', ')} } from '${prismaImport}';`);
        }

        // import enum schemas
        const importedEnumSchemas = new Set<string>();
        for (const field of scalarFields) {
            if (field.type.reference?.ref && isEnum(field.type.reference?.ref)) {
                const name = upperCaseFirst(field.type.reference?.ref.name);
                if (!importedEnumSchemas.has(name)) {
                    writer.writeLine(`import { ${name}Schema } from '../enums/${name}.schema';`);
                    importedEnumSchemas.add(name);
                }
            }
        }

        // import Decimal
        if (scalarFields.some((field) => field.type.type === 'Decimal')) {
            writer.writeLine(`import { DecimalSchema } from '../common';`);
            writer.writeLine(`import { Decimal } from 'decimal.js';`);
        }

        // base schema
        writer.write(`const baseSchema = z.object(`);
        writer.inlineBlock(() => {
            scalarFields.forEach((field) => {
                writer.writeLine(`${field.name}: ${makeFieldSchema(field, true)},`);
            });
        });
        writer.writeLine(');');

        // relation fields

        let relationSchema: string | undefined;
        let fkSchema: string | undefined;

        if (relations.length > 0 || fkFields.length > 0) {
            relationSchema = 'relationSchema';
            writer.write(`const ${relationSchema} = z.object(`);
            writer.inlineBlock(() => {
                [...relations, ...fkFields].forEach((field) => {
                    writer.writeLine(`${field.name}: ${makeFieldSchema(field)},`);
                });
            });
            writer.writeLine(');');
        }

        if (fkFields.length > 0) {
            fkSchema = 'fkSchema';
            writer.write(`const ${fkSchema} = z.object(`);
            writer.inlineBlock(() => {
                fkFields.forEach((field) => {
                    writer.writeLine(`${field.name}: ${makeFieldSchema(field)},`);
                });
            });
            writer.writeLine(');');
        }

        // compile "@@validate" to ".refine"
        const refinements = makeValidationRefinements(model);
        let refineFuncName: string | undefined;
        if (refinements.length > 0) {
            refineFuncName = `refine${upperCaseFirst(model.name)}`;
            writer.writeLine(
                `export function ${refineFuncName}<T, D extends z.ZodTypeDef>(schema: z.ZodType<T, D, T>) { return schema${refinements.join(
                    '\n'
                )}; }`
            );
        }

        ////////////////////////////////////////////////
        // 1. Model schema
        ////////////////////////////////////////////////
        const fieldsWithoutDefault = scalarFields.filter((f) => !getFieldSchemaDefault(f));
        // mark fields without default value as optional
        let modelSchema = makePartial(
            'baseSchema',
            fieldsWithoutDefault.length < scalarFields.length ? fieldsWithoutDefault.map((f) => f.name) : undefined
        );

        // omit fields
        const fieldsToOmit = scalarFields.filter((field) => hasAttribute(field, '@omit'));
        if (fieldsToOmit.length > 0) {
            modelSchema = makeOmit(
                modelSchema,
                fieldsToOmit.map((f) => f.name)
            );
        }

        if (relationSchema) {
            // export schema with only scalar fields
            const modelScalarSchema = `${upperCaseFirst(model.name)}ScalarSchema`;
            writer.writeLine(`export const ${modelScalarSchema} = ${modelSchema};`);
            modelSchema = modelScalarSchema;

            // merge relations
            modelSchema = makeMerge(modelSchema, makePartial(relationSchema));
        }

        // refine
        if (refineFuncName) {
            const noRefineSchema = `${upperCaseFirst(model.name)}WithoutRefineSchema`;
            writer.writeLine(`export const ${noRefineSchema} = ${modelSchema};`);
            modelSchema = `${refineFuncName}(${noRefineSchema})`;
        }
        writer.writeLine(`export const ${upperCaseFirst(model.name)}Schema = ${modelSchema};`);

        ////////////////////////////////////////////////
        // 2. Prisma create & update
        ////////////////////////////////////////////////

        // schema for validating prisma create input (all fields optional)
        let prismaCreateSchema = makePartial('baseSchema');
        if (refineFuncName) {
            prismaCreateSchema = `${refineFuncName}(${prismaCreateSchema})`;
        }
        writer.writeLine(`export const ${upperCaseFirst(model.name)}PrismaCreateSchema = ${prismaCreateSchema};`);

        // schema for validating prisma update input (all fields optional)
        // note numeric fields can be simple update or atomic operations
        let prismaUpdateSchema = `z.object({
            ${scalarFields
                .map((field) => {
                    let fieldSchema = makeFieldSchema(field);
                    if (field.type.type === 'Int' || field.type.type === 'Float') {
                        fieldSchema = `z.union([${fieldSchema}, z.record(z.unknown())])`;
                    }
                    return `\t${field.name}: ${fieldSchema}`;
                })
                .join(',\n')}
})`;
        prismaUpdateSchema = makePartial(prismaUpdateSchema);
        if (refineFuncName) {
            prismaUpdateSchema = `${refineFuncName}(${prismaUpdateSchema})`;
        }
        writer.writeLine(`export const ${upperCaseFirst(model.name)}PrismaUpdateSchema = ${prismaUpdateSchema};`);

        ////////////////////////////////////////////////
        // 3. Create schema
        ////////////////////////////////////////////////
        let createSchema = 'baseSchema';
        const fieldsWithDefault = scalarFields.filter(
            (field) => hasAttribute(field, '@default') || hasAttribute(field, '@updatedAt') || field.type.array
        );
        if (fieldsWithDefault.length > 0) {
            createSchema = makePartial(
                createSchema,
                fieldsWithDefault.map((f) => f.name)
            );
        }

        if (fkSchema) {
            // export schema with only scalar fields
            const createScalarSchema = `${upperCaseFirst(model.name)}CreateScalarSchema`;
            writer.writeLine(`export const ${createScalarSchema} = ${createSchema};`);

            // merge fk fields
            createSchema = makeMerge(createScalarSchema, fkSchema);
        }

        if (refineFuncName) {
            // export a schema without refinement for extensibility
            const noRefineSchema = `${upperCaseFirst(model.name)}CreateWithoutRefineSchema`;
            writer.writeLine(`export const ${noRefineSchema} = ${createSchema};`);
            createSchema = `${refineFuncName}(${noRefineSchema})`;
        }
        writer.writeLine(`export const ${upperCaseFirst(model.name)}CreateSchema = ${createSchema};`);

        ////////////////////////////////////////////////
        // 3. Update schema
        ////////////////////////////////////////////////
        let updateSchema = makePartial('baseSchema');

        if (fkSchema) {
            // export schema with only scalar fields
            const updateScalarSchema = `${upperCaseFirst(model.name)}UpdateScalarSchema`;
            writer.writeLine(`export const ${updateScalarSchema} = ${updateSchema};`);
            updateSchema = updateScalarSchema;

            // merge fk fields
            updateSchema = makeMerge(updateSchema, makePartial(fkSchema));
        }

        if (refineFuncName) {
            // export a schema without refinement for extensibility
            const noRefineSchema = `${upperCaseFirst(model.name)}UpdateWithoutRefineSchema`;
            writer.writeLine(`export const ${noRefineSchema} = ${updateSchema};`);
            updateSchema = `${refineFuncName}(${noRefineSchema})`;
        }
        writer.writeLine(`export const ${upperCaseFirst(model.name)}UpdateSchema = ${updateSchema};`);
    });

    return schemaName;
}

function makePartial(schema: string, fields?: string[]) {
    if (fields) {
        return `${schema}.partial({
        ${fields.map((f) => `${f}: true`).join(', ')},
    })`;
    } else {
        return `${schema}.partial()`;
    }
}

function makeOmit(schema: string, fields: string[]) {
    return `${schema}.omit({
        ${fields.map((f) => `${f}: true`).join(', ')},
    })`;
}

function makeMerge(schema1: string, schema2: string): string {
    return `${schema1}.merge(${schema2})`;
}
