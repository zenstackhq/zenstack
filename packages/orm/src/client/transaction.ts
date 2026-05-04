export const STEP_REF_SYMBOL = '$zenstackStepRef';
export const EXPR_SYMBOL = '$zenstackExpr';

// ---- Expression Type System ----

declare const STEP_EXPR_VALUE: unique symbol;

export type ExprFilterOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'notIn' | 'contains';

type StringKey<T> = Extract<keyof T, string>;
type ExprValueCarrier<T> = { readonly [STEP_EXPR_VALUE]?: T };

/**
 * Condition for filtering array results.
 *
 * `field` and `value` become type-safe when the source expression is typed,
 * for example: `$filter($stepRef<Post[]>(1), 'title', 'eq', 'Target')`.
 * The `value` can itself contain nested expressions.
 */
export type ExprWhere = {
    field: string;
    op: ExprFilterOp;
    value: unknown;
};

type StepRefShape = {
    [EXPR_SYMBOL]: 'ref';
    /** Number of the step whose result to reference (1-based). */
    step: number;
    /**
     * Dot-separated path to extract from the step's result.
     * Supports array bracket notation: `items[0].id`
    */
    path?: string;
};

type StepGetShape = {
    [EXPR_SYMBOL]: 'get';
    /** The expression whose result to extract a field from. */
    ref: StepExpr;
    /** Dot-separated path to extract. */
    path: string;
};

type StepItemShape = {
    [EXPR_SYMBOL]: 'item';
    /** The expression producing an array. */
    ref: StepExpr;
    /** 0-based index into the array. */
    index: number;
};

type StepFirstShape = {
    [EXPR_SYMBOL]: 'first';
    /** The expression producing an array. Returns the first element. */
    ref: StepExpr;
};

type StepFilterShape = {
    [EXPR_SYMBOL]: 'filter';
    /** The expression producing an array to filter. */
    ref: StepExpr;
    /** Condition to filter by. */
    where: ExprWhere;
};

type StepMapShape = {
    [EXPR_SYMBOL]: 'map';
    /** The expression producing an array. */
    ref: StepExpr;
    /** Field name to extract from each element. */
    extract: string;
};

type StepExprShape = StepRefShape | StepGetShape | StepItemShape | StepFirstShape | StepFilterShape | StepMapShape;

export type StepRefExpr<T = unknown> = ExprValueCarrier<T> & StepRefShape;
export type StepGetExpr<T = unknown> = ExprValueCarrier<T> & StepGetShape;
export type StepItemExpr<T = unknown> = ExprValueCarrier<T> & StepItemShape;
export type StepFirstExpr<T = unknown> = ExprValueCarrier<T> & StepFirstShape;
export type StepFilterExpr<TItem extends object = Record<string, unknown>> = ExprValueCarrier<TItem[]> & StepFilterShape;
export type StepMapExpr<T = unknown> = ExprValueCarrier<T[]> & StepMapShape;

type ExprFilterValue<TValue, TOp extends ExprFilterOp> = TOp extends 'in' | 'notIn'
    ? readonly TValue[] | StepExpr<readonly TValue[]>
    : TOp extends 'contains'
      ? TValue extends readonly (infer Item)[]
          ? Item | StepExpr<Item>
          : TValue extends string
            ? string | StepExpr<string>
            : TValue | StepExpr<TValue>
      : TValue | StepExpr<TValue>;

/**
 * Discriminated union of all supported step expressions.
 * Each expression resolves to a value at runtime, using accumulated
 * results from previous transaction steps.
 *
 * Expressions compose: where an expression is expected, you can pass
 * any StepExpr — enabling chains like "filter an array then pick a field".
 */
export type StepExpr<T = unknown> = ExprValueCarrier<T> & StepExprShape;

/** Backward-compatible simple step reference. */
export type StepRef = {
    [STEP_REF_SYMBOL]: true;
    step: number;
    path?: string;
};

// ---- Typed constructor helpers ----
// These provide full IntelliSense and type safety when building expressions.
// Since they return plain objects, they survive JSON serialization for RPC usage.

/**
 * References the result of a previous sequential transaction step.
 *
 * Pass a generic type to make later helpers field-aware:
 * `$stepRef<Post[]>(1)` enables `$filter(..., 'title', 'eq', 'Target')`
 * with autocomplete for `title` and a string-typed value.
 */
export function $stepRef<T = unknown>(step: number, path?: string): StepRefExpr<T> {
    return path !== undefined ? { [EXPR_SYMBOL]: 'ref', step, path } : { [EXPR_SYMBOL]: 'ref', step };
}

/**
 * Extracts a field/path from another step expression.
 *
 * If the referenced expression is typed, top-level keys are suggested and the
 * returned expression carries the selected field type.
 */
export function $get<TSource extends object, TPath extends StringKey<TSource>>(ref: StepExpr<TSource>, path: TPath): StepGetExpr<TSource[TPath]>;
export function $get(ref: StepExpr, path: string): StepGetExpr<unknown>;
export function $get(ref: StepExpr, path: string): StepGetExpr<unknown> {
    return { [EXPR_SYMBOL]: 'get', ref, path };
}

/**
 * Picks one item from an array-valued expression by zero-based index.
 */
export function $item<TItem>(ref: StepExpr<readonly TItem[]>, index: number): StepItemExpr<TItem>;
export function $item(ref: StepExpr, index: number): StepItemExpr<unknown>;
export function $item(ref: StepExpr, index: number): StepItemExpr<unknown> {
    return { [EXPR_SYMBOL]: 'item', ref, index };
}

/**
 * Picks the first item from an array-valued expression.
 */
export function $first<TItem>(ref: StepExpr<readonly TItem[]>): StepFirstExpr<TItem>;
export function $first(ref: StepExpr): StepFirstExpr<unknown>;
export function $first(ref: StepExpr): StepFirstExpr<unknown> {
    return { [EXPR_SYMBOL]: 'first', ref };
}

/**
 * Filters an array-valued expression by a field condition.
 *
 * Use a typed step reference for field/value IntelliSense:
 * `$filter($stepRef<Post[]>(1), 'title', 'eq', 'Target')` suggests `title`
 * and requires the value to be compatible with `Post['title']`.
 */
export function $filter<TItem extends object, TField extends StringKey<TItem>, TOp extends ExprFilterOp>(
    ref: StepExpr<readonly TItem[]>,
    field: TField,
    op: TOp,
    value: ExprFilterValue<TItem[TField], TOp>,
): StepFilterExpr<TItem>;
export function $filter(ref: StepExpr, field: string, op: ExprFilterOp, value: unknown): StepFilterExpr;
export function $filter(ref: StepExpr, field: string, op: ExprFilterOp, value: unknown): StepFilterExpr {
    return { [EXPR_SYMBOL]: 'filter', ref, where: { field, op, value } };
}

/**
 * Extracts one field from every item of an array-valued expression.
 *
 * With a typed array expression, `extract` autocompletes from the item keys and
 * the returned expression carries the extracted field array type.
 */
export function $map<TItem extends object, TField extends StringKey<TItem>>(ref: StepExpr<readonly TItem[]>, extract: TField): StepMapExpr<TItem[TField]>;
export function $map(ref: StepExpr, extract: string): StepMapExpr<unknown>;
export function $map(ref: StepExpr, extract: string): StepMapExpr<unknown> {
    return { [EXPR_SYMBOL]: 'map', ref, extract };
}

// ---- Detection helpers ----

export function isStepRef(value: unknown): value is StepRef {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
    const v = value as Record<string, unknown>;
    return (
        STEP_REF_SYMBOL in v &&
        v[STEP_REF_SYMBOL] === true
    );
}

export function isStepExpr(value: unknown): value is StepExpr {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
    const v = value as Record<string, unknown>;
    return typeof v[EXPR_SYMBOL] === 'string' && EXPR_SYMBOL in v;
}

/** True if value is EITHER a StepRef or a StepExpr. */
export function isAnyRef(value: unknown): value is StepRef | StepExpr {
    return isStepRef(value) || isStepExpr(value);
}

// ---- Path resolution ----

type PathSegment = string | number;

function parsePath(path: string): PathSegment[] {
    const segments: PathSegment[] = [];
    const parts = path.split('.');
    for (const part of parts) {
        const bracketMatch = part.match(/^(\w+)\[(\d+)\]$/);
        if (bracketMatch) {
            segments.push(bracketMatch[1]!);
            segments.push(parseInt(bracketMatch[2]!, 10));
        } else {
            segments.push(part);
        }
    }
    return segments;
}

function resolvePath(obj: unknown, segments: PathSegment[]): unknown {
    let current = obj;
    for (const segment of segments) {
        if (current == null || typeof current !== 'object') {
            throw new Error(
                `Cannot resolve path segment "${segment}": value is ${current === null ? 'null' : typeof current}`,
            );
        }
        if (Array.isArray(current) && typeof segment === 'number') {
            if (segment < 0 || segment >= current.length) {
                throw new Error(`Array index ${segment} is out of bounds. Array has ${current.length} elements.`);
            }
            current = current[segment];
        } else if (typeof segment === 'string' && segment in current) {
            current = (current as Record<string, unknown>)[segment];
        } else {
            throw new Error(
                `Cannot resolve path segment "${segment}" on ${Array.isArray(current) ? 'array' : typeof current}`,
            );
        }
    }
    return current;
}

// ---- Expression resolution ----

/**
 * Resolves a StepRef or StepExpr against accumulated step results.
 * Handles both the old `$zenstackStepRef` format and the new `$zenstackExpr` format.
 */
export function resolveExpr(expr: StepExpr | StepRef, results: unknown[]): unknown {
    // Handle old-style StepRef
    if (isStepRef(expr)) {
        const { step, path } = expr;
        const resultIndex = getResultIndex(step, results);
        let value = results[resultIndex];
        if (path) {
            value = resolvePath(value, parsePath(path));
        }
        return value;
    }

    // Handle new-style StepExpr
    const kind = expr[EXPR_SYMBOL];
    switch (kind) {
        case 'ref': {
            const { step, path } = expr as Extract<StepExpr, { [EXPR_SYMBOL]: 'ref' }>;
            const resultIndex = getResultIndex(step, results);
            let value = results[resultIndex];
            if (path) {
                value = resolvePath(value, parsePath(path));
            }
            return value;
        }

        case 'get': {
            const { ref, path } = expr as Extract<StepExpr, { [EXPR_SYMBOL]: 'get' }>;
            const resolved = resolveExpr(ref, results);
            return resolvePath(resolved, parsePath(path));
        }

        case 'item': {
            const { ref, index } = expr as Extract<StepExpr, { [EXPR_SYMBOL]: 'item' }>;
            const resolved = resolveExpr(ref, results);
            ensureArray(resolved, 'item', index);
            const arr = resolved as unknown[];
            if (index < 0 || index >= arr.length) {
                throw new Error(`Array index ${index} is out of bounds. Array has ${arr.length} elements.`);
            }
            return arr[index];
        }

        case 'first': {
            const { ref } = expr as Extract<StepExpr, { [EXPR_SYMBOL]: 'first' }>;
            const resolved = resolveExpr(ref, results);
            ensureArray(resolved, 'first');
            const arr = resolved as unknown[];
            if (arr.length === 0) {
                throw new Error('Cannot get first element of an empty array.');
            }
            return arr[0];
        }

        case 'filter': {
            const { ref, where } = expr as Extract<StepExpr, { [EXPR_SYMBOL]: 'filter' }>;
            const resolved = resolveExpr(ref, results);
            ensureArray(resolved, 'filter');
            const arr = resolved as Record<string, unknown>[];
            const resolvedValue = isAnyRef(where.value) ? resolveExpr(where.value, results) : where.value;
            return arr.filter((item) => matchCondition(item, where.field, where.op, resolvedValue));
        }

        case 'map': {
            const { ref, extract } = expr as Extract<StepExpr, { [EXPR_SYMBOL]: 'map' }>;
            const resolved = resolveExpr(ref, results);
            ensureArray(resolved, 'map');
            const arr = resolved as Record<string, unknown>[];
            return arr.map((item) => {
                if (!(extract in item)) {
                    throw new Error(`Field "${extract}" not found in array element. Available fields: ${Object.keys(item).join(', ')}`);
                }
                return item[extract];
            });
        }

        default:
            throw new Error(`Unknown expression type: "${kind}". Supported types: ref, get, item, first, filter, map`);
    }
}

function getResultIndex(step: number, results: unknown[]) {
    if (step < 1 || step > results.length) {
        throw new Error(
            `Step reference to number ${step} is out of bounds. ` +
                `Step references are 1-based, and there are ${results.length} result(s) available from previous steps ` +
                `(steps 1..${results.length}).`,
        );
    }
    return step - 1;
}

function ensureArray(value: unknown, op: string, index?: number): asserts value is unknown[] {
    if (!Array.isArray(value)) {
        const hint = index !== undefined ? ` at index ${index}` : '';
        throw new Error(
            `Cannot apply "${op}"${hint}: the resolved value is not an array (got ${getValueTypeName(value)}). ` +
                `Use a "ref" or "get" expression that points to an array result (e.g., from findMany).`,
        );
    }
}

function getValueTypeName(value: unknown) {
    if (typeof value !== 'object' || value === null) {
        return typeof value;
    }
    return value.constructor?.name || typeof value;
}

function matchCondition(item: Record<string, unknown>, field: string, op: string, value: unknown): boolean {
    const actual = item[field];
    switch (op) {
        case 'eq':
            return actual === value;
        case 'neq':
            return actual !== value;
        case 'gt':
            return typeof actual === 'number' && typeof value === 'number' && actual > value;
        case 'gte':
            return typeof actual === 'number' && typeof value === 'number' && actual >= value;
        case 'lt':
            return typeof actual === 'number' && typeof value === 'number' && actual < value;
        case 'lte':
            return typeof actual === 'number' && typeof value === 'number' && actual <= value;
        case 'in':
            return Array.isArray(value) && value.includes(actual);
        case 'notIn':
            return Array.isArray(value) && !value.includes(actual);
        case 'contains':
            return typeof actual === 'string' && typeof value === 'string' && actual.includes(value);
        default:
            throw new Error(`Unknown filter operator: "${op}". Supported: eq, neq, gt, gte, lt, lte, in, notIn, contains`);
    }
}

// ---- Public entry point (used by RPC handler) ----

/**
 * Walks through args recursively and resolves any StepRef or StepExpr markers
 * using the accumulated results from previous steps.
 *
 * Handles both formats:
 * - Old: `{ $zenstackStepRef: true, step: 1, path: 'id' }`
 * - New: `{ $zenstackExpr: 'ref', step: 1, path: 'id' }` and compositions
 */
export function resolveStepRefs(args: unknown, results: unknown[]): unknown {
    if (isAnyRef(args)) {
        return resolveExpr(args, results);
    }

    if (Array.isArray(args)) {
        return args.map((item) => resolveStepRefs(item, results));
    }

    if (args && typeof args === 'object' && Object.getPrototypeOf(args) === Object.prototype) {
        const result: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(args)) {
            result[key] = resolveStepRefs(value, results);
        }
        return result;
    }

    return args;
}
