/* eslint-disable @typescript-eslint/ban-ts-comment */
import type { DMMF as PrismaDMMF } from '@prisma/generator-helper';
import { AUXILIARY_FIELDS, getPrismaClientImportSpec } from '@zenstackhq/sdk';
import { Model } from '@zenstackhq/sdk/ast';
import { checkModelHasModelRelation, findModelByName, isAggregateInputType } from '@zenstackhq/sdk/dmmf-helpers';
import indentString from '@zenstackhq/sdk/utils';
import path from 'path';
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
    private zmodel: Model;

    constructor(params: TransformerParams) {
        this.name = params.name ?? '';
        this.fields = params.fields ?? [];
        this.models = params.models ?? [];
        this.modelOperations = params.modelOperations ?? [];
        this.aggregateOperationSupport = params.aggregateOperationSupport ?? {};
        this.enumTypes = params.enumTypes ?? [];
        this.zmodel = params.zmodel;
    }

    static setOutputPath(outPath: string) {
        this.outputPath = outPath;
    }

    static getOutputPath() {
        return this.outputPath;
    }

    async generateEnumSchemas() {
        for (const enumType of this.enumTypes) {
            const { name, values } = enumType;
            const filteredValues = values.filter((v) => !AUXILIARY_FIELDS.includes(v));

            await writeFileSafely(
                path.join(Transformer.outputPath, `schemas/enums/${name}.schema.ts`),
                `/* eslint-disable */\n${this.generateImportZodStatement()}\n${this.generateExportSchemaStatement(
                    `${name}`,
                    `z.enum(${JSON.stringify(filteredValues)})`
                )}`
            );
        }

        await writeFileSafely(
            path.join(Transformer.outputPath, `schemas/enums/index.ts`),
            this.enumTypes.map((enumType) => `export * from './${enumType.name}.schema';`).join('\n')
        );
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

        await writeFileSafely(
            path.join(Transformer.outputPath, `schemas/objects/${this.name}.schema.ts`),
            '/* eslint-disable */\n' + objectSchema
        );
        return `${this.name}.schema`;
    }

    generateObjectSchemaFields() {
        const zodObjectSchemaFields = this.fields
            .filter((field) => !AUXILIARY_FIELDS.includes(field.name))
            .map((field) => this.generateObjectSchemaField(field))
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

    generateObjectSchemaField(field: PrismaDMMF.SchemaArg): [string, PrismaDMMF.SchemaArg, boolean][] {
        const lines = field.inputTypes;

        if (lines.length === 0) {
            return [];
        }

        let alternatives = lines.reduce<string[]>((result, inputType) => {
            if (inputType.type === 'String') {
                result.push(this.wrapWithZodValidators('z.string()', field, inputType));
            } else if (inputType.type === 'Int' || inputType.type === 'Float' || inputType.type === 'Decimal') {
                result.push(this.wrapWithZodValidators('z.number()', field, inputType));
            } else if (inputType.type === 'BigInt') {
                result.push(this.wrapWithZodValidators('z.bigint()', field, inputType));
            } else if (inputType.type === 'Boolean') {
                result.push(this.wrapWithZodValidators('z.boolean()', field, inputType));
            } else if (inputType.type === 'DateTime') {
                result.push(this.wrapWithZodValidators(['z.date()', 'z.string().datetime()'], field, inputType));
            } else if (inputType.type === 'Bytes') {
                result.push(this.wrapWithZodValidators('z.number().array()', field, inputType));
            } else if (inputType.type === 'Json') {
                this.hasJson = true;
                result.push(this.wrapWithZodValidators('jsonSchema', field, inputType));
            } else if (inputType.type === 'True') {
                result.push(this.wrapWithZodValidators('z.literal(true)', field, inputType));
            } else {
                const isEnum = inputType.location === 'enumTypes';

                if (inputType.namespace === 'prisma' || isEnum) {
                    if (inputType.type !== this.name && typeof inputType.type === 'string') {
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
        this.schemaImports.add(name);
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
            : `${inputType.type}ObjectSchema`;
        const enumSchemaLine = `${inputType.type}Schema`;

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

        if (isAggregateInputType(name)) {
            name = `${name}Type`;
        }
        const end = `export const ${this.name}ObjectSchema = Schema`;
        return `const Schema: z.ZodType<Omit<Prisma.${name}, ${AUXILIARY_FIELDS.map((f) => "'" + f + "'").join(
            '|'
        )}>> = ${schema};\n\n ${end}`;
    }

    addFinalWrappers({ zodStringFields }: { zodStringFields: string[] }) {
        const fields = [...zodStringFields];

        return this.wrapWithZodObject(fields) + '.strict()';
    }

    generateImportPrismaStatement() {
        const importingFrom = path.resolve(Transformer.outputPath, 'schemas', 'objects');
        const prismaClientImportPath = getPrismaClientImportSpec(this.zmodel, importingFrom);
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
                const { isModelQueryType, modelName } = this.checkIsModelQueryType(name);
                if (isModelQueryType) {
                    return `import { ${modelName}Schema } from '../${modelName}.schema'`;
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
        const modelNameCapitalized = modelName.charAt(0).toUpperCase() + modelName.slice(1);
        return `${modelNameCapitalized}Schema.${queryName}`;
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

    async generateModelSchemas() {
        const globalExports: string[] = [];

        for (const modelOperation of this.modelOperations) {
            const {
                model: modelName,
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

            globalExports.push(`export { ${modelName}Schema as ${modelName} } from './${modelName}.schema'`);

            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const model = findModelByName(this.models, modelName)!;

            const { selectImport, includeImport, selectZodSchemaLineLazy, includeZodSchemaLineLazy } =
                this.resolveSelectIncludeImportAndZodSchemaLine(model);

            let imports = [`import { z } from 'zod'`, selectImport, includeImport];
            let codeBody = '';

            if (findUnique) {
                imports.push(
                    `import { ${modelName}WhereUniqueInputObjectSchema } from './objects/${modelName}WhereUniqueInput.schema'`
                );
                codeBody += `findUnique: z.object({ ${selectZodSchemaLineLazy} ${includeZodSchemaLineLazy} where: ${modelName}WhereUniqueInputObjectSchema }),`;
            }

            if (findFirst) {
                imports.push(
                    `import { ${modelName}WhereInputObjectSchema } from './objects/${modelName}WhereInput.schema'`,
                    `import { ${modelName}OrderByWithRelationInputObjectSchema } from './objects/${modelName}OrderByWithRelationInput.schema'`,
                    `import { ${modelName}WhereUniqueInputObjectSchema } from './objects/${modelName}WhereUniqueInput.schema'`,
                    `import { ${modelName}ScalarFieldEnumSchema } from './enums/${modelName}ScalarFieldEnum.schema'`
                );
                codeBody += `findFirst: z.object({ ${selectZodSchemaLineLazy} ${includeZodSchemaLineLazy} where: ${modelName}WhereInputObjectSchema.optional(), orderBy: z.union([${modelName}OrderByWithRelationInputObjectSchema, ${modelName}OrderByWithRelationInputObjectSchema.array()]).optional(), cursor: ${modelName}WhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), distinct: z.array(${modelName}ScalarFieldEnumSchema).optional() }),`;
            }

            if (findMany) {
                imports.push(
                    `import { ${modelName}WhereInputObjectSchema } from './objects/${modelName}WhereInput.schema'`,
                    `import { ${modelName}OrderByWithRelationInputObjectSchema } from './objects/${modelName}OrderByWithRelationInput.schema'`,
                    `import { ${modelName}WhereUniqueInputObjectSchema } from './objects/${modelName}WhereUniqueInput.schema'`,
                    `import { ${modelName}ScalarFieldEnumSchema } from './enums/${modelName}ScalarFieldEnum.schema'`
                );
                codeBody += `findMany: z.object({ ${selectZodSchemaLineLazy} ${includeZodSchemaLineLazy} where: ${modelName}WhereInputObjectSchema.optional(), orderBy: z.union([${modelName}OrderByWithRelationInputObjectSchema, ${modelName}OrderByWithRelationInputObjectSchema.array()]).optional(), cursor: ${modelName}WhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), distinct: z.array(${modelName}ScalarFieldEnumSchema).optional()  }),`;
            }

            if (createOne) {
                imports.push(
                    `import { ${modelName}CreateInputObjectSchema } from './objects/${modelName}CreateInput.schema'`,
                    `import { ${modelName}UncheckedCreateInputObjectSchema } from './objects/${modelName}UncheckedCreateInput.schema'`
                );
                codeBody += `create: z.object({ ${selectZodSchemaLineLazy} ${includeZodSchemaLineLazy} data: z.union([${modelName}CreateInputObjectSchema, ${modelName}UncheckedCreateInputObjectSchema]) }),`;
            }

            if (createMany) {
                imports.push(
                    `import { ${modelName}CreateManyInputObjectSchema } from './objects/${modelName}CreateManyInput.schema'`
                );
                codeBody += `createMany: z.object({ data: z.union([${modelName}CreateManyInputObjectSchema, z.array(${modelName}CreateManyInputObjectSchema)]) }),`;
            }

            if (deleteOne) {
                imports.push(
                    `import { ${modelName}WhereUniqueInputObjectSchema } from './objects/${modelName}WhereUniqueInput.schema'`
                );
                codeBody += `'delete': z.object({ ${selectZodSchemaLineLazy} ${includeZodSchemaLineLazy} where: ${modelName}WhereUniqueInputObjectSchema  }),`;
            }

            if (deleteMany) {
                imports.push(
                    `import { ${modelName}WhereInputObjectSchema } from './objects/${modelName}WhereInput.schema'`
                );
                codeBody += `deleteMany: z.object({ where: ${modelName}WhereInputObjectSchema.optional()  }),`;
            }

            if (updateOne) {
                imports.push(
                    `import { ${modelName}UpdateInputObjectSchema } from './objects/${modelName}UpdateInput.schema'`,
                    `import { ${modelName}UncheckedUpdateInputObjectSchema } from './objects/${modelName}UncheckedUpdateInput.schema'`,
                    `import { ${modelName}WhereUniqueInputObjectSchema } from './objects/${modelName}WhereUniqueInput.schema'`
                );
                codeBody += `update: z.object({ ${selectZodSchemaLineLazy} ${includeZodSchemaLineLazy} data: z.union([${modelName}UpdateInputObjectSchema, ${modelName}UncheckedUpdateInputObjectSchema]), where: ${modelName}WhereUniqueInputObjectSchema  }),`;
            }

            if (updateMany) {
                imports.push(
                    `import { ${modelName}UpdateManyMutationInputObjectSchema } from './objects/${modelName}UpdateManyMutationInput.schema'`,
                    `import { ${modelName}UncheckedUpdateManyInputObjectSchema } from './objects/${modelName}UncheckedUpdateManyInput.schema'`,
                    `import { ${modelName}WhereInputObjectSchema } from './objects/${modelName}WhereInput.schema'`
                );
                codeBody += `updateMany: z.object({ data: z.union([${modelName}UpdateManyMutationInputObjectSchema, ${modelName}UncheckedUpdateManyInputObjectSchema]), where: ${modelName}WhereInputObjectSchema.optional()  }),`;
            }

            if (upsertOne) {
                imports.push(
                    `import { ${modelName}WhereUniqueInputObjectSchema } from './objects/${modelName}WhereUniqueInput.schema'`,
                    `import { ${modelName}CreateInputObjectSchema } from './objects/${modelName}CreateInput.schema'`,
                    `import { ${modelName}UncheckedCreateInputObjectSchema } from './objects/${modelName}UncheckedCreateInput.schema'`,
                    `import { ${modelName}UpdateInputObjectSchema } from './objects/${modelName}UpdateInput.schema'`,
                    `import { ${modelName}UncheckedUpdateInputObjectSchema } from './objects/${modelName}UncheckedUpdateInput.schema'`
                );
                codeBody += `upsert: z.object({ ${selectZodSchemaLineLazy} ${includeZodSchemaLineLazy} where: ${modelName}WhereUniqueInputObjectSchema, create: z.union([${modelName}CreateInputObjectSchema, ${modelName}UncheckedCreateInputObjectSchema]), update: z.union([${modelName}UpdateInputObjectSchema, ${modelName}UncheckedUpdateInputObjectSchema]) }),`;
            }

            if (aggregate) {
                imports.push(
                    `import { ${modelName}WhereInputObjectSchema } from './objects/${modelName}WhereInput.schema'`,
                    `import { ${modelName}OrderByWithRelationInputObjectSchema } from './objects/${modelName}OrderByWithRelationInput.schema'`,
                    `import { ${modelName}WhereUniqueInputObjectSchema } from './objects/${modelName}WhereUniqueInput.schema'`
                );
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
                    aggregateOperations.push(`_min: ${modelName}MinAggregateInputObjectSchema.optional()`);
                }
                if (this.aggregateOperationSupport[modelName].max) {
                    imports.push(
                        `import { ${modelName}MaxAggregateInputObjectSchema } from './objects/${modelName}MaxAggregateInput.schema'`
                    );
                    aggregateOperations.push(`_max: ${modelName}MaxAggregateInputObjectSchema.optional()`);
                }
                if (this.aggregateOperationSupport[modelName].avg) {
                    imports.push(
                        `import { ${modelName}AvgAggregateInputObjectSchema } from './objects/${modelName}AvgAggregateInput.schema'`
                    );
                    aggregateOperations.push(`_avg: ${modelName}AvgAggregateInputObjectSchema.optional()`);
                }
                if (this.aggregateOperationSupport[modelName].sum) {
                    imports.push(
                        `import { ${modelName}SumAggregateInputObjectSchema } from './objects/${modelName}SumAggregateInput.schema'`
                    );
                    aggregateOperations.push(`_sum: ${modelName}SumAggregateInputObjectSchema.optional()`);
                }

                codeBody += `aggregate: z.object({ where: ${modelName}WhereInputObjectSchema.optional(), orderBy: z.union([${modelName}OrderByWithRelationInputObjectSchema, ${modelName}OrderByWithRelationInputObjectSchema.array()]).optional(), cursor: ${modelName}WhereUniqueInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), ${aggregateOperations.join(
                    ', '
                )} }),`;
            }

            if (groupBy) {
                imports.push(
                    `import { ${modelName}WhereInputObjectSchema } from './objects/${modelName}WhereInput.schema'`,
                    `import { ${modelName}OrderByWithAggregationInputObjectSchema } from './objects/${modelName}OrderByWithAggregationInput.schema'`,
                    `import { ${modelName}ScalarWhereWithAggregatesInputObjectSchema } from './objects/${modelName}ScalarWhereWithAggregatesInput.schema'`,
                    `import { ${modelName}ScalarFieldEnumSchema } from './enums/${modelName}ScalarFieldEnum.schema'`
                );
                codeBody += `groupBy: z.object({ where: ${modelName}WhereInputObjectSchema.optional(), orderBy: z.union([${modelName}OrderByWithAggregationInputObjectSchema, ${modelName}OrderByWithAggregationInputObjectSchema.array()]), having: ${modelName}ScalarWhereWithAggregatesInputObjectSchema.optional(), take: z.number().optional(), skip: z.number().optional(), by: z.array(${modelName}ScalarFieldEnumSchema)  }),`;
            }

            imports = [...new Set(imports)];

            await writeFileSafely(
                path.join(Transformer.outputPath, `schemas/${modelName}.schema.ts`),
                `
/* eslint-disable */
${imports.join(';\n')}

export const ${modelName}Schema = {
${indentString(codeBody, 4)}
};
            `
            );
        }

        await writeFileSafely(
            path.join(Transformer.outputPath, 'schemas/index.ts'),
            `
/* eslint-disable */
${globalExports.join(';\n')}
`
        );
    }

    generateImportStatements(imports: (string | undefined)[]) {
        let generatedImports = this.generateImportZodStatement();
        generatedImports += imports?.filter((importItem) => !!importItem).join(';\r\n') ?? '';
        generatedImports += '\n\n';
        return generatedImports;
    }

    resolveSelectIncludeImportAndZodSchemaLine(model: PrismaDMMF.Model) {
        const { name: modelName } = model;

        const hasRelationToAnotherModel = checkModelHasModelRelation(model);

        const selectImport = `import { ${modelName}SelectObjectSchema } from './objects/${modelName}Select.schema'`;

        const includeImport = hasRelationToAnotherModel
            ? `import { ${modelName}IncludeObjectSchema } from './objects/${modelName}Include.schema'`
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
