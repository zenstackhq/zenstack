import { invariant, lowerCaseFirst, upperCaseFirst } from '@zenstackhq/common-helpers';
import { sql, ValueNode, type BinaryOperator, type Expression, type ExpressionBuilder, type SqlBool } from 'kysely';
import { match } from 'ts-pattern';
import type { ZModelFunction, ZModelFunctionContext } from './options';

// TODO: migrate default value generation functions to here too

export const contains: ZModelFunction<any> = (eb, args, context) => textMatch(eb, args, context, 'contains');

export const search: ZModelFunction<any> = (_eb: ExpressionBuilder<any, any>, _args: Expression<any>[]) => {
    throw new Error(`"search" function is not implemented yet`);
};

export const startsWith: ZModelFunction<any> = (eb, args, context) => textMatch(eb, args, context, 'startsWith');

export const endsWith: ZModelFunction<any> = (eb, args, context) => textMatch(eb, args, context, 'endsWith');

const textMatch = (
    eb: ExpressionBuilder<any, any>,
    args: Expression<any>[],
    { dialect }: ZModelFunctionContext<any>,
    method: 'contains' | 'startsWith' | 'endsWith',
) => {
    const [field, search, caseInsensitive = undefined] = args;
    if (!field) {
        throw new Error('"field" parameter is required');
    }
    if (!search) {
        throw new Error('"search" parameter is required');
    }

    const casingBehavior = dialect.getStringCasingBehavior();
    const caseInsensitiveValue = readBoolean(caseInsensitive, false);
    let op: BinaryOperator;
    let fieldExpr = field;
    let searchExpr = search;

    if (caseInsensitiveValue) {
        // case-insensitive search
        if (casingBehavior.supportsILike) {
            // use ILIKE if supported
            op = 'ilike';
        } else {
            // otherwise change both sides to lower case
            op = 'like';
            if (casingBehavior.likeCaseSensitive === true) {
                fieldExpr = eb.fn('LOWER', [fieldExpr]);
                searchExpr = eb.fn('LOWER', [searchExpr]);
            }
        }
    } else {
        // case-sensitive search, just use LIKE and deliver whatever the database's behavior is
        op = 'like';
    }

    // coalesce to empty string to consistently handle nulls across databases
    searchExpr = eb.fn.coalesce(searchExpr, sql.lit(''));

    // escape special characters in search string
    const escapedSearch = sql`REPLACE(REPLACE(REPLACE(${dialect.castText(searchExpr)}, ${sql.val('\\')}, ${sql.val('\\\\')}), ${sql.val('%')}, ${sql.val('\\%')}), ${sql.val('_')}, ${sql.val('\\_')})`;

    searchExpr = match(method)
        .with('contains', () => eb.fn('CONCAT', [sql.lit('%'), escapedSearch, sql.lit('%')]))
        .with('startsWith', () => eb.fn('CONCAT', [escapedSearch, sql.lit('%')]))
        .with('endsWith', () => eb.fn('CONCAT', [sql.lit('%'), escapedSearch]))
        .exhaustive();

    return sql<SqlBool>`${fieldExpr} ${sql.raw(op)} ${searchExpr} escape ${sql.val('\\')}`;
};

export const has: ZModelFunction<any> = (_eb, args, context) => {
    const [field, search] = args;
    if (!field) {
        throw new Error('"field" parameter is required');
    }
    if (!search) {
        throw new Error('"search" parameter is required');
    }
    return context.dialect.buildArrayContains(field, search);
};

export const hasEvery: ZModelFunction<any> = (_eb, args, { dialect }: ZModelFunctionContext<any>) => {
    const [field, search] = args;
    if (!field) {
        throw new Error('"field" parameter is required');
    }
    if (!search) {
        throw new Error('"search" parameter is required');
    }
    return dialect.buildArrayHasEvery(field, search);
};

export const hasSome: ZModelFunction<any> = (_eb, args, { dialect }: ZModelFunctionContext<any>) => {
    const [field, search] = args;
    if (!field) {
        throw new Error('"field" parameter is required');
    }
    if (!search) {
        throw new Error('"search" parameter is required');
    }
    return dialect.buildArrayHasSome(field, search);
};

export const isEmpty: ZModelFunction<any> = (eb, args, { dialect }: ZModelFunctionContext<any>) => {
    const [field] = args;
    if (!field) {
        throw new Error('"field" parameter is required');
    }
    return eb(dialect.buildArrayLength(field), '=', sql.lit(0));
};

export const now: ZModelFunction<any> = (_eb, _args, context) =>
    match(context.dialect.provider)
        // SQLite stores DateTime as ISO 8601 text ('YYYY-MM-DDTHH:MM:SS.sssZ'), but
        // CURRENT_TIMESTAMP returns 'YYYY-MM-DD HH:MM:SS'. Use strftime for ISO format.
        .with('sqlite', () => sql.raw("strftime('%Y-%m-%dT%H:%M:%fZ')"))
        // MySQL stores DateTime as ISO 8601 text ('YYYY-MM-DDTHH:MM:SS.sss+00:00').
        // Use CONCAT + SUBSTRING to produce matching 3-digit millisecond ISO format.
        .with('mysql', () =>
            sql.raw("CONCAT(SUBSTRING(DATE_FORMAT(UTC_TIMESTAMP(3), '%Y-%m-%dT%H:%i:%s.%f'), 1, 23), '+00:00')"),
        )
        // PostgreSQL has native timestamp type that compares correctly.
        .with('postgresql', () => sql.raw('CURRENT_TIMESTAMP'))
        .exhaustive();

export const currentModel: ZModelFunction<any> = (_eb, args, { model }: ZModelFunctionContext<any>) => {
    let result = model;
    const [casing] = args;
    if (casing) {
        result = processCasing(casing, result, model);
    }
    return sql.lit(result);
};

export const currentOperation: ZModelFunction<any> = (_eb, args, { operation }: ZModelFunctionContext<any>) => {
    let result: string = operation;
    const [casing] = args;
    if (casing) {
        result = processCasing(casing, result, operation);
    }
    return sql.lit(result);
};

function processCasing(casing: Expression<any>, result: string, model: string) {
    const opNode = casing.toOperationNode();
    invariant(ValueNode.is(opNode) && typeof opNode.value === 'string', '"casting" parameter must be a string value');
    result = match(opNode.value)
        .with('original', () => model)
        .with('upper', () => result.toUpperCase())
        .with('lower', () => result.toLowerCase())
        .with('capitalize', () => upperCaseFirst(result))
        .with('uncapitalize', () => lowerCaseFirst(result))
        .otherwise(() => {
            throw new Error(
                `Invalid casing value: ${opNode.value}. Must be "original", "upper", "lower", "capitalize", or "uncapitalize".`,
            );
        });
    return result;
}

function readBoolean(expr: Expression<any> | undefined, defaultValue: boolean) {
    if (expr === undefined) {
        return defaultValue;
    }
    const opNode = expr.toOperationNode();
    invariant(ValueNode.is(opNode), 'expression must be a literal value');
    return !!opNode.value;
}
