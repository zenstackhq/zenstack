import {
    AstNode,
    DataModel,
    DataModelAttribute,
    DataModelField,
    DataModelFieldAttribute,
    Enum,
    EnumField,
    Expression,
    isArrayExpr,
    isDataModel,
    isLiteralExpr,
    isObjectExpr,
    Model,
    Reference,
} from '@zenstackhq/language/ast';

/**
 * Gets data models that are not ignored
 */
export function getDataModels(model: Model) {
    return model.declarations.filter((d): d is DataModel => isDataModel(d) && !hasAttribute(d, '@@ignore'));
}

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

export function getArray(expr: Expression | undefined): Expression[] | undefined {
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

export function getObjectLiteral<T>(expr: Expression | undefined): T | undefined {
    if (!expr || !isObjectExpr(expr)) {
        return undefined;
    }
    const result: Record<string, unknown> = {};
    for (const field of expr.fields) {
        let fieldValue: unknown;
        if (isLiteralExpr(field.value)) {
            fieldValue = getLiteral(field.value);
        } else if (isArrayExpr(field.value)) {
            fieldValue = getLiteralArray(field.value);
        } else if (isObjectExpr(field.value)) {
            fieldValue = getObjectLiteral(field.value);
        }
        if (fieldValue === undefined) {
            return undefined;
        } else {
            result[field.name] = fieldValue;
        }
    }
    return result as T;
}

export default function indentString(string: string, count = 4): string {
    const indent = ' ';
    return string.replace(/^(?!\s*$)/gm, indent.repeat(count));
}

export function hasAttribute(decl: DataModel | DataModelField | Enum | EnumField, name: string) {
    return !!(decl.attributes as (DataModelAttribute | DataModelFieldAttribute)[]).find(
        (attr) => resolved(attr.decl).name === name
    );
}

export function getAttributeArgs(attr: DataModelAttribute | DataModelFieldAttribute): Record<string, Expression> {
    const result: Record<string, Expression> = {};
    for (const arg of attr.args) {
        if (!arg.$resolvedParam) {
            continue;
        }
        result[arg.$resolvedParam.name] = arg.value;
    }
    return result;
}

export function getAttributeArg(
    attr: DataModelAttribute | DataModelFieldAttribute,
    name: string
): Expression | undefined {
    for (const arg of attr.args) {
        if (arg.$resolvedParam?.name === name) {
            return arg.value;
        }
    }
    return undefined;
}

export function getAttributeArgLiteral<T extends string | number | boolean>(
    attr: DataModelAttribute | DataModelFieldAttribute,
    name: string
): T | undefined {
    for (const arg of attr.args) {
        if (arg.$resolvedParam?.name === name) {
            return getLiteral<T>(arg.value);
        }
    }
    return undefined;
}
