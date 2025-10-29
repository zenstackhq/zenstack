/* eslint-disable @typescript-eslint/ban-ts-comment */
import { DELEGATE_AUX_RELATION_PREFIX } from '@zenstackhq/runtime';
import { upperCaseFirst } from '@zenstackhq/runtime/local-helpers';
import {
    getForeignKeyFields,
    getRelationBackLink,
    hasAttribute,
    indentString,
    isDelegateModel,
    isDiscriminatorField,
    type PluginOptions,
} from '@zenstackhq/sdk';
import { DataModel, DataModelField, Enum, isDataModel, isEnum, isTypeDef, type Model } from '@zenstackhq/sdk/ast';
import { checkModelHasModelRelation, findModelByName, isAggregateInputType } from '@zenstackhq/sdk/dmmf-helpers';
import { supportCreateMany, type DMMF as PrismaDMMF } from '@zenstackhq/sdk/prisma';
import path from 'path';
import type { Project, SourceFile } from 'ts-morph';
import { computePrismaClientImport } from './generator';
import { AggregateOperationSupport, ObjectMode, TransformerParams } from './types';

export default class Transformer {
    name: string;
    originalName: string;
    fields: readonly PrismaDMMF.SchemaArg[];
    schemaImports = new Set<string>();
    models: readonly PrismaDMMF.Model[];
    modelOperations: PrismaDMMF.ModelMapping[];
    aggregateOperationSupport: AggregateOperationSupport;
    enumTypes: readonly PrismaDMMF.SchemaEnum[];

    static enumNames: string[] = [];
    static rawOpsMap: { [name: string]: string } = {};
    private static outputPath = './generated';
    private hasJson = false;
    private hasDecimal = false;
    private project: Project;
    private inputObjectTypes: PrismaDMMF.InputType[];
    public sourceFiles: SourceFile[] = [];
    private zmodel: Model;
    private mode: ObjectMode;
    private zodVersion: 'v3' | 'v4';

    constructor(params: TransformerParams) {
        this.originalName = params.name ?? '';
        this.name = params.name ? upperCaseFirst(params.name) : '';
        this.fields = params.fields ?? [];
        this.models = params.models ?? [];
        this.modelOperations = params.modelOperations ?? [];
        this.aggregateOperationSupport = params.aggregateOperationSupport ?? {};
        this.enumTypes = params.enumTypes ?? [];
        this.project = params.project;
        this.inputObjectTypes = params.inputObjectTypes;
        this.zmodel = params.zmodel;
        this.mode = params.mode;
        this.zodVersion = params.zodVersion;
    }

    static setOutputPath(outPath: string) {
        this.outputPath = outPath;
    }

    static getOutputPath() {
        return this.outputPath;
    }

    async generateEnumSchemas() {
        const generated: string[] = [];

        // generate for enums in DMMF
        for (const enumType of this.enumTypes) {
            const name = upperCaseFirst(enumType.name);
            const filePath = path.join(Transformer.outputPath, `enums/${name}.schema.ts`);
            const content = `${this.generateImportZodStatement()}\n${this.generateExportSchemaStatement(
                `${name}`,
                `z.enum(${JSON.stringify(
                    enumType.values
                        // exclude fields generated for delegate models
                        .filter((v) => !v.startsWith(DELEGATE_AUX_RELATION_PREFIX))
                )})`
            )}`;
            this.sourceFiles.push(this.project.createSourceFile(filePath, content, { overwrite: true }));
            generated.push(enumType.name);
        }

        // enums not referenced by data models are not in DMMF, deal with them separately
        const extraEnums = this.zmodel.declarations.filter((d): d is Enum => isEnum(d) && !generated.includes(d.name));
        for (const enumDecl of extraEnums) {
            const name = upperCaseFirst(enumDecl.name);
            const filePath = path.join(Transformer.outputPath, `enums/${name}.schema.ts`);
            const content = `${this.generateImportZodStatement()}\n${this.generateExportSchemaStatement(
                `${name}`,
                `z.enum(${JSON.stringify(enumDecl.fields.map((f) => f.name))})`
            )}`;
            this.sourceFiles.push(this.project.createSourceFile(filePath, content, { overwrite: true }));
            generated.push(enumDecl.name);
        }

        this.sourceFiles.push(
            this.project.createSourceFile(
                path.join(Transformer.outputPath, `enums/index.ts`),
                generated.map((name) => `export * from './${upperCaseFirst(name)}.schema';`).join('\n'),
                { overwrite: true }
            )
        );
    }

    generateImportZodStatement() {
        let r = `import { z } from 'zod/${this.zodVersion}';\n`;
        if (this.mode === 'strip') {
            // import the additional `smartUnion` helper
            r += `import { smartUnion } from '@zenstackhq/runtime/zod-utils';\n`;
        }
        return r;
    }

    generateExportSchemaStatement(name: string, schema: string) {
        return `export const ${name}Schema = ${schema}`;
    }

    generateObjectSchema(generateUnchecked: boolean, options: PluginOptions) {
        const { schemaFields, extraImports } = this.generateObjectSchemaFields(generateUnchecked);
        const objectSchema = this.prepareObjectSchema(schemaFields, options);

        const filePath = path.join(Transformer.outputPath, `objects/${this.name}.schema.ts`);
        const content = extraImports.join('\n\n') + objectSchema;
        this.sourceFiles.push(this.project.createSourceFile(filePath, content, { overwrite: true }));
        return `${this.name}.schema`;
    }

    private createUpdateInputRegex = /(\S+?)(Unchecked)?(Create|Update|CreateMany|UpdateMany).*Input/;

    generateObjectSchemaFields(generateUnchecked: boolean) {
        let fields = this.fields;
        let contextDataModel: DataModel | undefined;
        const extraImports: string[] = [];

        // exclude discriminator fields from create/update input schemas
        const createUpdateMatch = this.createUpdateInputRegex.exec(this.name);
        if (createUpdateMatch) {
            const modelName = createUpdateMatch[1];
            contextDataModel = this.zmodel.declarations.find(
                (d): d is DataModel => isDataModel(d) && d.name === modelName
            );

            if (contextDataModel) {
                // exclude discriminator fields from create/update input schemas
                const discriminatorFields = contextDataModel.fields.filter(isDiscriminatorField);
                if (discriminatorFields.length > 0) {
                    fields = fields.filter((field) => {
                        return !discriminatorFields.some(
                            (discriminatorField) => discriminatorField.name === field.name
                        );
                    });
                }

                // import type-def's schemas
                const typeDefFields = contextDataModel.fields.filter((f) => isTypeDef(f.type.reference?.ref));
                typeDefFields.forEach((field) => {
                    const typeName = upperCaseFirst(field.type.reference!.$refText);
                    const importLine = `import { ${typeName}Schema } from '../models/${typeName}.schema';`;
                    if (!extraImports.includes(importLine)) {
                        extraImports.push(importLine);
                    }
                });
            }
        }

        const zodObjectSchemaFields = fields
            .map((field) =>
                this.generateObjectSchemaField(field, contextDataModel, generateUnchecked, !!createUpdateMatch)
            )
            .flatMap((item) => item)
            .map((item) => {
                const [zodStringWithMainType, field, skipValidators] = item;

                const value = skipValidators
                    ? zodStringWithMainType
                    : this.generateFieldValidators(zodStringWithMainType, field);

                return value.trim();
            });
        return { schemaFields: zodObjectSchemaFields, extraImports };
    }

    generateObjectSchemaField(
        field: PrismaDMMF.SchemaArg,
        contextDataModel: DataModel | undefined,
        generateUnchecked: boolean,
        replaceJsonWithTypeDef = false
    ): [string, PrismaDMMF.SchemaArg, boolean][] {
        const lines = field.inputTypes;

        if (lines.length === 0) {
            return [];
        }

        let alternatives: string[] | undefined = undefined;

        if (replaceJsonWithTypeDef) {
            const dmField = contextDataModel?.fields.find((f) => f.name === field.name);
            if (isTypeDef(dmField?.type.reference?.ref)) {
                const isList = dmField.type.array;
                const lazyStr = `z.lazy(() => ${upperCaseFirst(dmField.type.reference!.$refText)}Schema)`;
                alternatives = [isList ? `${lazyStr}.array()` : lazyStr];
            }
        }

        if (!alternatives) {
            alternatives = lines.reduce<string[]>((result, inputType) => {
                if (!generateUnchecked && typeof inputType.type === 'string' && inputType.type.includes('Unchecked')) {
                    return result;
                }

                if (inputType.type.includes('CreateMany') && !supportCreateMany(this.zmodel)) {
                    return result;
                }

                // TODO: unify the following with `schema-gen.ts`

                if (inputType.type === 'String') {
                    result.push(this.wrapWithZodValidators('z.string()', field, inputType));
                } else if (inputType.type === 'Int' || inputType.type === 'Float') {
                    result.push(this.wrapWithZodValidators('z.number()', field, inputType));
                } else if (inputType.type === 'Decimal') {
                    this.hasDecimal = true;
                    result.push(this.wrapWithZodValidators('DecimalSchema', field, inputType));
                } else if (inputType.type === 'BigInt') {
                    result.push(this.wrapWithZodValidators('z.bigint()', field, inputType));
                } else if (inputType.type === 'Boolean') {
                    result.push(this.wrapWithZodValidators('z.boolean()', field, inputType));
                } else if (inputType.type === 'DateTime') {
                    result.push(this.wrapWithZodValidators(['z.date()', 'z.string().datetime()'], field, inputType));
                } else if (inputType.type === 'Bytes') {
                    result.push(
                        this.wrapWithZodValidators(
                            `z.custom<Buffer | Uint8Array>(data => data instanceof Uint8Array)`,
                            field,
                            inputType
                        )
                    );
                } else if (inputType.type === 'Json') {
                    this.hasJson = true;
                    result.push(this.wrapWithZodValidators('jsonSchema', field, inputType));
                } else if (inputType.type === 'True') {
                    result.push(this.wrapWithZodValidators('z.literal(true)', field, inputType));
                } else if (inputType.type === 'Null') {
                    result.push(this.wrapWithZodValidators('z.null()', field, inputType));
                } else {
                    const isEnum = inputType.location === 'enumTypes';
                    const isFieldRef = inputType.location === 'fieldRefTypes';

                    if (
                        // fieldRefTypes refer to other fields in the model and don't need to be generated as part of schema
                        !isFieldRef &&
                        (inputType.namespace === 'prisma' || isEnum)
                    ) {
                        // reduce concrete input types to their delegate base types
                        // e.g.: "UserCreateNestedOneWithoutDelegate_aux_PostInput" => "UserCreateWithoutAssetInput"
                        let mappedInputType = inputType;
                        if (contextDataModel) {
                            mappedInputType = this.mapDelegateInputType(inputType, contextDataModel, field.name);
                        }

                        if (mappedInputType.type !== this.originalName && typeof mappedInputType.type === 'string') {
                            this.addSchemaImport(mappedInputType.type);
                        }

                        const contextField = contextDataModel?.fields.find((f) => f.name === field.name);
                        result.push(this.generatePrismaStringLine(field, mappedInputType, lines.length, contextField));
                    }
                }

                return result;
            }, []);
        }

        if (alternatives.length === 0) {
            return [];
        }

        if (alternatives.length > 1) {
            alternatives = alternatives.map((alter) => alter.replace('.optional()', ''));
        }

        const fieldName = alternatives.some((alt) => alt.includes(':')) ? '' : `  ${field.name}:`;

        let resString: string;

        if (alternatives.length === 1) {
            resString = alternatives[0];
        } else {
            if (alternatives.some((alt) => alt.includes('Unchecked'))) {
                // if the union is for combining checked and unchecked input types, use `smartUnion`
                // to parse with the best candidate at runtime
                resString = this.wrapWithSmartUnion(...alternatives);
            } else {
                resString = `z.union([${alternatives.join(',\r\n')}])`;
            }
        }

        if (!field.isRequired) {
            resString += '.optional()';
        }

        if (field.isNullable) {
            resString += '.nullable()';
        }

        return [[`  ${fieldName} ${resString} `, field, true]];
    }

    private mapDelegateInputType(
        inputType: PrismaDMMF.InputTypeRef,
        contextDataModel: DataModel,
        contextFieldName: string
    ) {
        // input type mapping is only relevant for relation inherited from delegate models
        const contextField = contextDataModel.fields.find((f) => f.name === contextFieldName);
        if (!contextField || !isDataModel(contextField.type.reference?.ref)) {
            return inputType;
        }

        if (!contextField.$inheritedFrom || !isDelegateModel(contextField.$inheritedFrom)) {
            return inputType;
        }

        let processedInputType = inputType;

        // captures: model name and operation, "Without" part that references a concrete model,
        // and the "Input" or "NestedInput" suffix
        const match = inputType.type.match(/^(\S+?)((NestedOne)?WithoutDelegate_aux\S+?)((Nested)?Input)$/);
        if (match) {
            let mappedInputTypeName = match[1];

            if (contextDataModel) {
                // get the opposite side of the relation field, which should be of the proper
                // delegate base type
                const oppositeRelationField = getRelationBackLink(contextField);
                if (oppositeRelationField) {
                    mappedInputTypeName += `Without${upperCaseFirst(oppositeRelationField.name)}`;
                }
            }

            // "Input" or "NestedInput" suffix
            mappedInputTypeName += match[4];

            // Prisma's naming is inconsistent for update input types, so we need
            // to check for a few other candidates and use the one that matches
            // a DMMF input type name
            const candidates = [mappedInputTypeName];
            if (mappedInputTypeName.includes('UpdateOne')) {
                candidates.push(...candidates.map((name) => name.replace('UpdateOne', 'Update')));
            }
            if (mappedInputTypeName.includes('NestedInput')) {
                candidates.push(...candidates.map((name) => name.replace('NestedInput', 'Input')));
            }

            const finalMappedName =
                candidates.find((name) => this.inputObjectTypes.some((it) => it.name === name)) ?? mappedInputTypeName;

            processedInputType = { ...inputType, type: finalMappedName };
        }
        return processedInputType;
    }

    wrapWithZodValidators(
        mainValidators: string | string[],
        field: PrismaDMMF.SchemaArg,
        inputType: PrismaDMMF.InputTypeRef
    ) {
        let line = '';

        const base = Array.isArray(mainValidators) ? mainValidators : [mainValidators];

        line += base
            .map((validator) => {
                let r = validator;
                if (inputType.isList) {
                    r += '.array()';
                }
                if (!field.isRequired) {
                    r += '.optional()';
                }
                return r;
            })
            .join(', ');

        if (base.length > 1) {
            line = `z.union([${line}])`;
        }

        return line;
    }

    addSchemaImport(name: string) {
        this.schemaImports.add(upperCaseFirst(name));
    }

    generatePrismaStringLine(
        field: PrismaDMMF.SchemaArg,
        inputType: PrismaDMMF.InputTypeRef,
        inputsLength: number,
        contextField: DataModelField | undefined
    ) {
        const isEnum = inputType.location === 'enumTypes';

        const { isModelQueryType, modelName, queryName } = this.checkIsModelQueryType(inputType.type as string);

        const objectSchemaLine = isModelQueryType
            ? // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              this.resolveModelQuerySchemaName(modelName!, queryName!)
            : `${upperCaseFirst(inputType.type.toString())}ObjectSchema`;
        const enumSchemaLine = `${upperCaseFirst(inputType.type.toString())}Schema`;

        const schema = inputType.type === this.name ? objectSchemaLine : isEnum ? enumSchemaLine : objectSchemaLine;

        const arr = inputType.isList ? '.array()' : '';

        const optional =
            !field.isRequired ||
            // also check if the zmodel field infers the field as optional
            (contextField && this.isFieldOptional(contextField));

        return inputsLength === 1
            ? `  ${field.name}: z.lazy(() => ${schema})${arr}${optional ? '.optional()' : ''}`
            : `z.lazy(() => ${schema})${arr}${optional ? '.optional()' : ''}`;
    }

    private isFieldOptional(dmField: DataModelField) {
        if (hasAttribute(dmField, '@default')) {
            // it's possible that ZModel field has a default but it's transformed away
            // when generating Prisma schema, e.g.: `@default(auth().id)`
            return true;
        }

        if (isDataModel(dmField.type.reference?.ref)) {
            // if field is a relation, we need to check if the corresponding fk field has a default
            // {
            //   authorId Int @default(auth().id)
            //   author User @relation(...)  // <- author should be optional
            // }
            const fkFields = getForeignKeyFields(dmField);
            if (fkFields.every((fkField) => hasAttribute(fkField, '@default'))) {
                return true;
            }
        }

        return false;
    }

    generateFieldValidators(zodStringWithMainType: string, field: PrismaDMMF.SchemaArg) {
        const { isRequired, isNullable } = field;

        if (!isRequired) {
            zodStringWithMainType += '.optional()';
        }

        if (isNullable) {
            zodStringWithMainType += '.nullable()';
        }

        return zodStringWithMainType;
    }

    prepareObjectSchema(zodObjectSchemaFields: string[], options: PluginOptions) {
        const objectSchema = `${this.generateExportObjectSchemaStatement(
            this.wrapWithZodObject(zodObjectSchemaFields, options.mode as string)
        )}\n`;

        const prismaImportStatement = this.generateImportPrismaStatement(options);

        const json = this.generateJsonSchemaImplementation();

        return `${this.generateObjectSchemaImportStatements()}${prismaImportStatement}${json}${objectSchema}`;
    }

    generateExportObjectSchemaStatement(schema: string) {
        let name = this.name;
        let origName = this.originalName;

        if (isAggregateInputType(name)) {
            name = `${name}Type`;
            origName = `${origName}Type`;
        }
        const outType = this.makeZodType(`Prisma.${origName}`);
        return `type SchemaType = ${outType};
export const ${this.name}ObjectSchema: SchemaType = ${schema} as SchemaType;`;
    }

    generateImportPrismaStatement(options: PluginOptions) {
        const prismaClientImportPath = computePrismaClientImport(
            path.resolve(Transformer.outputPath, './objects'),
            options
        );
        return `import type { Prisma } from '${prismaClientImportPath}';\n\n`;
    }

    generateJsonSchemaImplementation() {
        let jsonSchemaImplementation = '';

        if (this.hasJson) {
            jsonSchemaImplementation += `\n`;
            jsonSchemaImplementation += `const literalSchema = z.union([z.string(), z.number(), z.boolean()]);\n`;
            jsonSchemaImplementation += `const jsonSchema: ${this.makeZodType('Prisma.InputJsonValue')} = z.lazy(() =>\n`;
            jsonSchemaImplementation += `  z.union([literalSchema, z.array(jsonSchema.nullable()), z.record(z.string(), jsonSchema.nullable())])\n`;
            jsonSchemaImplementation += `);\n\n`;
        }

        return jsonSchemaImplementation;
    }

    generateObjectSchemaImportStatements() {
        let generatedImports = this.generateImportZodStatement();
        generatedImports += this.generateSchemaImports();
        generatedImports += this.generateCommonImport();
        generatedImports += '\n\n';
        return generatedImports;
    }

    generateSchemaImports() {
        return [...this.schemaImports]
            .map((name) => {
                const { isModelQueryType, modelName } = this.checkIsModelQueryType(name);
                if (isModelQueryType) {
                    return `import { ${modelName}InputSchema } from '../input/${modelName}Input.schema';`;
                } else if (Transformer.enumNames.includes(name)) {
                    return `import { ${name}Schema } from '../enums/${name}.schema';`;
                } else {
                    return `import { ${name}ObjectSchema } from './${name}.schema';`;
                }
            })
            .join('\n');
    }

    private generateCommonImport() {
        let r = '';
        if (this.hasDecimal) {
            r += `import { DecimalSchema } from '../common';\n`;
        }
        if (r) {
            r += '\n';
        }
        return r;
    }

    checkIsModelQueryType(type: string) {
        const modelQueryTypeSuffixToQueryName: Record<string, string> = {
            FindManyArgs: 'findMany',
        };
        for (const modelQueryType of ['FindManyArgs']) {
            if (type.includes(modelQueryType)) {
                const modelQueryTypeSuffixIndex = type.indexOf(modelQueryType);
                return {
                    isModelQueryType: true,
                    modelName: upperCaseFirst(type.substring(0, modelQueryTypeSuffixIndex)),
                    queryName: modelQueryTypeSuffixToQueryName[modelQueryType],
                };
            }
        }
        return { isModelQueryType: false };
    }

    resolveModelQuerySchemaName(modelName: string, queryName: string) {
        return `${modelName}InputSchema.${queryName}`;
    }

    wrapWithZodObject(zodStringFields: string | string[], mode = 'strict') {
        let wrapped = '';

        wrapped += 'z.object({';
        wrapped += '\n';
        wrapped += '  ' + zodStringFields;
        wrapped += '\n';
        wrapped += '})';

        switch (mode) {
            case 'strip':
                // zod strips by default
                break;
            case 'passthrough':
                wrapped += '.passthrough()';
                break;
            default:
                wrapped += '.strict()';
                break;
        }
        return wrapped;
    }

    wrapWithSmartUnion(...schemas: string[]) {
        if (this.mode === 'strip') {
            return `smartUnion(z, [${schemas.join(', ')}])`;
        } else {
            return `z.union([${schemas.join(', ')}])`;
        }
    }

    async generateInputSchemas(options: PluginOptions, zmodel: Model) {
        const globalExports: string[] = [];

        // whether Prisma's Unchecked* series of input types should be generated
        const generateUnchecked = options.noUncheckedInput !== true;

        for (const modelOperation of this.modelOperations) {
            const {
                model: origModelName,
                findUnique,
                findFirst,
                findMany,
                // @ts-expect-error
                createOne,
                createMany,
                // @ts-expect-error
                deleteOne,
                // @ts-expect-error
                updateOne,
                deleteMany,
                updateMany,
                // @ts-expect-error
                upsertOne,
                aggregate,
                groupBy,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } = modelOperation;

            const modelName = upperCaseFirst(origModelName);

            globalExports.push(`export * from './${modelName}Input.schema'`);

            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const model = findModelByName(this.models, origModelName)!;

            const { selectImport, includeImport, selectZodSchemaLineLazy, includeZodSchemaLineLazy } =
                this.resolveSelectIncludeImportAndZodSchemaLine(model);

            let imports = [
                this.generateImportZodStatement(),
                this.generateImportPrismaStatement(options),
                selectImport,
                includeImport,
            ];
            let codeBody = '';
            const operations: [string, string][] = [];
            const mode = (options.mode as string) ?? 'strict';

            // OrderByWithRelationInput's name is different when "fullTextSearch" is enabled
            const orderByWithRelationInput = this.inputObjectTypes
                .map((o) => upperCaseFirst(o.name))
                .includes(`${modelName}OrderByWithRelationInput`)
                ? `${modelName}OrderByWithRelationInput`
                : `${modelName}OrderByWithRelationAndSearchRelevanceInput`;

            if (findUnique) {
                imports.push(
                    `import { ${modelName}WhereUniqueInputObjectSchema } from '../objects/${modelName}WhereUniqueInput.schema'`
                );
                const fields = `${selectZodSchemaLineLazy} ${includeZodSchemaLineLazy} where: ${modelName}WhereUniqueInputObjectSchema`;
                codeBody += `findUnique: ${this.wrapWithZodObject(fields, mode)},`;
                operations.push(['findUnique', origModelName]);
            }

            if (findFirst) {
                imports.push(
                    `import { ${modelName}WhereInputObjectSchema } from '../objects/${modelName}WhereInput.schema'`,
                    `import { ${orderByWithRelationInput}ObjectSchema } from '../objects/${orderByWithRelationInput}.schema'`,
                    `import { ${modelName}WhereUniqueInputObjectSchema } from '../objects/${modelName}WhereUniqueInput.schema'`,
                    `import { ${modelName}ScalarFieldEnumSchema } from '../enums/${modelName}ScalarFieldEnum.schema'`
                );
                const fields = `${selectZodSchemaLineLazy} ${includeZodSchemaLineLazy} where: ${modelName}WhereInputObjectSchema.optional(), orderBy: z.union([${orderByWithRelationInput}ObjectSchema, ${orderByWithRelationInput}ObjectSchema.array()]).optional(), cursor: ${modelName}WhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), distinct: z.array(${modelName}ScalarFieldEnumSchema).optional()`;
                codeBody += `findFirst: ${this.wrapWithZodObject(fields, mode)},`;
                operations.push(['findFirst', origModelName]);
            }

            if (findMany) {
                imports.push(
                    `import { ${modelName}WhereInputObjectSchema } from '../objects/${modelName}WhereInput.schema'`,
                    `import { ${orderByWithRelationInput}ObjectSchema } from '../objects/${orderByWithRelationInput}.schema'`,
                    `import { ${modelName}WhereUniqueInputObjectSchema } from '../objects/${modelName}WhereUniqueInput.schema'`,
                    `import { ${modelName}ScalarFieldEnumSchema } from '../enums/${modelName}ScalarFieldEnum.schema'`
                );
                const fields = `${selectZodSchemaLineLazy} ${includeZodSchemaLineLazy} where: ${modelName}WhereInputObjectSchema.optional(), orderBy: z.union([${orderByWithRelationInput}ObjectSchema, ${orderByWithRelationInput}ObjectSchema.array()]).optional(), cursor: ${modelName}WhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), distinct: z.array(${modelName}ScalarFieldEnumSchema).optional()`;
                codeBody += `findMany: ${this.wrapWithZodObject(fields, mode)},`;
                operations.push(['findMany', origModelName]);
            }

            if (createOne) {
                imports.push(
                    `import { ${modelName}CreateInputObjectSchema } from '../objects/${modelName}CreateInput.schema'`
                );
                if (generateUnchecked) {
                    imports.push(
                        `import { ${modelName}UncheckedCreateInputObjectSchema } from '../objects/${modelName}UncheckedCreateInput.schema'`
                    );
                }
                const dataSchema = generateUnchecked
                    ? this.wrapWithSmartUnion(
                          `${modelName}CreateInputObjectSchema`,
                          `${modelName}UncheckedCreateInputObjectSchema`
                      )
                    : `${modelName}CreateInputObjectSchema`;
                const fields = `${selectZodSchemaLineLazy} ${includeZodSchemaLineLazy} data: ${dataSchema}`;
                codeBody += `create: ${this.wrapWithZodObject(fields, mode)},`;
                operations.push(['create', origModelName]);
            }

            if (createMany && supportCreateMany(zmodel)) {
                imports.push(
                    `import { ${modelName}CreateManyInputObjectSchema } from '../objects/${modelName}CreateManyInput.schema'`
                );
                const fields = `data: z.union([${modelName}CreateManyInputObjectSchema, z.array(${modelName}CreateManyInputObjectSchema)]), skipDuplicates: z.boolean().optional()`;
                codeBody += `createMany: ${this.wrapWithZodObject(fields, mode)},`;
                operations.push(['createMany', origModelName]);
            }

            if (deleteOne) {
                imports.push(
                    `import { ${modelName}WhereUniqueInputObjectSchema } from '../objects/${modelName}WhereUniqueInput.schema'`
                );
                const fields = `${selectZodSchemaLineLazy} ${includeZodSchemaLineLazy} where: ${modelName}WhereUniqueInputObjectSchema`;
                codeBody += `'delete': ${this.wrapWithZodObject(fields, mode)},`;
                operations.push(['delete', origModelName]);
            }

            if (deleteMany) {
                imports.push(
                    `import { ${modelName}WhereInputObjectSchema } from '../objects/${modelName}WhereInput.schema'`
                );
                const fields = `where: ${modelName}WhereInputObjectSchema.optional()`;
                codeBody += `deleteMany: ${this.wrapWithZodObject(fields, mode)},`;
                operations.push(['deleteMany', origModelName]);
            }

            if (updateOne) {
                imports.push(
                    `import { ${modelName}UpdateInputObjectSchema } from '../objects/${modelName}UpdateInput.schema'`,
                    `import { ${modelName}WhereUniqueInputObjectSchema } from '../objects/${modelName}WhereUniqueInput.schema'`
                );
                if (generateUnchecked) {
                    imports.push(
                        `import { ${modelName}UncheckedUpdateInputObjectSchema } from '../objects/${modelName}UncheckedUpdateInput.schema'`
                    );
                }
                const dataSchema = generateUnchecked
                    ? this.wrapWithSmartUnion(
                          `${modelName}UpdateInputObjectSchema`,
                          `${modelName}UncheckedUpdateInputObjectSchema`
                      )
                    : `${modelName}UpdateInputObjectSchema`;
                const fields = `${selectZodSchemaLineLazy} ${includeZodSchemaLineLazy} data: ${dataSchema}, where: ${modelName}WhereUniqueInputObjectSchema`;
                codeBody += `update: ${this.wrapWithZodObject(fields, mode)},`;
                operations.push(['update', origModelName]);
            }

            if (updateMany) {
                imports.push(
                    `import { ${modelName}UpdateManyMutationInputObjectSchema } from '../objects/${modelName}UpdateManyMutationInput.schema'`,
                    `import { ${modelName}WhereInputObjectSchema } from '../objects/${modelName}WhereInput.schema'`
                );
                if (generateUnchecked) {
                    imports.push(
                        `import { ${modelName}UncheckedUpdateManyInputObjectSchema } from '../objects/${modelName}UncheckedUpdateManyInput.schema'`
                    );
                }
                const dataSchema = generateUnchecked
                    ? this.wrapWithSmartUnion(
                          `${modelName}UpdateManyMutationInputObjectSchema`,
                          `${modelName}UncheckedUpdateManyInputObjectSchema`
                      )
                    : `${modelName}UpdateManyMutationInputObjectSchema`;
                const fields = `data: ${dataSchema}, where: ${modelName}WhereInputObjectSchema.optional()`;
                codeBody += `updateMany: ${this.wrapWithZodObject(fields, mode)},`;
                operations.push(['updateMany', origModelName]);
            }

            if (upsertOne) {
                imports.push(
                    `import { ${modelName}WhereUniqueInputObjectSchema } from '../objects/${modelName}WhereUniqueInput.schema'`,
                    `import { ${modelName}CreateInputObjectSchema } from '../objects/${modelName}CreateInput.schema'`,
                    `import { ${modelName}UpdateInputObjectSchema } from '../objects/${modelName}UpdateInput.schema'`
                );
                if (generateUnchecked) {
                    imports.push(
                        `import { ${modelName}UncheckedCreateInputObjectSchema } from '../objects/${modelName}UncheckedCreateInput.schema'`,
                        `import { ${modelName}UncheckedUpdateInputObjectSchema } from '../objects/${modelName}UncheckedUpdateInput.schema'`
                    );
                }
                const createSchema = generateUnchecked
                    ? this.wrapWithSmartUnion(
                          `${modelName}CreateInputObjectSchema`,
                          `${modelName}UncheckedCreateInputObjectSchema`
                      )
                    : `${modelName}CreateInputObjectSchema`;
                const updateSchema = generateUnchecked
                    ? this.wrapWithSmartUnion(
                          `${modelName}UpdateInputObjectSchema`,
                          `${modelName}UncheckedUpdateInputObjectSchema`
                      )
                    : `${modelName}UpdateInputObjectSchema`;
                const fields = `${selectZodSchemaLineLazy} ${includeZodSchemaLineLazy} where: ${modelName}WhereUniqueInputObjectSchema, create: ${createSchema}, update: ${updateSchema}`;
                codeBody += `upsert: ${this.wrapWithZodObject(fields, mode)},`;
                operations.push(['upsert', origModelName]);
            }

            const aggregateOperations = [];

            if (this.aggregateOperationSupport[modelName]?.count) {
                imports.push(
                    `import { ${modelName}CountAggregateInputObjectSchema } from '../objects/${modelName}CountAggregateInput.schema'`
                );
                aggregateOperations.push(
                    `_count: z.union([ z.literal(true), ${modelName}CountAggregateInputObjectSchema ]).optional()`
                );
            }
            if (this.aggregateOperationSupport[modelName]?.min) {
                imports.push(
                    `import { ${modelName}MinAggregateInputObjectSchema } from '../objects/${modelName}MinAggregateInput.schema'`
                );
                aggregateOperations.push(`_min: ${modelName}MinAggregateInputObjectSchema.optional()`);
            }
            if (this.aggregateOperationSupport[modelName]?.max) {
                imports.push(
                    `import { ${modelName}MaxAggregateInputObjectSchema } from '../objects/${modelName}MaxAggregateInput.schema'`
                );
                aggregateOperations.push(`_max: ${modelName}MaxAggregateInputObjectSchema.optional()`);
            }
            if (this.aggregateOperationSupport[modelName]?.avg) {
                imports.push(
                    `import { ${modelName}AvgAggregateInputObjectSchema } from '../objects/${modelName}AvgAggregateInput.schema'`
                );
                aggregateOperations.push(`_avg: ${modelName}AvgAggregateInputObjectSchema.optional()`);
            }
            if (this.aggregateOperationSupport[modelName]?.sum) {
                imports.push(
                    `import { ${modelName}SumAggregateInputObjectSchema } from '../objects/${modelName}SumAggregateInput.schema'`
                );
                aggregateOperations.push(`_sum: ${modelName}SumAggregateInputObjectSchema.optional()`);
            }

            if (aggregate) {
                imports.push(
                    `import { ${modelName}WhereInputObjectSchema } from '../objects/${modelName}WhereInput.schema'`,
                    `import { ${orderByWithRelationInput}ObjectSchema } from '../objects/${orderByWithRelationInput}.schema'`,
                    `import { ${modelName}WhereUniqueInputObjectSchema } from '../objects/${modelName}WhereUniqueInput.schema'`
                );

                const fields = `where: ${modelName}WhereInputObjectSchema.optional(), orderBy: z.union([${orderByWithRelationInput}ObjectSchema, ${orderByWithRelationInput}ObjectSchema.array()]).optional(), cursor: ${modelName}WhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), ${aggregateOperations.join(
                    ', '
                )}`;
                codeBody += `aggregate: ${this.wrapWithZodObject(fields, mode)},`;
                operations.push(['aggregate', modelName]);
            }

            if (groupBy) {
                imports.push(
                    `import { ${modelName}WhereInputObjectSchema } from '../objects/${modelName}WhereInput.schema'`,
                    `import { ${modelName}OrderByWithAggregationInputObjectSchema } from '../objects/${modelName}OrderByWithAggregationInput.schema'`,
                    `import { ${modelName}ScalarWhereWithAggregatesInputObjectSchema } from '../objects/${modelName}ScalarWhereWithAggregatesInput.schema'`,
                    `import { ${modelName}ScalarFieldEnumSchema } from '../enums/${modelName}ScalarFieldEnum.schema'`
                );
                const fields = `where: ${modelName}WhereInputObjectSchema.optional(), orderBy: z.union([${modelName}OrderByWithAggregationInputObjectSchema, ${modelName}OrderByWithAggregationInputObjectSchema.array()]).optional(), having: ${modelName}ScalarWhereWithAggregatesInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), by: z.array(${modelName}ScalarFieldEnumSchema), ${aggregateOperations.join(
                    ', '
                )}`;
                codeBody += `groupBy: ${this.wrapWithZodObject(fields, mode)},`;

                operations.push(['groupBy', origModelName]);
            }

            // count
            {
                imports.push(
                    `import { ${modelName}WhereInputObjectSchema } from '../objects/${modelName}WhereInput.schema'`,
                    `import { ${orderByWithRelationInput}ObjectSchema } from '../objects/${orderByWithRelationInput}.schema'`,
                    `import { ${modelName}WhereUniqueInputObjectSchema } from '../objects/${modelName}WhereUniqueInput.schema'`,
                    `import { ${modelName}ScalarFieldEnumSchema } from '../enums/${modelName}ScalarFieldEnum.schema'`,
                    `import { ${modelName}CountAggregateInputObjectSchema } from '../objects/${modelName}CountAggregateInput.schema'`
                );

                const fields = `where: ${modelName}WhereInputObjectSchema.optional(), orderBy: z.union([${orderByWithRelationInput}ObjectSchema, ${orderByWithRelationInput}ObjectSchema.array()]).optional(), cursor: ${modelName}WhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), distinct: z.array(${modelName}ScalarFieldEnumSchema).optional(), select: z.union([ z.literal(true), ${modelName}CountAggregateInputObjectSchema ]).optional()`;
                codeBody += `count: ${this.wrapWithZodObject(fields, mode)},`;
                operations.push(['count', origModelName]);
            }

            imports = [...new Set(imports)];

            const filePath = path.join(Transformer.outputPath, `input/${modelName}Input.schema.ts`);
            const content = `
            ${imports.join(';\n')}
            
            type ${modelName}InputSchemaType = {
${operations
    .map(([operation, typeName]) => {
        const argType = `Prisma.${typeName}${upperCaseFirst(operation)}Args`;
        return indentString(`${operation}: ${this.makeZodType(argType)}`, 4)
})
    .join(',\n')}
            }

            export const ${modelName}InputSchema = {
            ${indentString(codeBody, 4)}
            } as ${modelName}InputSchemaType;
                        `;

            this.sourceFiles.push(this.project.createSourceFile(filePath, content, { overwrite: true }));
        }

        const indexFilePath = path.join(Transformer.outputPath, 'input/index.ts');
        const indexContent = `
${globalExports.join(';\n')}
`;
        this.sourceFiles.push(this.project.createSourceFile(indexFilePath, indexContent, { overwrite: true }));
    }

    generateImportStatements(imports: (string | undefined)[]) {
        let generatedImports = this.generateImportZodStatement();
        generatedImports += imports?.filter((importItem) => !!importItem).join(';\r\n') ?? '';
        generatedImports += '\n\n';
        return generatedImports;
    }

    resolveSelectIncludeImportAndZodSchemaLine(model: PrismaDMMF.Model) {
        const { name } = model;
        const modelName = upperCaseFirst(name);

        const hasRelationToAnotherModel = checkModelHasModelRelation(model);

        const selectImport = `import { ${modelName}SelectObjectSchema } from '../objects/${modelName}Select.schema'`;

        const includeImport = hasRelationToAnotherModel
            ? `import { ${modelName}IncludeObjectSchema } from '../objects/${modelName}Include.schema'`
            : '';

        let selectZodSchemaLine = '';
        let includeZodSchemaLine = '';
        let selectZodSchemaLineLazy = '';
        let includeZodSchemaLineLazy = '';

        const zodSelectObjectSchema = `${modelName}SelectObjectSchema.optional()`;
        selectZodSchemaLine = `select: ${zodSelectObjectSchema},`;
        selectZodSchemaLineLazy = `select: z.lazy(() => ${zodSelectObjectSchema}),`;

        if (hasRelationToAnotherModel) {
            const zodIncludeObjectSchema = `${modelName}IncludeObjectSchema.optional()`;
            includeZodSchemaLine = `include: ${zodIncludeObjectSchema},`;
            includeZodSchemaLineLazy = `include: z.lazy(() => ${zodIncludeObjectSchema}),`;
        }

        return {
            selectImport,
            includeImport,
            selectZodSchemaLine,
            includeZodSchemaLine,
            selectZodSchemaLineLazy,
            includeZodSchemaLineLazy,
        };
    }

    private makeZodType(typeArg: string) {
        return this.zodVersion === 'v3' ? `z.ZodType<${typeArg}>` : `z.ZodType<${typeArg}, ${typeArg}>`;
    }
}
