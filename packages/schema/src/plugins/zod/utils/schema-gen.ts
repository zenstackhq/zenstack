import { PluginError, getAttributeArg, getAttributeArgLiteral, getLiteral } from '@zenstackhq/sdk';
import { DataModel, DataModelField, DataModelFieldAttribute, isEnum } from '@zenstackhq/sdk/ast';
import { upperCaseFirst } from 'upper-case-first';
import { name } from '..';
import TypeScriptExpressionTransformer, {
    TypeScriptExpressionTransformerError,
} from '../../../utils/typescript-expression-transformer';

export function makeFieldSchema(field: DataModelField) {
    let schema = makeZodSchema(field);

    for (const attr of field.attributes) {
        const message = getAttrLiteralArg<string>(attr, 'message');
        const messageArg = message ? `, { message: ${JSON.stringify(message)} }` : '';
        const messageArgFirst = message ? `{ message: ${JSON.stringify(message)} }` : '';

        switch (attr.decl.ref?.name) {
            case '@length': {
                const min = getAttrLiteralArg<number>(attr, 'min');
                if (min) {
                    schema += `.min(${min}${messageArg})`;
                }
                const max = getAttrLiteralArg<number>(attr, 'max');
                if (max) {
                    schema += `.max(${max}${messageArg})`;
                }
                break;
            }
            case '@contains': {
                const expr = getAttrLiteralArg<string>(attr, 'text');
                if (expr) {
                    schema += `.includes(${JSON.stringify(expr)}${messageArg})`;
                }
                break;
            }
            case '@regex': {
                const expr = getAttrLiteralArg<string>(attr, 'regex');
                if (expr) {
                    schema += `.regex(new RegExp(${JSON.stringify(expr)})${messageArg})`;
                }
                break;
            }
            case '@startsWith': {
                const text = getAttrLiteralArg<string>(attr, 'text');
                if (text) {
                    schema += `.startsWith(${JSON.stringify(text)}${messageArg})`;
                }
                break;
            }
            case '@endsWith': {
                const text = getAttrLiteralArg<string>(attr, 'text');
                if (text) {
                    schema += `.endsWith(${JSON.stringify(text)}${messageArg})`;
                }
                break;
            }
            case '@email': {
                schema += `.email(${messageArgFirst})`;
                break;
            }
            case '@url': {
                schema += `.url(${messageArgFirst})`;
                break;
            }
            case '@datetime': {
                schema += `.datetime({ offset: true${message ? ', message: ' + JSON.stringify(message) : ''} })`;
                break;
            }
            case '@gt': {
                const value = getAttrLiteralArg<number>(attr, 'value');
                if (value !== undefined) {
                    schema += `.gt(${value}${messageArg})`;
                }
                break;
            }
            case '@gte': {
                const value = getAttrLiteralArg<number>(attr, 'value');
                if (value !== undefined) {
                    schema += `.gte(${value}${messageArg})`;
                }
                break;
            }
            case '@lt': {
                const value = getAttrLiteralArg<number>(attr, 'value');
                if (value !== undefined) {
                    schema += `.lt(${value}${messageArg})`;
                }
                break;
            }
            case '@lte': {
                const value = getAttrLiteralArg<number>(attr, 'value');
                if (value !== undefined) {
                    schema += `.lte(${value}${messageArg})`;
                }
                break;
            }
        }
    }

    if (field.type.optional) {
        schema += '.nullish()';
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

export function makeValidationRefinements(model: DataModel) {
    const attrs = model.attributes.filter((attr) => attr.decl.ref?.name === '@@validate');
    const refinements = attrs
        .map((attr) => {
            const valueArg = getAttributeArg(attr, 'value');
            if (!valueArg) {
                return undefined;
            }

            const messageArg = getAttributeArgLiteral<string>(attr, 'message');
            const message = messageArg ? `, { message: ${JSON.stringify(messageArg)} }` : '';

            try {
                const expr = new TypeScriptExpressionTransformer({ fieldReferenceContext: 'value' }).transform(
                    valueArg
                );
                return `.refine((value: any) => ${expr}${message})`;
            } catch (err) {
                if (err instanceof TypeScriptExpressionTransformerError) {
                    throw new PluginError(name, err.message);
                } else {
                    throw err;
                }
            }
        })
        .filter((r) => !!r);

    return refinements;
}

function getAttrLiteralArg<T extends string | number>(attr: DataModelFieldAttribute, paramName: string) {
    const arg = attr.args.find((arg) => arg.$resolvedParam?.name === paramName);
    return arg && getLiteral<T>(arg.value);
}
