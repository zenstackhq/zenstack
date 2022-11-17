import { Context, Generator } from '../types';
import { Project, SourceFile } from 'ts-morph';
import * as path from 'path';
import colors from 'colors';
import {
    DataModel,
    DataModelField,
    DataModelFieldAttribute,
    isDataModel,
    isLiteralExpr,
    LiteralExpr,
} from '@lang/generated/ast';

/**
 * Generates field constraint validators (run on both client and server side)
 */
export default class FieldConstraintGenerator implements Generator {
    get name() {
        return 'zod';
    }

    async generate(context: Context): Promise<void> {
        const project = new Project();
        const sf = project.createSourceFile(
            path.join(
                context.generatedCodeDir,
                'src/field-constraint/index.ts'
            ),
            undefined,
            { overwrite: true }
        );

        sf.addStatements([`import { z } from "zod";`]);

        context.schema.declarations
            .filter((d): d is DataModel => isDataModel(d))
            .forEach((model) => {
                this.generateConstraints(sf, model);
            });

        sf.formatText();
        await project.save();

        console.log(colors.blue(`  ✔️ Field constraint validators generated`));
    }

    private generateConstraints(sf: SourceFile, model: DataModel) {
        sf.addStatements(`
            export const ${this.validator(
                model.name,
                'create'
            )}: z.ZodType = z.lazy(() => z.object({
                ${model.fields
                    .map((f) => ({
                        field: f,
                        schema: this.makeFieldValidator(f, 'create'),
                    }))
                    .filter(({ schema }) => !!schema)
                    .map(({ field, schema }) => field.name + ': ' + schema)
                    .join(',\n')}
            }));

            export const ${this.validator(
                model.name,
                'update'
            )}: z.ZodType = z.lazy(() => z.object({
                ${model.fields
                    .map((f) => ({
                        field: f,
                        schema: this.makeFieldValidator(f, 'update'),
                    }))
                    .filter(({ schema }) => !!schema)
                    .map(({ field, schema }) => field.name + ': ' + schema)
                    .join(',\n')}
            }).partial());     
            `);
    }

    private makeFieldValidator(
        field: DataModelField,
        mode: 'create' | 'update'
    ) {
        const baseSchema = this.makeZodSchema(field, mode);
        let zodSchema = baseSchema;

        for (const attr of field.attributes) {
            switch (attr.decl.ref?.name) {
                case '@length': {
                    const min = this.getAttrLiteralArg<number>(attr, 'min');
                    if (min) {
                        zodSchema += `.min(${min})`;
                    }
                    const max = this.getAttrLiteralArg<number>(attr, 'max');
                    if (max) {
                        zodSchema += `.max(${max})`;
                    }
                    break;
                }
                case '@regex': {
                    const expr = this.getAttrLiteralArg<string>(attr, 'regex');
                    if (expr) {
                        zodSchema += `.regex(/${expr}/)`;
                    }
                    break;
                }
                case '@startsWith': {
                    const text = this.getAttrLiteralArg<string>(attr, 'text');
                    if (text) {
                        zodSchema += `.startsWith(${JSON.stringify(text)})`;
                    }
                    break;
                }
                case '@endsWith': {
                    const text = this.getAttrLiteralArg<string>(attr, 'text');
                    if (text) {
                        zodSchema += `.endsWith(${JSON.stringify(text)})`;
                    }
                    break;
                }
                case '@email': {
                    zodSchema += `.email()`;
                    break;
                }
                case '@url': {
                    zodSchema += `.url()`;
                    break;
                }
                case '@datetime': {
                    zodSchema += `.datetime({ offset: true })`;
                    break;
                }
                case '@gt': {
                    const value = this.getAttrLiteralArg<number>(attr, 'value');
                    if (value !== undefined) {
                        zodSchema += `.gt(${value})`;
                    }
                    break;
                }
                case '@gte': {
                    const value = this.getAttrLiteralArg<number>(attr, 'value');
                    if (value !== undefined) {
                        zodSchema += `.gte(${value})`;
                    }
                    break;
                }
                case '@lt': {
                    const value = this.getAttrLiteralArg<number>(attr, 'value');
                    if (value !== undefined) {
                        zodSchema += `.lt(${value})`;
                    }
                    break;
                }
                case '@lte': {
                    const value = this.getAttrLiteralArg<number>(attr, 'value');
                    if (value !== undefined) {
                        zodSchema += `.lte(${value})`;
                    }
                    break;
                }
            }
        }

        if (
            !isDataModel(field.type.reference?.ref) &&
            zodSchema === baseSchema
        ) {
            return undefined;
        }

        if (field.type.optional) {
            zodSchema = this.optional(zodSchema);
        }

        return zodSchema;
    }

    private getAttrLiteralArg<T extends string | number>(
        attr: DataModelFieldAttribute,
        paramName: string
    ) {
        const arg = attr.args.find(
            (arg) => arg.$resolvedParam?.name === paramName
        );
        if (!arg || !isLiteralExpr(arg.value)) {
            return undefined;
        }
        return (arg.value as LiteralExpr).value as T;
    }

    private makeZodSchema(field: DataModelField, mode: 'create' | 'update') {
        const type = field.type;
        let schema = '';
        if (type.reference && isDataModel(type.reference.ref)) {
            const modelType = type.reference.ref.name;
            const create = this.validator(modelType, 'create');
            const update = this.validator(modelType, 'update');

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let fields: any = {
                create: this.optional(this.enumerable(create)),
                createMany: this.optional(this.enumerable(create)),
                connectOrCreate: this.optional(
                    this.enumerable(this.object({ create }))
                ),
            };

            if (mode === 'update') {
                fields = {
                    ...fields,
                    update: this.optional(
                        this.enumerable(
                            type.array ? this.object({ data: update }) : update
                        )
                    ),
                    updateMany: this.optional(
                        this.enumerable(this.object({ data: update }))
                    ),
                    upsert: this.optional(
                        this.enumerable(
                            this.object({
                                create,
                                update,
                            })
                        )
                    ),
                };
            }

            schema = this.optional(this.object(fields));
        } else {
            switch (type.type) {
                case 'Int':
                case 'Float':
                case 'Decimal':
                    schema = 'z.number()';
                    break;
                case 'BigInt':
                    schema = 'z.bigint()';
                    break;
                case 'String':
                    schema = 'z.string()';
                    break;
                case 'Boolean':
                    schema = 'z.boolean()';
                    break;
                case 'DateTime':
                    schema = 'z.date()';
                    break;
                default:
                    schema = 'z.any()';
                    break;
            }

            if (type.array) {
                schema = this.array(schema);
            }
        }

        return schema;
    }

    private union(...schemas: string[]) {
        return `z.union([${schemas.join(', ')}])`;
    }

    private optional(schema: string) {
        return `z.optional(${schema})`;
    }

    private array(schema: string) {
        return `z.array(${schema})`;
    }

    private enumerable(schema: string) {
        return this.union(schema, this.array(schema));
    }

    private object(fields: Record<string, string>) {
        return `z.object({ ${Object.entries(fields)
            .map(([k, v]) => k + ': ' + v)
            .join(',\n')} })`;
    }

    private validator(modelName: string, mode: 'create' | 'update') {
        return `${modelName}_${mode}_validator`;
    }
}
