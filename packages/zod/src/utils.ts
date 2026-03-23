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
                const min = getArgValue<number>(attr.args?.find((a) => a.name === 'min')?.value);
                if (min !== undefined) {
                    result = result.min(min);
                }
                const max = getArgValue<number>(attr.args?.find((a) => a.name === 'max')?.value);
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
            const min = getArgValue<number>(attr.args?.find((a) => a.name === 'min')?.value);
            if (min !== undefined) {
                result = result.min(min);
            }
            const max = getArgValue<number>(attr.args?.find((a) => a.name === 'max')?.value);
            if (max !== undefined) {
                result = result.max(max);
            }
        }
    }
    return result;
}

/**
 * Represents the set of fields present in a (potentially partial) model shape.
 *
 * - `true`              — the field is fully present (all its own fields are available).
 * - `PresentFieldsShape` — the field is present but with a nested sub-selection;
 *                          only the listed sub-fields are available.
 *
 * This mirrors the `select` / `include` / `omit` options tree so that
 * `@@validate` rules referencing nested relation fields (e.g. `author.email`)
 * can be checked precisely against what is actually projected.
 */
export type PresentFieldsShape = { [field: string]: true | PresentFieldsShape };

/**
 * Returns `true` when every field reference in `expr` is fully satisfied by
 * `shape` — meaning the field (and any nested member path) is present in the
 * projected shape.
 *
 * Handles arbitrarily deep member expressions (`author.address.city`) by
 * recursively walking the `PresentFieldsShape` tree:
 * - If the receiver field maps to `true`, the full sub-tree is available →
 *   any member path on it is valid.
 * - If the receiver field maps to a nested `PresentFieldsShape`, each member
 *   in the path must be present in that nested shape.
 */
function allFieldRefsPresent(expr: Expression, shape: PresentFieldsShape): boolean {
    switch (expr.kind) {
        case 'literal':
        case 'null':
        case 'this':
        case 'binding':
            return true;
        case 'array':
            return expr.items.every((item) => allFieldRefsPresent(item, shape));
        case 'field':
            return expr.field in shape;
        case 'member': {
            // member expressions: receiver.member1.member2...
            // The receiver must be a simple field reference.
            if (expr.receiver.kind !== 'field') {
                // Complex receiver (e.g. nested member) — would need deeper
                // analysis; conservatively treat as missing.
                return false;
            }
            const receiverField = expr.receiver.field;
            if (!(receiverField in shape)) return false;
            const receiverShape = shape[receiverField];
            // noUncheckedIndexedAccess: guard undefined even after `in` check.
            if (receiverShape === undefined) return false;
            // If the receiver is fully present, every member path is available.
            if (receiverShape === true) return true;
            // Navigate the nested shape one member at a time.
            let current: PresentFieldsShape = receiverShape;
            for (const member of expr.members) {
                if (!(member in current)) return false;
                const next = current[member];
                // noUncheckedIndexedAccess: guard against undefined even
                // after the `in` check (TS doesn't narrow index signatures).
                if (next === undefined) return false;
                // Subtree is fully present — remaining members are all valid.
                if (next === true) return true;
                current = next;
            }
            return true;
        }
        case 'unary':
            return allFieldRefsPresent(expr.operand, shape);
        case 'binary':
            return allFieldRefsPresent(expr.left, shape) && allFieldRefsPresent(expr.right, shape);
        case 'call':
            return (expr.args ?? []).every((arg) => allFieldRefsPresent(arg, shape));
    }
}

/**
 * Applies `@@validate` rules from `attributes` to `schema` as Zod refinements.
 *
 * When `presentShape` is provided, only rules whose every field reference is
 * fully satisfied by the shape are applied. Rules that reference a field (or
 * nested member path) absent from the shape are silently skipped — they cannot
 * be evaluated correctly against a partial payload.
 *
 * Omit `presentShape` (or pass `undefined`) to apply all rules unconditionally,
 * which is the correct behaviour for full-model schemas.
 */
export function addCustomValidation(
    schema: z.ZodSchema,
    attributes: readonly AttributeApplication[] | undefined,
    presentShape?: PresentFieldsShape,
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

        // Skip rules whose field references are not fully satisfied by the shape.
        if (presentShape !== undefined && !allFieldRefsPresent(expr, presentShape)) {
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

/**
 * Recursively collects all top-level field names referenced by `kind: 'field'`
 * nodes inside an expression tree. For member expressions (`author.email`),
 * only the receiver field name (`author`) is collected.
 *
 * @see allFieldRefsPresent for a shape-aware check that handles nested paths.
 */
export function collectFieldRefs(expr: Expression): Set<string> {
    const refs = new Set<string>();
    function walk(e: Expression): void {
        switch (e.kind) {
            case 'field':
                refs.add(e.field);
                break;
            case 'unary':
                walk(e.operand);
                break;
            case 'binary':
                walk(e.left);
                walk(e.right);
                break;
            case 'call':
                e.args?.forEach(walk);
                break;
            case 'array':
                e.items.forEach(walk);
                break;
            case 'member':
                walk(e.receiver);
                break;
            // literal / null / this / binding — no field refs
        }
    }
    walk(expr);
    return refs;
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
