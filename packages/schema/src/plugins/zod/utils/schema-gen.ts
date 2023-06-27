import { getLiteral, hasAttribute } from '@zenstackhq/sdk';
import { DataModelField, DataModelFieldAttribute, isEnum } from '@zenstackhq/sdk/ast';
import { upperCaseFirst } from 'upper-case-first';

export function makeFieldSchema(field: DataModelField, optionalIfDefault = false) {
    let schema = makeZodSchema(field);

    // translate field constraint attributes to zod schema
    const hasDefault = hasAttribute(field, '@default') || hasAttribute(field, '@updatedAt');

    for (const attr of field.attributes) {
        switch (attr.decl.ref?.name) {
            case '@length': {
                const min = getAttrLiteralArg<number>(attr, 'min');
                if (min) {
                    schema += `.min(${min})`;
                }
                const max = getAttrLiteralArg<number>(attr, 'max');
                if (max) {
                    schema += `.max(${max})`;
                }
                break;
            }
            case '@regex': {
                const expr = getAttrLiteralArg<string>(attr, 'regex');
                if (expr) {
                    schema += `.regex(/${expr}/)`;
                }
                break;
            }
            case '@startsWith': {
                const text = getAttrLiteralArg<string>(attr, 'text');
                if (text) {
                    schema += `.startsWith(${JSON.stringify(text)})`;
                }
                break;
            }
            case '@endsWith': {
                const text = getAttrLiteralArg<string>(attr, 'text');
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
                const value = getAttrLiteralArg<number>(attr, 'value');
                if (value !== undefined) {
                    schema += `.gt(${value})`;
                }
                break;
            }
            case '@gte': {
                const value = getAttrLiteralArg<number>(attr, 'value');
                if (value !== undefined) {
                    schema += `.gte(${value})`;
                }
                break;
            }
            case '@lt': {
                const value = getAttrLiteralArg<number>(attr, 'value');
                if (value !== undefined) {
                    schema += `.lt(${value})`;
                }
                break;
            }
            case '@lte': {
                const value = getAttrLiteralArg<number>(attr, 'value');
                if (value !== undefined) {
                    schema += `.lte(${value})`;
                }
                break;
            }
        }
    }

    if (field.type.optional) {
        schema += '.nullish()';
    } else if (optionalIfDefault && hasDefault) {
        schema += '.optional()';
    }

    return schema;
}

function makeZodSchema(field: DataModelField) {
    let schema: string;

    if (field.type.reference?.ref && isEnum(field.type.reference?.ref)) {
        schema = `${upperCaseFirst(field.type.reference.ref.name)}Schema`;
    } else {
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
            case 'Bytes':
                schema = 'z.number().array()';
                break;
            default:
                schema = 'z.any()';
                break;
        }
    }

    if (field.type.array) {
        schema = `z.array(${schema})`;
    }

    return schema;
}

function getAttrLiteralArg<T extends string | number>(attr: DataModelFieldAttribute, paramName: string) {
    const arg = attr.args.find((arg) => arg.$resolvedParam?.name === paramName);
    return arg && getLiteral<T>(arg.value);
}
