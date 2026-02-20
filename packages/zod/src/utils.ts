import { invariant } from '@zenstackhq/common-helpers';
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
import { match, P } from 'ts-pattern';
import { z } from 'zod';
import { ZodSchemaError } from './error';

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
        match(attr.name)
            .with('@length', () => {
                const min = getArgValue<number>(attr.args?.[0]?.value);
                if (min !== undefined) {
                    result = result.min(min);
                }
                const max = getArgValue<number>(attr.args?.[1]?.value);
                if (max !== undefined) {
                    result = result.max(max);
                }
            })
            .with('@startsWith', () => {
                const value = getArgValue<string>(attr.args?.[0]?.value);
                if (value !== undefined) {
                    result = result.startsWith(value);
                }
            })
            .with('@endsWith', () => {
                const value = getArgValue<string>(attr.args?.[0]?.value);
                if (value !== undefined) {
                    result = result.endsWith(value);
                }
            })
            .with('@contains', () => {
                const value = getArgValue<string>(attr.args?.[0]?.value);
                if (value !== undefined) {
                    result = result.includes(value);
                }
            })
            .with('@regex', () => {
                const pattern = getArgValue<string>(attr.args?.[0]?.value);
                if (pattern !== undefined) {
                    result = result.regex(new RegExp(pattern));
                }
            })
            .with('@email', () => {
                result = result.email();
            })
            .with('@datetime', () => {
                result = result.datetime();
            })
            .with('@url', () => {
                result = result.url();
            })
            .with('@trim', () => {
                result = result.trim();
            })
            .with('@lower', () => {
                result = result.toLowerCase();
            })
            .with('@upper', () => {
                result = result.toUpperCase();
            });
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
        match(attr.name)
            .with('@gt', () => {
                result = result.gt(val);
            })
            .with('@gte', () => {
                result = result.gte(val);
            })
            .with('@lt', () => {
                result = result.lt(val);
            })
            .with('@lte', () => {
                result = result.lte(val);
            });
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

        match(attr.name)
            .with('@gt', () => {
                result = result.gt(BigInt(val));
            })
            .with('@gte', () => {
                result = result.gte(BigInt(val));
            })
            .with('@lt', () => {
                result = result.lt(BigInt(val));
            })
            .with('@lte', () => {
                result = result.lte(BigInt(val));
            });
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

            match(attr.name)
                .with('@gt', () => {
                    result = refine(result, 'gt', val);
                })
                .with('@gte', () => {
                    result = refine(result, 'gte', val);
                })
                .with('@lt', () => {
                    result = refine(result, 'lt', val);
                })
                .with('@lte', () => {
                    result = refine(result, 'lte', val);
                });
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
        match(attr.name)
            .with('@length', () => {
                const min = getArgValue<number>(attr.args?.[0]?.value);
                if (min !== undefined) {
                    result = result.min(min);
                }
                const max = getArgValue<number>(attr.args?.[1]?.value);
                if (max !== undefined) {
                    result = result.max(max);
                }
            })
            .otherwise(() => {});
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
    return match(expr)
        .with({ kind: 'literal' }, (e) => e.value)
        .with({ kind: 'array' }, (e) => e.items.map((item) => evalExpression(data, item)))
        .with({ kind: 'field' }, (e) => evalField(data, e))
        .with({ kind: 'member' }, (e) => evalMember(data, e))
        .with({ kind: 'unary' }, (e) => evalUnary(data, e))
        .with({ kind: 'binary' }, (e) => evalBinary(data, e))
        .with({ kind: 'call' }, (e) => evalCall(data, e))
        .with({ kind: 'this' }, () => data ?? null)
        .with({ kind: 'null' }, () => null)
        .with({ kind: 'binding' }, () => {
            throw new Error('Binding expression is not supported in validation expressions');
        })
        .exhaustive();
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
            throw new Error(`Unsupported unary operator: ${expr.op}`);
    }
}

function evalBinary(data: any, expr: BinaryExpression) {
    const left = evalExpression(data, expr.left);
    const right = evalExpression(data, expr.right);
    return match(expr.op)
        .with('&&', () => Boolean(left) && Boolean(right))
        .with('||', () => Boolean(left) || Boolean(right))
        .with('==', () => left == right)
        .with('!=', () => left != right)
        .with('<', () => (left as any) < (right as any))
        .with('<=', () => (left as any) <= (right as any))
        .with('>', () => (left as any) > (right as any))
        .with('>=', () => (left as any) >= (right as any))
        .with('?', () => {
            if (!Array.isArray(left)) {
                return false;
            }
            return left.some((item) => item === right);
        })
        .with('!', () => {
            if (!Array.isArray(left)) {
                return false;
            }
            return left.every((item) => item === right);
        })
        .with('^', () => {
            if (!Array.isArray(left)) {
                return false;
            }
            return !left.some((item) => item === right);
        })
        .with('in', () => {
            if (!Array.isArray(right)) {
                return false;
            }
            return right.includes(left);
        })
        .exhaustive();
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
    const fieldArg = expr.args?.[0] ? evalExpression(data, expr.args[0]) : undefined;
    return (
        match(expr.function)
            // string functions
            .with('length', (f) => {
                if (fieldArg === undefined || fieldArg === null) {
                    return false;
                }
                invariant(
                    typeof fieldArg === 'string' || Array.isArray(fieldArg),
                    `"${f}" first argument must be a string or a list`,
                );
                return fieldArg.length;
            })
            .with(P.union('startsWith', 'endsWith', 'contains'), (f) => {
                if (fieldArg === undefined || fieldArg === null) {
                    return false;
                }
                invariant(typeof fieldArg === 'string', `"${f}" first argument must be a string`);
                invariant(expr.args?.[1], `"${f}" requires a search argument`);

                const search = getArgValue<string>(expr.args?.[1])!;
                const caseInsensitive = getArgValue<boolean>(expr.args?.[2]) ?? false;

                const matcher = (x: string, y: string) =>
                    match(f)
                        .with('startsWith', () => x.startsWith(y))
                        .with('endsWith', () => x.endsWith(y))
                        .with('contains', () => x.includes(y))
                        .exhaustive();
                return caseInsensitive
                    ? matcher(fieldArg.toLowerCase(), search.toLowerCase())
                    : matcher(fieldArg, search);
            })
            .with('regex', (f) => {
                if (fieldArg === undefined || fieldArg === null) {
                    return false;
                }
                invariant(typeof fieldArg === 'string', `"${f}" first argument must be a string`);
                const pattern = getArgValue<string>(expr.args?.[1])!;
                invariant(pattern !== undefined, `"${f}" requires a pattern argument`);
                return new RegExp(pattern).test(fieldArg);
            })
            .with(P.union('isEmail', 'isUrl', 'isDateTime'), (f) => {
                if (fieldArg === undefined || fieldArg === null) {
                    return false;
                }
                invariant(typeof fieldArg === 'string', `"${f}" first argument must be a string`);
                const fn = match(f)
                    .with('isEmail', () => 'email' as const)
                    .with('isUrl', () => 'url' as const)
                    .with('isDateTime', () => 'datetime' as const)
                    .exhaustive();
                return z.string()[fn]().safeParse(fieldArg).success;
            })
            // list functions
            .with(P.union('has', 'hasEvery', 'hasSome'), (f) => {
                invariant(expr.args?.[1], `${f} requires a search argument`);
                if (fieldArg === undefined || fieldArg === null) {
                    return false;
                }
                invariant(Array.isArray(fieldArg), `"${f}" first argument must be an array field`);

                const search = evalExpression(data, expr.args?.[1])!;
                const matcher = (x: any[], y: any) =>
                    match(f)
                        .with('has', () => x.some((item) => item === y))
                        .with('hasEvery', () => {
                            invariant(Array.isArray(y), 'hasEvery second argument must be an array');
                            return y.every((v) => x.some((item) => item === v));
                        })
                        .with('hasSome', () => {
                            invariant(Array.isArray(y), 'hasSome second argument must be an array');
                            return y.some((v) => x.some((item) => item === v));
                        })
                        .exhaustive();
                return matcher(fieldArg, search);
            })
            .with('isEmpty', (f) => {
                if (fieldArg === undefined || fieldArg === null) {
                    return false;
                }
                invariant(Array.isArray(fieldArg), `"${f}" first argument must be an array field`);
                return fieldArg.length === 0;
            })
            .otherwise(() => {
                throw new ZodSchemaError(`Unsupported function "${expr.function}"`);
            })
    );
}
