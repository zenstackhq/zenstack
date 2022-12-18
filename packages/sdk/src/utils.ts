import {
    AstNode,
    Expression,
    isArrayExpr,
    isLiteralExpr,
    Reference,
} from '@zenstackhq/language/ast';

export function resolved<T extends AstNode>(ref: Reference<T>): T {
    if (!ref.ref) {
        throw new Error(`Reference not resolved: ${ref.$refText}`);
    }
    return ref.ref;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getLiteral<T extends string | number | boolean | any = any>(
    expr: Expression | undefined
): T | undefined {
    if (!isLiteralExpr(expr)) {
        return undefined;
    }
    return expr.value as T;
}

export function getArray(
    expr: Expression | undefined
): Expression[] | undefined {
    return isArrayExpr(expr) ? expr.items : undefined;
}

export function getLiteralArray<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    T extends string | number | boolean | any = any
>(expr: Expression | undefined): (T | undefined)[] | undefined {
    const arr = getArray(expr);
    if (!arr) {
        return undefined;
    }
    return arr.map((item) => getLiteral<T>(item));
}
