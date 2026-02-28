import {
    ExpressionUtils,
    type AttributeApplication,
    type BinaryExpression,
    type CallExpression,
    type Expression,
    type FieldExpression,
    type MemberExpression,
    type UnaryExpression,
} from '@zenstackhq/schema';
import Decimal from 'decimal.js';
import { z } from 'zod';
import { SchemaFactoryError } from './error';

function getArgValue<T extends string | number | boolean>(expr: Expression | undefined): T | undefined {
    if (!expr || !ExpressionUtils.isLiteral(expr)) {
        return undefined;
    }
    return expr.value as T;
}

export function addStringValidation(
    schema: z.ZodString,
    attributes: readonly AttributeApplication[] | undefined,
): z.ZodSchema {
    if (!attributes || attributes.length === 0) {
        return schema;
    }

    let result = schema;
    for (const attr of attributes) {
        switch (attr.name) {
            case '@length': {
                const min = getArgValue<number>(attr.args?.[0]?.value);
                if (min !== undefined) {
                    result = result.min(min);
                }
                const max = getArgValue<number>(attr.args?.[1]?.value);
                if (max !== undefined) {
                    result = result.max(max);
                }
                break;
            }
            case '@startsWith': {
                const value = getArgValue<string>(attr.args?.[0]?.value);
                if (value !== undefined) {
                    result = result.startsWith(value);
                }
                break;
            }
            case '@endsWith': {
                const value = getArgValue<string>(attr.args?.[0]?.value);
                if (value !== undefined) {
                    result = result.endsWith(value);
                }
                break;
            }
            case '@contains': {
                const value = getArgValue<string>(attr.args?.[0]?.value);
                if (value !== undefined) {
                    result = result.includes(value);
                }
                break;
            }
            case '@regex': {
                const pattern = getArgValue<string>(attr.args?.[0]?.value);
                if (pattern !== undefined) {
                    result = result.regex(new RegExp(pattern));
                }
                break;
            }
            case '@email':
                result = result.email();
                break;
            case '@datetime':
                result = result.datetime();
                break;
            case '@url':
                result = result.url();
                break;
            case '@trim':
                result = result.trim();
                break;
            case '@lower':
                result = result.toLowerCase();
                break;
            case '@upper':
                result = result.toUpperCase();
                break;
        }
    }
    return result;
}

export function addNumberValidation(
    schema: z.ZodNumber,
    attributes: readonly AttributeApplication[] | undefined,
): z.ZodSchema {
    if (!attributes || attributes.length === 0) {
        return schema;
    }

    let result = schema;
    for (const attr of attributes) {
        const val = getArgValue<number>(attr.args?.[0]?.value);
        if (val === undefined) {
            continue;
        }
        switch (attr.name) {
            case '@gt':
                result = result.gt(val);
                break;
            case '@gte':
                result = result.gte(val);
                break;
            case '@lt':
                result = result.lt(val);
                break;
            case '@lte':
                result = result.lte(val);
                break;
        }
    }
    return result;
}

export function addBigIntValidation(
    schema: z.ZodBigInt,
    attributes: readonly AttributeApplication[] | undefined,
): z.ZodSchema {
    if (!attributes || attributes.length === 0) {
        return schema;
    }

    let result = schema;
    for (const attr of attributes) {
        const val = getArgValue<number>(attr.args?.[0]?.value);
        if (val === undefined) {
            continue;
        }

        switch (attr.name) {
            case '@gt':
                result = result.gt(BigInt(val));
                break;
            case '@gte':
                result = result.gte(BigInt(val));
                break;
            case '@lt':
                result = result.lt(BigInt(val));
                break;
            case '@lte':
                result = result.lte(BigInt(val));
                break;
        }
    }
    return result;
}

export function addDecimalValidation(
    schema: z.ZodType<Decimal> | z.ZodString,
    attributes: readonly AttributeApplication[] | undefined,
    addExtraValidation: boolean,
): z.ZodSchema {
    let result: z.ZodSchema = schema;

    // parse string to Decimal
    if (schema instanceof z.ZodString) {
        result = schema
            .superRefine((v, ctx) => {
                try {
                    new Decimal(v);
                } catch (err) {
                    ctx.addIssue({
                        code: 'custom',
                        message: `Invalid decimal: ${err}`,
                    });
                }
            })
            .transform((val) => new Decimal(val));
    }

    // add validations

    function refine(schema: z.ZodSchema, op: 'gt' | 'gte' | 'lt' | 'lte', value: number) {
        return schema.superRefine((v, ctx) => {
            const base = z.number();
            const { error } = base[op](value).safeParse((v as Decimal).toNumber());
            error?.issues.forEach((issue) => {
                if (op === 'gt' || op === 'gte') {
                    ctx.addIssue({
                        code: 'too_small',
                        origin: 'number',
                        minimum: value,
                        type: 'decimal',
                        inclusive: op === 'gte',
                        message: issue.message,
                    });
                } else {
                    ctx.addIssue({
                        code: 'too_big',
                        origin: 'number',
                        maximum: value,
                        type: 'decimal',
                        inclusive: op === 'lte',
                        message: issue.message,
                    });
                }
            });
        });
    }

    if (attributes && addExtraValidation) {
        for (const attr of attributes) {
            const val = getArgValue<number>(attr.args?.[0]?.value);
            if (val === undefined) {
                continue;
            }

            switch (attr.name) {
                case '@gt':
                    result = refine(result, 'gt', val);
                    break;
                case '@gte':
                    result = refine(result, 'gte', val);
                    break;
                case '@lt':
                    result = refine(result, 'lt', val);
                    break;
                case '@lte':
                    result = refine(result, 'lte', val);
                    break;
            }
        }
    }

    return result;
}

export function addListValidation(
    schema: z.ZodArray<any>,
    attributes: readonly AttributeApplication[] | undefined,
): z.ZodSchema {
    if (!attributes || attributes.length === 0) {
        return schema;
    }

    let result = schema;
    for (const attr of attributes) {
        if (attr.name === '@length') {
            const min = getArgValue<number>(attr.args?.[0]?.value);
            if (min !== undefined) {
                result = result.min(min);
            }
            const max = getArgValue<number>(attr.args?.[1]?.value);
            if (max !== undefined) {
                result = result.max(max);
            }
        }
    }
    return result;
}

export function addCustomValidation(
    schema: z.ZodSchema,
    attributes: readonly AttributeApplication[] | undefined,
): z.ZodSchema {
    const attrs = attributes?.filter((a) => a.name === '@@validate');
    if (!attrs || attrs.length === 0) {
        return schema;
    }

    let result = schema;
    for (const attr of attrs) {
        const expr = attr.args?.[0]?.value;
        if (!expr) {
            continue;
        }
        const message = getArgValue<string>(attr.args?.[1]?.value);
        const pathExpr = attr.args?.[2]?.value;
        let path: string[] | undefined = undefined;
        if (pathExpr && ExpressionUtils.isArray(pathExpr)) {
            path = pathExpr.items.map((e) => ExpressionUtils.getLiteralValue(e) as string);
        }
        result = applyValidation(result, expr, message, path);
    }
    return result;
}

function applyValidation(
    schema: z.ZodSchema,
    expr: Expression,
    message: string | undefined,
    path: string[] | undefined,
) {
    const options: Parameters<typeof schema.refine>[1] = {};
    if (message) {
        options.error = message;
    }
    if (path) {
        options.path = path;
    }
    return schema.refine((data) => Boolean(evalExpression(data, expr)), options);
}

function evalExpression(data: any, expr: Expression): unknown {
    switch (expr.kind) {
        case 'literal':
            return expr.value;
        case 'array':
            return expr.items.map((item) => evalExpression(data, item));
        case 'field':
            return evalField(data, expr);
        case 'member':
            return evalMember(data, expr);
        case 'unary':
            return evalUnary(data, expr);
        case 'binary':
            return evalBinary(data, expr);
        case 'call':
            return evalCall(data, expr);
        case 'this':
            return data ?? null;
        case 'null':
            return null;
        case 'binding':
            throw new SchemaFactoryError('Binding expression is not supported in validation expressions');
    }
}

function evalField(data: any, e: FieldExpression) {
    return data?.[e.field] ?? null;
}

function evalUnary(data: any, expr: UnaryExpression) {
    const operand = evalExpression(data, expr.operand);
    switch (expr.op) {
        case '!':
            return !operand;
        default:
            throw new SchemaFactoryError(`Unsupported unary operator: ${expr.op}`);
    }
}

function evalBinary(data: any, expr: BinaryExpression) {
    const left = evalExpression(data, expr.left);
    const right = evalExpression(data, expr.right);
    switch (expr.op) {
        case '&&':
            return Boolean(left) && Boolean(right);
        case '||':
            return Boolean(left) || Boolean(right);
        case '==':
            return left == right;
        case '!=':
            return left != right;
        case '<':
            return (left as any) < (right as any);
        case '<=':
            return (left as any) <= (right as any);
        case '>':
            return (left as any) > (right as any);
        case '>=':
            return (left as any) >= (right as any);
        case '?':
            if (!Array.isArray(left)) {
                return false;
            }
            return left.some((item) => item === right);
        case '!':
            if (!Array.isArray(left)) {
                return false;
            }
            return left.every((item) => item === right);
        case '^':
            if (!Array.isArray(left)) {
                return false;
            }
            return !left.some((item) => item === right);
        case 'in':
            if (!Array.isArray(right)) {
                return false;
            }
            return right.includes(left);
        default:
            throw new SchemaFactoryError(`Unsupported binary operator: ${expr.op}`);
    }
}

function evalMember(data: any, expr: MemberExpression) {
    let result: any = evalExpression(data, expr.receiver);
    for (const member of expr.members) {
        if (!result || typeof result !== 'object') {
            return undefined;
        }
        result = result[member];
    }
    return result ?? null;
}

function evalCall(data: any, expr: CallExpression) {
    const f = expr.function;
    const fieldArg = expr.args?.[0] ? evalExpression(data, expr.args[0]) : undefined;

    switch (f) {
        // string functions
        case 'length': {
            if (fieldArg === undefined || fieldArg === null) {
                return false;
            }
            invariant(
                typeof fieldArg === 'string' || Array.isArray(fieldArg),
                `"${f}" first argument must be a string or a list`,
            );
            return fieldArg.length;
        }
        case 'startsWith':
        case 'endsWith':
        case 'contains': {
            if (fieldArg === undefined || fieldArg === null) {
                return false;
            }
            invariant(typeof fieldArg === 'string', `"${f}" first argument must be a string`);
            invariant(expr.args?.[1], `"${f}" requires a search argument`);

            const search = getArgValue<string>(expr.args?.[1])!;
            const caseInsensitive = getArgValue<boolean>(expr.args?.[2]) ?? false;

            const applyStringOp = (x: string, y: string) => {
                switch (f) {
                    case 'startsWith':
                        return x.startsWith(y);
                    case 'endsWith':
                        return x.endsWith(y);
                    case 'contains':
                        return x.includes(y);
                }
            };
            return caseInsensitive
                ? applyStringOp(fieldArg.toLowerCase(), search.toLowerCase())
                : applyStringOp(fieldArg, search);
        }
        case 'regex': {
            if (fieldArg === undefined || fieldArg === null) {
                return false;
            }
            invariant(typeof fieldArg === 'string', `"${f}" first argument must be a string`);
            const pattern = getArgValue<string>(expr.args?.[1])!;
            invariant(pattern !== undefined, `"${f}" requires a pattern argument`);
            return new RegExp(pattern).test(fieldArg);
        }
        case 'isEmail':
        case 'isUrl':
        case 'isDateTime': {
            if (fieldArg === undefined || fieldArg === null) {
                return false;
            }
            invariant(typeof fieldArg === 'string', `"${f}" first argument must be a string`);
            const fn = f === 'isEmail' ? ('email' as const) : f === 'isUrl' ? ('url' as const) : ('datetime' as const);
            return z.string()[fn]().safeParse(fieldArg).success;
        }
        // list functions
        case 'has':
        case 'hasEvery':
        case 'hasSome': {
            invariant(expr.args?.[1], `${f} requires a search argument`);
            if (fieldArg === undefined || fieldArg === null) {
                return false;
            }
            invariant(Array.isArray(fieldArg), `"${f}" first argument must be an array field`);

            const search = evalExpression(data, expr.args?.[1])!;
            if (f === 'has') {
                return fieldArg.some((item) => item === search);
            } else if (f === 'hasEvery') {
                invariant(Array.isArray(search), 'hasEvery second argument must be an array');
                return search.every((v) => fieldArg.some((item) => item === v));
            } else {
                invariant(Array.isArray(search), 'hasSome second argument must be an array');
                return search.some((v) => fieldArg.some((item) => item === v));
            }
        }
        case 'isEmpty': {
            if (fieldArg === undefined || fieldArg === null) {
                return false;
            }
            invariant(Array.isArray(fieldArg), `"${f}" first argument must be an array field`);
            return fieldArg.length === 0;
        }
        default:
            throw new SchemaFactoryError(`Unsupported function "${f}"`);
    }
}

function invariant(condition: unknown, message?: string): asserts condition {
    if (!condition) {
        throw new SchemaFactoryError(message ?? 'Invariant failed');
    }
}
