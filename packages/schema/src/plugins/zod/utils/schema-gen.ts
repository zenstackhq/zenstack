import {
    ExpressionContext,
    PluginError,
    TypeScriptExpressionTransformer,
    TypeScriptExpressionTransformerError,
    getAttributeArg,
    getAttributeArgLiteral,
    getLiteral,
    isDataModelFieldReference,
    isFromStdlib,
} from '@zenstackhq/sdk';
import {
    DataModel,
    DataModelField,
    DataModelFieldAttribute,
    isDataModel,
    isEnum,
    isInvocationExpr,
    isNumberLiteral,
    isStringLiteral,
} from '@zenstackhq/sdk/ast';
import { upperCaseFirst } from 'upper-case-first';
import { name } from '..';
import { isDefaultWithAuth } from '../../enhancer/enhancer-utils';

export function makeFieldSchema(field: DataModelField) {
    if (isDataModel(field.type.reference?.ref)) {
        if (field.type.array) {
            // array field is always optional
            return `z.array(z.unknown()).optional()`;
        } else {
            return field.type.optional ? `z.record(z.unknown()).optional()` : `z.record(z.unknown())`;
        }
    }

    let schema = makeZodSchema(field);
    const isDecimal = field.type.type === 'Decimal';

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
            case '@trim': {
                schema += `.trim()`;
                break;
            }
            case '@lower': {
                schema += `.toLowerCase()`;
                break;
            }
            case '@upper': {
                schema += `.toUpperCase()`;
                break;
            }
            case '@db.Uuid': {
                schema += `.uuid()`;
                break;
            }
            case '@datetime': {
                schema += `.datetime({ offset: true${message ? ', message: ' + JSON.stringify(message) : ''} })`;
                break;
            }
            case '@gt': {
                const value = getAttrLiteralArg<number>(attr, 'value');
                if (value !== undefined) {
                    schema += isDecimal ? refineDecimal('gt', value, messageArg) : `.gt(${value}${messageArg})`;
                }
                break;
            }
            case '@gte': {
                const value = getAttrLiteralArg<number>(attr, 'value');
                if (value !== undefined) {
                    schema += isDecimal ? refineDecimal('gte', value, messageArg) : `.gte(${value}${messageArg})`;
                }
                break;
            }
            case '@lt': {
                const value = getAttrLiteralArg<number>(attr, 'value');
                if (value !== undefined) {
                    schema += isDecimal ? refineDecimal('lt', value, messageArg) : `.lt(${value}${messageArg})`;
                }
                break;
            }
            case '@lte': {
                const value = getAttrLiteralArg<number>(attr, 'value');
                if (value !== undefined) {
                    schema += isDecimal ? refineDecimal('lte', value, messageArg) : `.lte(${value}${messageArg})`;
                }
                break;
            }
        }
    }

    if (field.attributes.some(isDefaultWithAuth)) {
        if (field.type.optional) {
            schema += '.nullish()';
        } else {
            // field uses `auth()` in `@default()`, this was transformed into a pseudo default
            // value, while compiling to zod we should turn it into an optional field instead
            // of `.default()`
            schema += '.optional()';
        }
    } else {
        const schemaDefault = getFieldSchemaDefault(field);
        if (schemaDefault !== undefined) {
            if (field.type.type === 'BigInt') {
                // we can't use the `n` BigInt literal notation, since it needs
                // ES2020 or later, which TypeScript doesn't use by default
                schema += `.default(BigInt("${schemaDefault}"))`;
            } else {
                schema += `.default(${schemaDefault})`;
            }
        }

        if (field.type.optional) {
            schema += '.nullish()';
        }
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
                schema = 'z.number()';
                break;
            case 'Decimal':
                schema = 'DecimalSchema';
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
                schema = 'z.coerce.date()';
                break;
            case 'Bytes':
                schema = 'z.union([z.string(), z.custom<Buffer | Uint8Array>(data => data instanceof Uint8Array)])';
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
                let expr = new TypeScriptExpressionTransformer({
                    context: ExpressionContext.ValidationRule,
                    fieldReferenceContext: 'value',
                }).transform(valueArg);

                if (isDataModelFieldReference(valueArg)) {
                    // if the expression is a simple field reference, treat undefined
                    // as true since the all fields are optional in validation context
                    expr = `${expr} ?? true`;
                }

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

function refineDecimal(op: 'gt' | 'gte' | 'lt' | 'lte', value: number, messageArg: string) {
    return `.refine(v => {
        try {
            return new Decimal(v.toString()).${op}(${value});
        } catch {
            return false;
        }
    }${messageArg})`;
}

export function getFieldSchemaDefault(field: DataModelField) {
    const attr = field.attributes.find((attr) => attr.decl.ref?.name === '@default');
    if (!attr) {
        return undefined;
    }
    const arg = attr.args.find((arg) => arg.$resolvedParam?.name === 'value');
    if (arg) {
        if (isStringLiteral(arg.value)) {
            return JSON.stringify(arg.value.value);
        } else if (isNumberLiteral(arg.value)) {
            return arg.value.value;
        } else if (
            isInvocationExpr(arg.value) &&
            isFromStdlib(arg.value.function.ref!) &&
            arg.value.function.$refText === 'now'
        ) {
            return `() => new Date()`;
        }
    }

    return undefined;
}
