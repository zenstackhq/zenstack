/* eslint-disable @typescript-eslint/ban-ts-comment */
import type { DMMF, DMMF as PrismaDMMF } from '@prisma/generator-helper';
import { getPrismaClientImportSpec, getPrismaVersion, type PluginOptions } from '@zenstackhq/sdk';
import { checkModelHasModelRelation, findModelByName, isAggregateInputType } from '@zenstackhq/sdk/dmmf-helpers';
import { indentString } from '@zenstackhq/sdk/utils';
import path from 'path';
import * as semver from 'semver';
import type { Project, SourceFile } from 'ts-morph';
import { upperCaseFirst } from 'upper-case-first';
import { AggregateOperationSupport, TransformerParams } from './types';

export default class Transformer {
    name: string;
    originalName: string;
    fields: PrismaDMMF.SchemaArg[];
    schemaImports = new Set<string>();
    models: PrismaDMMF.Model[];
    modelOperations: PrismaDMMF.ModelMapping[];
    aggregateOperationSupport: AggregateOperationSupport;
    enumTypes: PrismaDMMF.SchemaEnum[];

    static enumNames: string[] = [];
    static rawOpsMap: { [name: string]: string } = {};
    static provider: string;
    private static outputPath = './generated';
    private hasJson = false;
    private hasDecimal = false;
    private project: Project;
    private inputObjectTypes: DMMF.InputType[];
    public sourceFiles: SourceFile[] = [];

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
    }

    static setOutputPath(outPath: string) {
        this.outputPath = outPath;
    }

    static getOutputPath() {
        return this.outputPath;
    }

    async generateEnumSchemas() {
        for (const enumType of this.enumTypes) {
            const name = upperCaseFirst(enumType.name);
            const filePath = path.join(Transformer.outputPath, `enums/${name}.schema.ts`);
            const content = `/* eslint-disable */\n${this.generateImportZodStatement()}\n${this.generateExportSchemaStatement(
                `${name}`,
                `z.enum(${JSON.stringify(enumType.values)})`
            )}`;
            this.sourceFiles.push(this.project.createSourceFile(filePath, content, { overwrite: true }));
        }

        this.sourceFiles.push(
            this.project.createSourceFile(
                path.join(Transformer.outputPath, `enums/index.ts`),
                this.enumTypes
                    .map((enumType) => `export * from './${upperCaseFirst(enumType.name)}.schema';`)
                    .join('\n'),
                { overwrite: true }
            )
        );
    }

    generateImportZodStatement() {
        return "import { z } from 'zod';\n";
    }

    generateExportSchemaStatement(name: string, schema: string) {
        return `export const ${name}Schema = ${schema}`;
    }

    generateObjectSchema(generateUnchecked: boolean, options: PluginOptions) {
        const zodObjectSchemaFields = this.generateObjectSchemaFields(generateUnchecked);
        const objectSchema = this.prepareObjectSchema(zodObjectSchemaFields, options);

        const filePath = path.join(Transformer.outputPath, `objects/${this.name}.schema.ts`);
        const content = '/* eslint-disable */\n' + objectSchema;
        this.sourceFiles.push(this.project.createSourceFile(filePath, content, { overwrite: true }));
        return `${this.name}.schema`;
    }

    generateObjectSchemaFields(generateUnchecked: boolean) {
        const zodObjectSchemaFields = this.fields
            .map((field) => this.generateObjectSchemaField(field, generateUnchecked))
            .flatMap((item) => item)
            .map((item) => {
                const [zodStringWithMainType, field, skipValidators] = item;

                const value = skipValidators
                    ? zodStringWithMainType
                    : this.generateFieldValidators(zodStringWithMainType, field);

                return value.trim();
            });
        return zodObjectSchemaFields;
    }

    generateObjectSchemaField(
        field: PrismaDMMF.SchemaArg,
        generateUnchecked: boolean
    ): [string, PrismaDMMF.SchemaArg, boolean][] {
        const lines = field.inputTypes;

        if (lines.length === 0) {
            return [];
        }

        let alternatives = lines.reduce<string[]>((result, inputType) => {
            if (!generateUnchecked && typeof inputType.type === 'string' && inputType.type.includes('Unchecked')) {
                return result;
            }

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
                result.push(this.wrapWithZodValidators(`z.instanceof(Uint8Array)`, field, inputType));
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
                    if (inputType.type !== this.originalName && typeof inputType.type === 'string') {
                        this.addSchemaImport(inputType.type);
                    }

                    result.push(this.generatePrismaStringLine(field, inputType, lines.length));
                }
            }

            return result;
        }, []);

        if (alternatives.length === 0) {
            return [];
        }

        if (alternatives.length > 1) {
            alternatives = alternatives.map((alter) => alter.replace('.optional()', ''));
        }

        const fieldName = alternatives.some((alt) => alt.includes(':')) ? '' : `  ${field.name}:`;

        const opt = !field.isRequired ? '.optional()' : '';

        let resString =
            alternatives.length === 1 ? alternatives.join(',\r\n') : `z.union([${alternatives.join(',\r\n')}])${opt}`;

        if (field.isNullable) {
            resString += '.nullable()';
        }

        return [[`  ${fieldName} ${resString} `, field, true]];
    }

    wrapWithZodValidators(
        mainValidators: string | string[],
        field: PrismaDMMF.SchemaArg,
        inputType: PrismaDMMF.SchemaArgInputType
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
        inputType: PrismaDMMF.SchemaArgInputType,
        inputsLength: number
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

        const opt = !field.isRequired ? '.optional()' : '';

        return inputsLength === 1
            ? `  ${field.name}: z.lazy(() => ${schema})${arr}${opt}`
            : `z.lazy(() => ${schema})${arr}${opt}`;
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
            this.addFinalWrappers({ zodStringFields: zodObjectSchemaFields })
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
        const outType = `z.ZodType<Prisma.${origName}>`;
        return `type SchemaType = ${outType};
export const ${this.name}ObjectSchema: SchemaType = ${schema} as SchemaType;`;
    }

    addFinalWrappers({ zodStringFields }: { zodStringFields: string[] }) {
        const fields = [...zodStringFields];

        return this.wrapWithZodObject(fields) + '.strict()';
    }

    generateImportPrismaStatement(options: PluginOptions) {
        const prismaClientImportPath = getPrismaClientImportSpec(
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
            jsonSchemaImplementation += `const jsonSchema: z.ZodType<Prisma.InputJsonValue> = z.lazy(() =>\n`;
            jsonSchemaImplementation += `  z.union([literalSchema, z.array(jsonSchema.nullable()), z.record(jsonSchema.nullable())])\n`;
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

    wrapWithZodUnion(zodStringFields: string[]) {
        let wrapped = '';

        wrapped += 'z.union([';
        wrapped += '\n';
        wrapped += '  ' + zodStringFields.join(',');
        wrapped += '\n';
        wrapped += '])';
        return wrapped;
    }

    wrapWithZodObject(zodStringFields: string | string[]) {
        let wrapped = '';

        wrapped += 'z.object({';
        wrapped += '\n';
        wrapped += '  ' + zodStringFields;
        wrapped += '\n';
        wrapped += '})';
        return wrapped;
    }

    async generateInputSchemas(options: PluginOptions) {
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
                `import { z } from 'zod'`,
                this.generateImportPrismaStatement(options),
                selectImport,
                includeImport,
            ];
            let codeBody = '';
            const operations: [string, string][] = [];

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
                codeBody += `findUnique: z.object({ ${selectZodSchemaLineLazy} ${includeZodSchemaLineLazy} where: ${modelName}WhereUniqueInputObjectSchema }),`;
                operations.push(['findUnique', origModelName]);
            }

            if (findFirst) {
                imports.push(
                    `import { ${modelName}WhereInputObjectSchema } from '../objects/${modelName}WhereInput.schema'`,
                    `import { ${orderByWithRelationInput}ObjectSchema } from '../objects/${orderByWithRelationInput}.schema'`,
                    `import { ${modelName}WhereUniqueInputObjectSchema } from '../objects/${modelName}WhereUniqueInput.schema'`,
                    `import { ${modelName}ScalarFieldEnumSchema } from '../enums/${modelName}ScalarFieldEnum.schema'`
                );
                codeBody += `findFirst: z.object({ ${selectZodSchemaLineLazy} ${includeZodSchemaLineLazy} where: ${modelName}WhereInputObjectSchema.optional(), orderBy: z.union([${orderByWithRelationInput}ObjectSchema, ${orderByWithRelationInput}ObjectSchema.array()]).optional(), cursor: ${modelName}WhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), distinct: z.array(${modelName}ScalarFieldEnumSchema).optional() }),`;
                operations.push(['findFirst', origModelName]);
            }

            if (findMany) {
                imports.push(
                    `import { ${modelName}WhereInputObjectSchema } from '../objects/${modelName}WhereInput.schema'`,
                    `import { ${orderByWithRelationInput}ObjectSchema } from '../objects/${orderByWithRelationInput}.schema'`,
                    `import { ${modelName}WhereUniqueInputObjectSchema } from '../objects/${modelName}WhereUniqueInput.schema'`,
                    `import { ${modelName}ScalarFieldEnumSchema } from '../enums/${modelName}ScalarFieldEnum.schema'`
                );
                codeBody += `findMany: z.object({ ${selectZodSchemaLineLazy} ${includeZodSchemaLineLazy} where: ${modelName}WhereInputObjectSchema.optional(), orderBy: z.union([${orderByWithRelationInput}ObjectSchema, ${orderByWithRelationInput}ObjectSchema.array()]).optional(), cursor: ${modelName}WhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), distinct: z.array(${modelName}ScalarFieldEnumSchema).optional()  }),`;
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
                    ? `z.union([${modelName}CreateInputObjectSchema, ${modelName}UncheckedCreateInputObjectSchema])`
                    : `${modelName}CreateInputObjectSchema`;
                codeBody += `create: z.object({ ${selectZodSchemaLineLazy} ${includeZodSchemaLineLazy} data: ${dataSchema} }),`;
                operations.push(['create', origModelName]);
            }

            if (createMany) {
                imports.push(
                    `import { ${modelName}CreateManyInputObjectSchema } from '../objects/${modelName}CreateManyInput.schema'`
                );
                codeBody += `createMany: z.object({ data: z.union([${modelName}CreateManyInputObjectSchema, z.array(${modelName}CreateManyInputObjectSchema)]) }),`;
                operations.push(['createMany', origModelName]);
            }

            if (deleteOne) {
                imports.push(
                    `import { ${modelName}WhereUniqueInputObjectSchema } from '../objects/${modelName}WhereUniqueInput.schema'`
                );
                codeBody += `'delete': z.object({ ${selectZodSchemaLineLazy} ${includeZodSchemaLineLazy} where: ${modelName}WhereUniqueInputObjectSchema  }),`;
                operations.push(['delete', origModelName]);
            }

            if (deleteMany) {
                imports.push(
                    `import { ${modelName}WhereInputObjectSchema } from '../objects/${modelName}WhereInput.schema'`
                );
                codeBody += `deleteMany: z.object({ where: ${modelName}WhereInputObjectSchema.optional()  }),`;
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
                    ? `z.union([${modelName}UpdateInputObjectSchema, ${modelName}UncheckedUpdateInputObjectSchema])`
                    : `${modelName}UpdateInputObjectSchema`;
                codeBody += `update: z.object({ ${selectZodSchemaLineLazy} ${includeZodSchemaLineLazy} data: ${dataSchema}, where: ${modelName}WhereUniqueInputObjectSchema  }),`;
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
                    ? `z.union([${modelName}UpdateManyMutationInputObjectSchema, ${modelName}UncheckedUpdateManyInputObjectSchema])`
                    : `${modelName}UpdateManyMutationInputObjectSchema`;
                codeBody += `updateMany: z.object({ data: ${dataSchema}, where: ${modelName}WhereInputObjectSchema.optional()  }),`;
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
                    ? `z.union([${modelName}CreateInputObjectSchema, ${modelName}UncheckedCreateInputObjectSchema])`
                    : `${modelName}CreateInputObjectSchema`;
                const updateSchema = generateUnchecked
                    ? `z.union([${modelName}UpdateInputObjectSchema, ${modelName}UncheckedUpdateInputObjectSchema])`
                    : `${modelName}UpdateInputObjectSchema`;
                codeBody += `upsert: z.object({ ${selectZodSchemaLineLazy} ${includeZodSchemaLineLazy} where: ${modelName}WhereUniqueInputObjectSchema, create: ${createSchema}, update: ${updateSchema} }),`;
                operations.push(['upsert', origModelName]);
            }

            const aggregateOperations = [];

            // DMMF messed up the model name casing used in the aggregate operations,
            // AND the casing behavior varies from version to version -_-||
            const prismaVersion = getPrismaVersion();

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

                codeBody += `aggregate: z.object({ where: ${modelName}WhereInputObjectSchema.optional(), orderBy: z.union([${orderByWithRelationInput}ObjectSchema, ${orderByWithRelationInput}ObjectSchema.array()]).optional(), cursor: ${modelName}WhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), ${aggregateOperations.join(
                    ', '
                )} }),`;
                operations.push(['aggregate', modelName]);
            }

            if (groupBy) {
                imports.push(
                    `import { ${modelName}WhereInputObjectSchema } from '../objects/${modelName}WhereInput.schema'`,
                    `import { ${modelName}OrderByWithAggregationInputObjectSchema } from '../objects/${modelName}OrderByWithAggregationInput.schema'`,
                    `import { ${modelName}ScalarWhereWithAggregatesInputObjectSchema } from '../objects/${modelName}ScalarWhereWithAggregatesInput.schema'`,
                    `import { ${modelName}ScalarFieldEnumSchema } from '../enums/${modelName}ScalarFieldEnum.schema'`
                );
                codeBody += `groupBy: z.object({ where: ${modelName}WhereInputObjectSchema.optional(), orderBy: z.union([${modelName}OrderByWithAggregationInputObjectSchema, ${modelName}OrderByWithAggregationInputObjectSchema.array()]).optional(), having: ${modelName}ScalarWhereWithAggregatesInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), by: z.array(${modelName}ScalarFieldEnumSchema), ${aggregateOperations.join(
                    ', '
                )} }),`;

                // prisma 4 and 5 different typing for "groupBy" and we have to deal with it separately
                if (prismaVersion && semver.gte(prismaVersion, '5.0.0')) {
                    operations.push(['groupBy', origModelName]);
                } else {
                    operations.push(['groupBy', modelName]);
                }
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

                codeBody += `count: z.object({ where: ${modelName}WhereInputObjectSchema.optional(), orderBy: z.union([${orderByWithRelationInput}ObjectSchema, ${orderByWithRelationInput}ObjectSchema.array()]).optional(), cursor: ${modelName}WhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), distinct: z.array(${modelName}ScalarFieldEnumSchema).optional(), select: z.union([ z.literal(true), ${modelName}CountAggregateInputObjectSchema ]).optional() })`;
                operations.push(['count', origModelName]);
            }

            imports = [...new Set(imports)];

            const filePath = path.join(Transformer.outputPath, `input/${modelName}Input.schema.ts`);
            const content = `
            /* eslint-disable */
            ${imports.join(';\n')}
            
            type ${modelName}InputSchemaType = {
${operations
    .map(([operation, typeName]) =>
        indentString(`${operation}: z.ZodType<Prisma.${typeName}${upperCaseFirst(operation)}Args>`, 4)
    )
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
/* eslint-disable */
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
}
