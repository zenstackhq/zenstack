import {
    AttributeArg,
    AttributeParam,
    BuiltinType,
    DataModelAttribute,
    DataModelFieldAttribute,
    ExpressionType,
    isArrayExpr,
    isDataModelField,
    isLiteralExpr,
    isReferenceExpr,
} from '@lang/generated/ast';
import { AstNode, ValidationAcceptor } from 'langium';

export function validateDuplicatedDeclarations(
    decls: Array<AstNode & { name: string }>,
    accept: ValidationAcceptor
) {
    const groupByName = decls.reduce<any>((group, decl) => {
        group[decl.name] = group[decl.name] ?? [];
        group[decl.name].push(decl);
        return group;
    }, {});

    for (const [name, decls] of Object.entries<AstNode[]>(groupByName)) {
        if (decls.length > 1) {
            accept('error', `Duplicated declaration name "${name}"`, {
                node: decls[1],
            });
        }
    }
}

export function getStringLiteral(node: AstNode) {
    if (isLiteralExpr(node) && typeof node.value === 'string') {
        return node.value;
    } else {
        return undefined;
    }
}

export function typeAssignable(
    destType: ExpressionType,
    sourceType: ExpressionType
) {
    switch (destType) {
        case 'Any':
            return true;
        case 'Float':
            return sourceType === 'Int' || sourceType === 'Float';
        default:
            return sourceType === destType;
    }
}

export function mapBuiltinTypeToExpressionType(
    type: BuiltinType | 'Any' | 'Null'
): ExpressionType | 'Any' {
    switch (type) {
        case 'Any':
        case 'Boolean':
        case 'String':
        case 'DateTime':
        case 'Int':
        case 'Float':
        case 'Null':
            return type;
        case 'BigInt':
            return 'Int';
        case 'Decimal':
            return 'Float';
        case 'Json':
        case 'Bytes':
            return 'Any';
    }
}

export function assignableToAttributeParam(
    arg: AttributeArg,
    param: AttributeParam,
    attr: DataModelAttribute | DataModelFieldAttribute
) {
    const argResolvedType = arg.$resolvedType;
    if (!argResolvedType) {
        return false;
    }

    let dstType = param.type.type;
    const dstIsArray = param.type.array;
    const dstRef = param.type.reference;

    if (dstType) {
        if (typeof argResolvedType?.decl !== 'string') {
            // destination type is not a reference, so argument type must be a plain expression
            return false;
        }

        if (dstType === 'FieldReference') {
            if (dstIsArray) {
                return (
                    isArrayExpr(arg.value) &&
                    !arg.value.items.find(
                        (item) =>
                            !isReferenceExpr(item) ||
                            !isDataModelField(item.target.ref)
                    )
                );
            } else {
                return (
                    isReferenceExpr(arg.value) &&
                    isDataModelField(arg.value.target.ref)
                );
            }
        } else if (dstType === 'ContextType') {
            if (isDataModelField(attr.$container)) {
                if (!attr.$container?.type?.type) {
                    return false;
                }
                dstType = mapBuiltinTypeToExpressionType(
                    attr.$container.type.type
                );
            } else {
                dstType = 'Any';
            }
        }

        return (
            typeAssignable(dstType, argResolvedType.decl) &&
            dstIsArray === argResolvedType.array
        );
    } else {
        return (
            dstRef!.ref === argResolvedType.decl &&
            dstIsArray === argResolvedType.array
        );
    }
}
