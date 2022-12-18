import type { DMMF as PrismaDMMF } from '@prisma/generator-helper';
import path from 'path';
import {
    checkModelHasModelRelation,
    findModelByName,
    isMongodbRawOp,
} from './helpers';
import { isAggregateInputType } from './helpers/aggregate-helpers';
import { AggregateOperationSupport, TransformerParams } from './types';
import { writeFileSafely } from './utils/writeFileSafely';

export default class Transformer {
    name: string;
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
    private static prismaClientOutputPath = '@prisma/client';
    private static isCustomPrismaClientOutputPath = false;
    private static isGenerateSelect = false;
    private static isGenerateInclude = false;

    constructor(params: TransformerParams) {
        this.name = params.name ?? '';
        this.fields = params.fields ?? [];
        this.models = params.models ?? [];
        this.modelOperations = params.modelOperations ?? [];
        this.aggregateOperationSupport = params.aggregateOperationSupport ?? {};
        this.enumTypes = params.enumTypes ?? [];
    }

    static setOutputPath(outPath: string) {
        this.outputPath = outPath;
    }

    static setIsGenerateSelect(isGenerateSelect: boolean) {
        this.isGenerateSelect = isGenerateSelect;
    }

    static setIsGenerateInclude(isGenerateInclude: boolean) {
        this.isGenerateInclude = isGenerateInclude;
    }

    static getOutputPath() {
        return this.outputPath;
    }

    static setPrismaClientOutputPath(prismaClientCustomPath: string) {
        this.prismaClientOutputPath = prismaClientCustomPath;
        this.isCustomPrismaClientOutputPath =
            prismaClientCustomPath !== '@prisma/client';
    }

    async generateEnumSchemas() {
        for (const enumType of this.enumTypes) {
            const { name, values } = enumType;

            await writeFileSafely(
                path.join(
                    Transformer.outputPath,
                    `schemas/enums/${name}.schema.ts`
                ),
                `${this.generateImportZodStatement()}\n${this.generateExportSchemaStatement(
                    `${name}`,
                    `z.enum(${JSON.stringify(values)})`
                )}`
            );
        }
    }

    generateImportZodStatement() {
        return "import { z } from 'zod';\n";
    }

    generateExportSchemaStatement(name: string, schema: string) {
        return `export const ${name}Schema = ${schema}`;
    }

    async generateObjectSchema() {
        const zodObjectSchemaFields = this.generateObjectSchemaFields();
        const objectSchema = this.prepareObjectSchema(zodObjectSchemaFields);
        const objectSchemaName = this.resolveObjectSchemaName();

        await writeFileSafely(
            path.join(
                Transformer.outputPath,
                `schemas/objects/${objectSchemaName}.schema.ts`
            ),
            objectSchema
        );
    }

    generateObjectSchemaFields() {
        const zodObjectSchemaFields = this.fields
            .map((field) => this.generateObjectSchemaField(field))
            .flatMap((item) => item)
            .map((item) => {
                const [zodStringWithMainType, field, skipValidators] = item;

                const value = skipValidators
                    ? zodStringWithMainType
                    : this.generateFieldValidators(
                          zodStringWithMainType,
                          field
                      );

                return value.trim();
            });
        return zodObjectSchemaFields;
    }

    generateObjectSchemaField(
        field: PrismaDMMF.SchemaArg
    ): [string, PrismaDMMF.SchemaArg, boolean][] {
        const lines = field.inputTypes;

        if (lines.length === 0) {
            return [];
        }

        let alternatives = lines.reduce<string[]>((result, inputType) => {
            if (inputType.type === 'String') {
                result.push(
                    this.wrapWithZodValidators('z.string()', field, inputType)
                );
            } else if (
                inputType.type === 'Int' ||
                inputType.type === 'Float' ||
                inputType.type === 'Decimal'
            ) {
                result.push(
                    this.wrapWithZodValidators('z.number()', field, inputType)
                );
            } else if (inputType.type === 'BigInt') {
                result.push(
                    this.wrapWithZodValidators('z.bigint()', field, inputType)
                );
            } else if (inputType.type === 'Boolean') {
                result.push(
                    this.wrapWithZodValidators('z.boolean()', field, inputType)
                );
            } else if (inputType.type === 'DateTime') {
                result.push(
                    this.wrapWithZodValidators('z.date()', field, inputType)
                );
            } else if (inputType.type === 'Json') {
                this.hasJson = true;

                result.push(
                    this.wrapWithZodValidators('jsonSchema', field, inputType)
                );
            } else if (inputType.type === 'True') {
                result.push(
                    this.wrapWithZodValidators(
                        'z.literal(true)',
                        field,
                        inputType
                    )
                );
            } else {
                const isEnum = inputType.location === 'enumTypes';

                if (inputType.namespace === 'prisma' || isEnum) {
                    if (
                        inputType.type !== this.name &&
                        typeof inputType.type === 'string'
                    ) {
                        this.addSchemaImport(inputType.type);
                    }

                    result.push(
                        this.generatePrismaStringLine(
                            field,
                            inputType,
                            lines.length
                        )
                    );
                }
            }

            return result;
        }, []);

        if (alternatives.length === 0) {
            return [];
        }

        if (alternatives.length > 1) {
            alternatives = alternatives.map((alter) =>
                alter.replace('.optional()', '')
            );
        }

        const fieldName = alternatives.some((alt) => alt.includes(':'))
            ? ''
            : `  ${field.name}:`;

        const opt = !field.isRequired ? '.optional()' : '';

        let resString =
            alternatives.length === 1
                ? alternatives.join(',\r\n')
                : `z.union([${alternatives.join(',\r\n')}])${opt}`;

        if (field.isNullable) {
            resString += '.nullable()';
        }

        return [[`  ${fieldName} ${resString} `, field, true]];
    }

    wrapWithZodValidators(
        mainValidator: string,
        field: PrismaDMMF.SchemaArg,
        inputType: PrismaDMMF.SchemaArgInputType
    ) {
        let line = '';
        line = mainValidator;

        if (inputType.isList) {
            line += '.array()';
        }

        if (!field.isRequired) {
            line += '.optional()';
        }

        return line;
    }

    addSchemaImport(name: string) {
        this.schemaImports.add(name);
    }

    generatePrismaStringLine(
        field: PrismaDMMF.SchemaArg,
        inputType: PrismaDMMF.SchemaArgInputType,
        inputsLength: number
    ) {
        const isEnum = inputType.location === 'enumTypes';

        const { isModelQueryType, modelName, queryName } =
            this.checkIsModelQueryType(inputType.type as string);

        const objectSchemaLine = isModelQueryType
            ? // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              this.resolveModelQuerySchemaName(modelName!, queryName!)
            : `${inputType.type}ObjectSchema`;
        const enumSchemaLine = `${inputType.type}Schema`;

        const schema =
            inputType.type === this.name
                ? objectSchemaLine
                : isEnum
                ? enumSchemaLine
                : objectSchemaLine;

        const arr = inputType.isList ? '.array()' : '';

        const opt = !field.isRequired ? '.optional()' : '';

        return inputsLength === 1
            ? `  ${field.name}: z.lazy(() => ${schema})${arr}${opt}`
            : `z.lazy(() => ${schema})${arr}${opt}`;
    }

    generateFieldValidators(
        zodStringWithMainType: string,
        field: PrismaDMMF.SchemaArg
    ) {
        const { isRequired, isNullable } = field;

        if (!isRequired) {
            zodStringWithMainType += '.optional()';
        }

        if (isNullable) {
            zodStringWithMainType += '.nullable()';
        }

        return zodStringWithMainType;
    }

    prepareObjectSchema(zodObjectSchemaFields: string[]) {
        const objectSchema = `${this.generateExportObjectSchemaStatement(
            this.addFinalWrappers({ zodStringFields: zodObjectSchemaFields })
        )}\n`;

        const prismaImportStatement = this.generateImportPrismaStatement();

        const json = this.generateJsonSchemaImplementation();

        return `${this.generateObjectSchemaImportStatements()}${prismaImportStatement}${json}${objectSchema}`;
    }

    generateExportObjectSchemaStatement(schema: string) {
        let name = this.name;
        let exportName = this.name;
        if (Transformer.provider === 'mongodb') {
            if (isMongodbRawOp(name)) {
                name = Transformer.rawOpsMap[name];
                exportName = name.replace('Args', '');
            }
        }

        if (isAggregateInputType(name)) {
            name = `${name}Type`;
        }
        const end = `export const ${exportName}ObjectSchema = Schema`;
        return `const Schema: z.ZodType<Prisma.${name}> = ${schema};\n\n ${end}`;
    }

    addFinalWrappers({ zodStringFields }: { zodStringFields: string[] }) {
        const fields = [...zodStringFields];

        return this.wrapWithZodObject(fields) + '.strict()';
    }

    generateImportPrismaStatement() {
        let prismaClientImportPath: string;
        if (Transformer.isCustomPrismaClientOutputPath) {
            /**
             * If a custom location was designated for the prisma client, we need to figure out the
             * relative path from {outputPath}/schemas/objects to {prismaClientCustomPath}
             */
            const fromPath = path.join(
                Transformer.outputPath,
                'schemas',
                'objects'
            );
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const toPath = Transformer.prismaClientOutputPath!;
            const relativePathFromOutputToPrismaClient = path
                .relative(fromPath, toPath)
                .split(path.sep)
                .join(path.posix.sep);
            prismaClientImportPath = relativePathFromOutputToPrismaClient;
        } else {
            /**
             * If the default output path for prisma client (@prisma/client) is being used, we can import from it directly
             * without having to resolve a relative path
             */
            prismaClientImportPath = Transformer.prismaClientOutputPath;
        }
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
        generatedImports += '\n\n';
        return generatedImports;
    }

    generateSchemaImports() {
        return [...this.schemaImports]
            .map((name) => {
                const { isModelQueryType, modelName, queryName } =
                    this.checkIsModelQueryType(name);
                if (isModelQueryType) {
                    return `import { ${this.resolveModelQuerySchemaName(
                        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                        modelName!,
                        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                        queryName!
                    )} } from '../${queryName}${modelName}.schema'`;
                } else if (Transformer.enumNames.includes(name)) {
                    return `import { ${name}Schema } from '../enums/${name}.schema'`;
                } else {
                    return `import { ${name}ObjectSchema } from './${name}.schema'`;
                }
            })
            .join(';\r\n');
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
                    modelName: type.substring(0, modelQueryTypeSuffixIndex),
                    queryName: modelQueryTypeSuffixToQueryName[modelQueryType],
                };
            }
        }
        return { isModelQueryType: false };
    }

    resolveModelQuerySchemaName(modelName: string, queryName: string) {
        const modelNameCapitalized =
            modelName.charAt(0).toUpperCase() + modelName.slice(1);
        const queryNameCapitalized =
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            queryName.charAt(0).toUpperCase() + queryName!.slice(1);
        return `${modelNameCapitalized}${queryNameCapitalized}Schema`;
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

    resolveObjectSchemaName() {
        let name = this.name;
        let exportName = this.name;
        if (isMongodbRawOp(name)) {
            name = Transformer.rawOpsMap[name];
            exportName = name.replace('Args', '');
        }
        return exportName;
    }

    async generateModelSchemas() {
        for (const modelOperation of this.modelOperations) {
            const {
                model: modelName,
                findUnique,
                findFirst,
                findMany,
                createOne,
                createMany,
                deleteOne,
                updateOne,
                deleteMany,
                updateMany,
                upsertOne,
                aggregate,
                groupBy,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } = modelOperation as any;

            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const model = findModelByName(this.models, modelName)!;

            const {
                selectImport,
                includeImport,
                selectZodSchemaLine,
                includeZodSchemaLine,
                selectZodSchemaLineLazy,
                includeZodSchemaLineLazy,
            } = this.resolveSelectIncludeImportAndZodSchemaLine(model);

            if (findUnique) {
                const imports = [
                    selectImport,
                    includeImport,
                    `import { ${modelName}WhereUniqueInputObjectSchema } from './objects/${modelName}WhereUniqueInput.schema'`,
                ];
                await writeFileSafely(
                    path.join(
                        Transformer.outputPath,
                        `schemas/${findUnique}.schema.ts`
                    ),
                    `${this.generateImportStatements(
                        imports
                    )}${this.generateExportSchemaStatement(
                        `${modelName}FindUnique`,
                        `z.object({ ${selectZodSchemaLine} ${includeZodSchemaLine} where: ${modelName}WhereUniqueInputObjectSchema })`
                    )}`
                );
            }

            if (findFirst) {
                const imports = [
                    selectImport,
                    includeImport,
                    `import { ${modelName}WhereInputObjectSchema } from './objects/${modelName}WhereInput.schema'`,
                    `import { ${modelName}OrderByWithRelationInputObjectSchema } from './objects/${modelName}OrderByWithRelationInput.schema'`,
                    `import { ${modelName}WhereUniqueInputObjectSchema } from './objects/${modelName}WhereUniqueInput.schema'`,
                    `import { ${modelName}ScalarFieldEnumSchema } from './enums/${modelName}ScalarFieldEnum.schema'`,
                ];
                await writeFileSafely(
                    path.join(
                        Transformer.outputPath,
                        `schemas/${findFirst}.schema.ts`
                    ),
                    `${this.generateImportStatements(
                        imports
                    )}${this.generateExportSchemaStatement(
                        `${modelName}FindFirst`,
                        `z.object({ ${selectZodSchemaLine} ${includeZodSchemaLine} where: ${modelName}WhereInputObjectSchema.optional(), orderBy: z.union([${modelName}OrderByWithRelationInputObjectSchema, ${modelName}OrderByWithRelationInputObjectSchema.array()]).optional(), cursor: ${modelName}WhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), distinct: z.array(${modelName}ScalarFieldEnumSchema).optional() })`
                    )}`
                );
            }

            if (findMany) {
                const imports = [
                    selectImport,
                    includeImport,
                    `import { ${modelName}WhereInputObjectSchema } from './objects/${modelName}WhereInput.schema'`,
                    `import { ${modelName}OrderByWithRelationInputObjectSchema } from './objects/${modelName}OrderByWithRelationInput.schema'`,
                    `import { ${modelName}WhereUniqueInputObjectSchema } from './objects/${modelName}WhereUniqueInput.schema'`,
                    `import { ${modelName}ScalarFieldEnumSchema } from './enums/${modelName}ScalarFieldEnum.schema'`,
                ];
                await writeFileSafely(
                    path.join(
                        Transformer.outputPath,
                        `schemas/${findMany}.schema.ts`
                    ),
                    `${this.generateImportStatements(
                        imports
                    )}${this.generateExportSchemaStatement(
                        `${modelName}FindMany`,
                        `z.object({ ${selectZodSchemaLineLazy} ${includeZodSchemaLineLazy} where: ${modelName}WhereInputObjectSchema.optional(), orderBy: z.union([${modelName}OrderByWithRelationInputObjectSchema, ${modelName}OrderByWithRelationInputObjectSchema.array()]).optional(), cursor: ${modelName}WhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), distinct: z.array(${modelName}ScalarFieldEnumSchema).optional()  })`
                    )}`
                );
            }

            if (createOne) {
                const imports = [
                    selectImport,
                    includeImport,
                    `import { ${modelName}CreateInputObjectSchema } from './objects/${modelName}CreateInput.schema'`,
                ];
                await writeFileSafely(
                    path.join(
                        Transformer.outputPath,
                        `schemas/${createOne}.schema.ts`
                    ),
                    `${this.generateImportStatements(
                        imports
                    )}${this.generateExportSchemaStatement(
                        `${modelName}CreateOne`,
                        `z.object({ ${selectZodSchemaLine} ${includeZodSchemaLine} data: ${modelName}CreateInputObjectSchema  })`
                    )}`
                );
            }

            if (createMany) {
                const imports = [
                    `import { ${modelName}CreateManyInputObjectSchema } from './objects/${modelName}CreateManyInput.schema'`,
                ];
                await writeFileSafely(
                    path.join(
                        Transformer.outputPath,
                        `schemas/${createMany}.schema.ts`
                    ),
                    `${this.generateImportStatements(
                        imports
                    )}${this.generateExportSchemaStatement(
                        `${modelName}CreateMany`,
                        `z.object({ data: ${modelName}CreateManyInputObjectSchema  })`
                    )}`
                );
            }

            if (deleteOne) {
                const imports = [
                    selectImport,
                    includeImport,
                    `import { ${modelName}WhereUniqueInputObjectSchema } from './objects/${modelName}WhereUniqueInput.schema'`,
                ];
                await writeFileSafely(
                    path.join(
                        Transformer.outputPath,
                        `schemas/${deleteOne}.schema.ts`
                    ),
                    `${this.generateImportStatements(
                        imports
                    )}${this.generateExportSchemaStatement(
                        `${modelName}DeleteOne`,
                        `z.object({ ${selectZodSchemaLine} ${includeZodSchemaLine} where: ${modelName}WhereUniqueInputObjectSchema  })`
                    )}`
                );
            }

            if (deleteMany) {
                const imports = [
                    `import { ${modelName}WhereInputObjectSchema } from './objects/${modelName}WhereInput.schema'`,
                ];
                await writeFileSafely(
                    path.join(
                        Transformer.outputPath,
                        `schemas/${deleteMany}.schema.ts`
                    ),
                    `${this.generateImportStatements(
                        imports
                    )}${this.generateExportSchemaStatement(
                        `${modelName}DeleteMany`,
                        `z.object({ where: ${modelName}WhereInputObjectSchema.optional()  })`
                    )}`
                );
            }

            if (updateOne) {
                const imports = [
                    selectImport,
                    includeImport,
                    `import { ${modelName}UpdateInputObjectSchema } from './objects/${modelName}UpdateInput.schema'`,
                    `import { ${modelName}WhereUniqueInputObjectSchema } from './objects/${modelName}WhereUniqueInput.schema'`,
                ];
                await writeFileSafely(
                    path.join(
                        Transformer.outputPath,
                        `schemas/${updateOne}.schema.ts`
                    ),
                    `${this.generateImportStatements(
                        imports
                    )}${this.generateExportSchemaStatement(
                        `${modelName}UpdateOne`,
                        `z.object({ ${selectZodSchemaLine} ${includeZodSchemaLine} data: ${modelName}UpdateInputObjectSchema, where: ${modelName}WhereUniqueInputObjectSchema  })`
                    )}`
                );
            }

            if (updateMany) {
                const imports = [
                    `import { ${modelName}UpdateManyMutationInputObjectSchema } from './objects/${modelName}UpdateManyMutationInput.schema'`,
                    `import { ${modelName}WhereInputObjectSchema } from './objects/${modelName}WhereInput.schema'`,
                ];
                await writeFileSafely(
                    path.join(
                        Transformer.outputPath,
                        `schemas/${updateMany}.schema.ts`
                    ),
                    `${this.generateImportStatements(
                        imports
                    )}${this.generateExportSchemaStatement(
                        `${modelName}UpdateMany`,
                        `z.object({ data: ${modelName}UpdateManyMutationInputObjectSchema, where: ${modelName}WhereInputObjectSchema.optional()  })`
                    )}`
                );
            }

            if (upsertOne) {
                const imports = [
                    selectImport,
                    includeImport,
                    `import { ${modelName}WhereUniqueInputObjectSchema } from './objects/${modelName}WhereUniqueInput.schema'`,
                    `import { ${modelName}CreateInputObjectSchema } from './objects/${modelName}CreateInput.schema'`,
                    `import { ${modelName}UpdateInputObjectSchema } from './objects/${modelName}UpdateInput.schema'`,
                ];
                await writeFileSafely(
                    path.join(
                        Transformer.outputPath,
                        `schemas/${upsertOne}.schema.ts`
                    ),
                    `${this.generateImportStatements(
                        imports
                    )}${this.generateExportSchemaStatement(
                        `${modelName}Upsert`,
                        `z.object({ ${selectZodSchemaLine} ${includeZodSchemaLine} where: ${modelName}WhereUniqueInputObjectSchema, create: ${modelName}CreateInputObjectSchema, update: ${modelName}UpdateInputObjectSchema  })`
                    )}`
                );
            }

            if (aggregate) {
                const imports = [
                    `import { ${modelName}WhereInputObjectSchema } from './objects/${modelName}WhereInput.schema'`,
                    `import { ${modelName}OrderByWithRelationInputObjectSchema } from './objects/${modelName}OrderByWithRelationInput.schema'`,
                    `import { ${modelName}WhereUniqueInputObjectSchema } from './objects/${modelName}WhereUniqueInput.schema'`,
                ];
                const aggregateOperations = [];
                if (this.aggregateOperationSupport[modelName].count) {
                    imports.push(
                        `import { ${modelName}CountAggregateInputObjectSchema } from './objects/${modelName}CountAggregateInput.schema'`
                    );
                    aggregateOperations.push(
                        `_count: z.union([ z.literal(true), ${modelName}CountAggregateInputObjectSchema ]).optional()`
                    );
                }
                if (this.aggregateOperationSupport[modelName].min) {
                    imports.push(
                        `import { ${modelName}MinAggregateInputObjectSchema } from './objects/${modelName}MinAggregateInput.schema'`
                    );
                    aggregateOperations.push(
                        `_min: ${modelName}MinAggregateInputObjectSchema.optional()`
                    );
                }
                if (this.aggregateOperationSupport[modelName].max) {
                    imports.push(
                        `import { ${modelName}MaxAggregateInputObjectSchema } from './objects/${modelName}MaxAggregateInput.schema'`
                    );
                    aggregateOperations.push(
                        `_max: ${modelName}MaxAggregateInputObjectSchema.optional()`
                    );
                }
                if (this.aggregateOperationSupport[modelName].avg) {
                    imports.push(
                        `import { ${modelName}AvgAggregateInputObjectSchema } from './objects/${modelName}AvgAggregateInput.schema'`
                    );
                    aggregateOperations.push(
                        `_avg: ${modelName}AvgAggregateInputObjectSchema.optional()`
                    );
                }
                if (this.aggregateOperationSupport[modelName].sum) {
                    imports.push(
                        `import { ${modelName}SumAggregateInputObjectSchema } from './objects/${modelName}SumAggregateInput.schema'`
                    );
                    aggregateOperations.push(
                        `_sum: ${modelName}SumAggregateInputObjectSchema.optional()`
                    );
                }

                await writeFileSafely(
                    path.join(
                        Transformer.outputPath,
                        `schemas/${aggregate}.schema.ts`
                    ),
                    `${this.generateImportStatements(
                        imports
                    )}${this.generateExportSchemaStatement(
                        `${modelName}Aggregate`,
                        `z.object({ where: ${modelName}WhereInputObjectSchema.optional(), orderBy: z.union([${modelName}OrderByWithRelationInputObjectSchema, ${modelName}OrderByWithRelationInputObjectSchema.array()]).optional(), cursor: ${modelName}WhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), ${aggregateOperations.join(
                            ', '
                        )} })`
                    )}`
                );
            }

            if (groupBy) {
                const imports = [
                    `import { ${modelName}WhereInputObjectSchema } from './objects/${modelName}WhereInput.schema'`,
                    `import { ${modelName}OrderByWithAggregationInputObjectSchema } from './objects/${modelName}OrderByWithAggregationInput.schema'`,
                    `import { ${modelName}ScalarWhereWithAggregatesInputObjectSchema } from './objects/${modelName}ScalarWhereWithAggregatesInput.schema'`,
                    `import { ${modelName}ScalarFieldEnumSchema } from './enums/${modelName}ScalarFieldEnum.schema'`,
                ];
                await writeFileSafely(
                    path.join(
                        Transformer.outputPath,
                        `schemas/${groupBy}.schema.ts`
                    ),
                    `${this.generateImportStatements(
                        imports
                    )}${this.generateExportSchemaStatement(
                        `${modelName}GroupBy`,
                        `z.object({ where: ${modelName}WhereInputObjectSchema.optional(), orderBy: z.union([${modelName}OrderByWithAggregationInputObjectSchema, ${modelName}OrderByWithAggregationInputObjectSchema.array()]), having: ${modelName}ScalarWhereWithAggregatesInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), by: z.array(${modelName}ScalarFieldEnumSchema)  })`
                    )}`
                );
            }
        }
    }

    generateImportStatements(imports: (string | undefined)[]) {
        let generatedImports = this.generateImportZodStatement();
        generatedImports +=
            imports?.filter((importItem) => !!importItem).join(';\r\n') ?? '';
        generatedImports += '\n\n';
        return generatedImports;
    }

    resolveSelectIncludeImportAndZodSchemaLine(model: PrismaDMMF.Model) {
        const { name: modelName } = model;

        const hasRelationToAnotherModel = checkModelHasModelRelation(model);

        const selectImport = Transformer.isGenerateSelect
            ? `import { ${modelName}SelectObjectSchema } from './objects/${modelName}Select.schema'`
            : '';

        const includeImport =
            Transformer.isGenerateInclude && hasRelationToAnotherModel
                ? `import { ${modelName}IncludeObjectSchema } from './objects/${modelName}Include.schema'`
                : '';

        let selectZodSchemaLine = '';
        let includeZodSchemaLine = '';
        let selectZodSchemaLineLazy = '';
        let includeZodSchemaLineLazy = '';

        if (Transformer.isGenerateSelect) {
            const zodSelectObjectSchema = `${modelName}SelectObjectSchema.optional()`;
            selectZodSchemaLine = `select: ${zodSelectObjectSchema},`;
            selectZodSchemaLineLazy = `select: z.lazy(() => ${zodSelectObjectSchema}),`;
        }

        if (Transformer.isGenerateInclude && hasRelationToAnotherModel) {
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
