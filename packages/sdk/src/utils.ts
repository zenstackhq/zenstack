import {
    AstNode,
    DataModel,
    DataModelAttribute,
    DataModelField,
    DataModelFieldAttribute,
    Enum,
    EnumField,
    Expression,
    FunctionDecl,
    InternalAttribute,
    isArrayExpr,
    isDataModel,
    isEnumField,
    isLiteralExpr,
    isObjectExpr,
    isReferenceExpr,
    Model,
    Reference,
    ReferenceExpr,
} from '@zenstackhq/language/ast';
import path from 'path';
import { PluginOptions } from './types';
import { ExpressionContext } from './constants';

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
        return getObjectLiteral<T>(expr);
    }
    return expr.value as T;
}

export function getArray(expr: Expression | undefined): Expression[] | undefined {
    return isArrayExpr(expr) ? expr.items : undefined;
}

export function getLiteralArray<
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    T extends string | number | boolean | any = any
>(expr: Expression | undefined): T[] | undefined {
    const arr = getArray(expr);
    if (!arr) {
        return undefined;
    }
    return arr.map((item) => getLiteral<T>(item)).filter((v): v is T => v !== undefined);
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

export function getAttributeArgs(
    attr: DataModelAttribute | DataModelFieldAttribute | InternalAttribute
): Record<string, Expression> {
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
    attr: DataModelAttribute | DataModelFieldAttribute | InternalAttribute,
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

export function isEnumFieldReference(node: AstNode): node is ReferenceExpr {
    return isReferenceExpr(node) && isEnumField(node.target.ref);
}

/**
 * Gets `@@id` fields declared at the data model level
 */
export function getModelIdFields(model: DataModel) {
    const idAttr = model.attributes.find((attr) => attr.decl.ref?.name === '@@id');
    if (!idAttr) {
        return [];
    }
    const fieldsArg = idAttr.args.find((a) => a.$resolvedParam?.name === 'fields');
    if (!fieldsArg || !isArrayExpr(fieldsArg.value)) {
        return [];
    }

    return fieldsArg.value.items
        .filter((item): item is ReferenceExpr => isReferenceExpr(item))
        .map((item) => resolved(item.target) as DataModelField);
}

/**
 * Gets `@@unique` fields declared at the data model level
 */
export function getModelUniqueFields(model: DataModel) {
    const uniqueAttr = model.attributes.find((attr) => attr.decl.ref?.name === '@@unique');
    if (!uniqueAttr) {
        return [];
    }
    const fieldsArg = uniqueAttr.args.find((a) => a.$resolvedParam?.name === 'fields');
    if (!fieldsArg || !isArrayExpr(fieldsArg.value)) {
        return [];
    }

    return fieldsArg.value.items
        .filter((item): item is ReferenceExpr => isReferenceExpr(item))
        .map((item) => resolved(item.target) as DataModelField);
}

/**
 * Returns if the given field is declared as an id field.
 */
export function isIdField(field: DataModelField) {
    // field-level @id attribute
    if (hasAttribute(field, '@id')) {
        return true;
    }

    const model = field.$container as DataModel;

    // model-level @@id attribute with a list of fields
    const modelLevelIds = getModelIdFields(model);
    if (modelLevelIds.includes(field)) {
        return true;
    }

    if (model.fields.some((f) => hasAttribute(f, '@id')) || modelLevelIds.length > 0) {
        // the model already has id field, don't check @unique and @@unique
        return false;
    }

    // then, the first field with @unique can be used as id
    const firstUniqueField = model.fields.find((f) => hasAttribute(f, '@unique'));
    if (firstUniqueField) {
        return firstUniqueField === field;
    }

    // last, the first model level @@unique can be used as id
    const modelLevelUnique = getModelUniqueFields(model);
    if (modelLevelUnique.includes(field)) {
        return true;
    }

    return false;
}

/**
 * Returns if the given field is a relation field.
 */
export function isRelationshipField(field: DataModelField) {
    return isDataModel(field.type.reference?.ref);
}

/**
 * Returns if the given field is a relation foreign key field.
 */
export function isForeignKeyField(field: DataModelField) {
    const model = field.$container as DataModel;
    return model.fields.some((f) => {
        // find @relation attribute
        const relAttr = f.attributes.find((attr) => attr.decl.ref?.name === '@relation');
        if (relAttr) {
            // find "fields" arg
            const fieldsArg = relAttr.args.find((a) => a.$resolvedParam?.name === 'fields');

            if (fieldsArg && isArrayExpr(fieldsArg.value)) {
                // find a matching field reference
                return fieldsArg.value.items.some((item): item is ReferenceExpr => {
                    if (isReferenceExpr(item)) {
                        return item.target.ref === field;
                    } else {
                        return false;
                    }
                });
            }
        }
        return false;
    });
}

export function resolvePath(_path: string, options: PluginOptions) {
    if (path.isAbsolute(_path)) {
        return _path;
    } else {
        return path.join(path.dirname(options.schemaPath), _path);
    }
}

export function requireOption<T>(options: PluginOptions, name: string): T {
    const value = options[name];
    if (value === undefined) {
        throw new Error(`Plugin "${options.name}" is missing required option: ${name}`);
    }
    return value as T;
}

export function getFunctionExpressionContext(funcDecl: FunctionDecl) {
    const funcAllowedContext: ExpressionContext[] = [];
    const funcAttr = funcDecl.attributes.find((attr) => attr.decl.$refText === '@@@expressionContext');
    if (funcAttr) {
        const contextArg = funcAttr.args[0].value;
        if (isArrayExpr(contextArg)) {
            contextArg.items.forEach((item) => {
                if (isEnumFieldReference(item)) {
                    funcAllowedContext.push(item.target.$refText as ExpressionContext);
                }
            });
        }
    }
    return funcAllowedContext;
}
