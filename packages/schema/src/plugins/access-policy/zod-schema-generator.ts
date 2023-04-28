import { DataModel, DataModelField, DataModelFieldAttribute, isDataModelField } from '@zenstackhq/language/ast';
import { AUXILIARY_FIELDS, VALIDATION_ATTRIBUTES, getLiteral } from '@zenstackhq/sdk';
import { camelCase } from 'change-case';
import { CodeBlockWriter } from 'ts-morph';

/**
 * Writes Zod schema for data models.
 */
export class ZodSchemaGenerator {
    generate(writer: CodeBlockWriter, models: DataModel[]) {
        let generated = false;
        writer.inlineBlock(() => {
            models.forEach((model) => {
                const fields = model.fields.filter(
                    (field) =>
                        !AUXILIARY_FIELDS.includes(field.name) &&
                        // scalar fields only
                        !isDataModelField(field.type.reference?.ref) &&
                        this.hasValidationAttributes(field)
                );

                if (fields.length === 0) {
                    return;
                }

                generated = true;
                writer.write(`${camelCase(model.name)}: z.object(`);
                writer.inlineBlock(() => {
                    fields.forEach((field) => {
                        writer.writeLine(`${field.name}: ${this.makeFieldValidator(field)},`);
                    });
                });
                writer.writeLine(').partial(),');
            });
        });
        return generated;
    }

    private hasValidationAttributes(field: DataModelField) {
        return field.attributes.some((attr) => VALIDATION_ATTRIBUTES.includes(attr.decl.$refText));
    }

    private makeFieldValidator(field: DataModelField) {
        let schema = this.makeZodSchema(field);
        // translate field constraint attributes to zod schema
        for (const attr of field.attributes) {
            switch (attr.decl.ref?.name) {
                case '@length': {
                    const min = this.getAttrLiteralArg<number>(attr, 'min');
                    if (min) {
                        schema += `.min(${min})`;
                    }
                    const max = this.getAttrLiteralArg<number>(attr, 'max');
                    if (max) {
                        schema += `.max(${max})`;
                    }
                    break;
                }
                case '@regex': {
                    const expr = this.getAttrLiteralArg<string>(attr, 'regex');
                    if (expr) {
                        schema += `.regex(/${expr}/)`;
                    }
                    break;
                }
                case '@startsWith': {
                    const text = this.getAttrLiteralArg<string>(attr, 'text');
                    if (text) {
                        schema += `.startsWith(${JSON.stringify(text)})`;
                    }
                    break;
                }
                case '@endsWith': {
                    const text = this.getAttrLiteralArg<string>(attr, 'text');
                    if (text) {
                        schema += `.endsWith(${JSON.stringify(text)})`;
                    }
                    break;
                }
                case '@email': {
                    schema += `.email()`;
                    break;
                }
                case '@url': {
                    schema += `.url()`;
                    break;
                }
                case '@datetime': {
                    schema += `.datetime({ offset: true })`;
                    break;
                }
                case '@gt': {
                    const value = this.getAttrLiteralArg<number>(attr, 'value');
                    if (value !== undefined) {
                        schema += `.gt(${value})`;
                    }
                    break;
                }
                case '@gte': {
                    const value = this.getAttrLiteralArg<number>(attr, 'value');
                    if (value !== undefined) {
                        schema += `.gte(${value})`;
                    }
                    break;
                }
                case '@lt': {
                    const value = this.getAttrLiteralArg<number>(attr, 'value');
                    if (value !== undefined) {
                        schema += `.lt(${value})`;
                    }
                    break;
                }
                case '@lte': {
                    const value = this.getAttrLiteralArg<number>(attr, 'value');
                    if (value !== undefined) {
                        schema += `.lte(${value})`;
                    }
                    break;
                }
            }
        }

        if (field.type.optional) {
            schema += '.nullable()';
        }

        return schema;
    }

    private makeZodSchema(field: DataModelField) {
        let schema: string;
        switch (field.type.type) {
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

        if (field.type.array) {
            schema = `z.array(${schema})`;
        }

        return schema;
    }

    private getAttrLiteralArg<T extends string | number>(attr: DataModelFieldAttribute, paramName: string) {
        const arg = attr.args.find((arg) => arg.$resolvedParam?.name === paramName);
        return arg && getLiteral<T>(arg.value);
    }
}
