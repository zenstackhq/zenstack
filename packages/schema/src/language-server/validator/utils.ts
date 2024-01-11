import {
    AttributeArg,
    AttributeParam,
    BuiltinType,
    DataModelAttribute,
    DataModelField,
    DataModelFieldAttribute,
    Expression,
    ExpressionType,
    InternalAttribute,
    isArrayExpr,
    isDataModelField,
    isEnum,
    isReferenceExpr,
    isStringLiteral,
} from '@zenstackhq/language/ast';
import { resolved } from '@zenstackhq/sdk';
import { AstNode, ValidationAcceptor } from 'langium';

/**
 * Checks if the given declarations have duplicated names
 */
export function validateDuplicatedDeclarations(
    decls: Array<AstNode & { name: string }>,
    accept: ValidationAcceptor
): void {
    const groupByName = decls.reduce<Record<string, Array<AstNode & { name: string }>>>((group, decl) => {
        group[decl.name] = group[decl.name] ?? [];
        group[decl.name].push(decl);
        return group;
    }, {});

    for (const [name, decls] of Object.entries<AstNode[]>(groupByName)) {
        if (decls.length > 1) {
            let errorField = decls[1];
            if (decls[0].$type === 'DataModelField') {
                const nonInheritedFields = decls.filter((x) => !(x as DataModelField).$inheritedFrom);
                if (nonInheritedFields.length > 0) {
                    errorField = nonInheritedFields.slice(-1)[0];
                }
            }

            accept('error', `Duplicated declaration name "${name}"`, {
                node: errorField,
            });
        }
    }
}

/**
 * Try getting string value from a potential string literal expression
 */
export function getStringLiteral(node: AstNode | undefined): string | undefined {
    return isStringLiteral(node) ? node.value : undefined;
}

const isoDateTimeRegex = /^\d{4}(-\d\d(-\d\d(T\d\d:\d\d(:\d\d)?(\.\d+)?(([+-]\d\d:\d\d)|Z)?)?)?)?$/i;

/**
 * Determines if the given sourceType is assignable to a destination of destType
 */
export function typeAssignable(destType: ExpressionType, sourceType: ExpressionType, sourceExpr?: Expression): boolean {
    // implicit conversion from ISO datetime string to datetime
    if (destType === 'DateTime' && sourceType === 'String' && sourceExpr && isStringLiteral(sourceExpr)) {
        const literal = getStringLiteral(sourceExpr);
        if (literal && isoDateTimeRegex.test(literal)) {
            // implicitly convert to DateTime
            sourceType = 'DateTime';
        }
    }

    switch (destType) {
        case 'Any':
            return true;
        case 'Float':
            return sourceType === 'Any' || sourceType === 'Int' || sourceType === 'Float';
        default:
            return sourceType === 'Any' || sourceType === destType;
    }
}

/**
 * Maps a ZModel builtin type to expression type
 */
export function mapBuiltinTypeToExpressionType(
    type: BuiltinType | 'Any' | 'Object' | 'Null' | 'Unsupported'
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
        case 'Object':
            return 'Object';
        case 'Unsupported':
            return 'Unsupported';
    }
}

/**
 * Determines if the given attribute argument is assignable to the given attribute parameter
 */
export function assignableToAttributeParam(
    arg: AttributeArg,
    param: AttributeParam,
    attr: DataModelAttribute | DataModelFieldAttribute | InternalAttribute
): boolean {
    const argResolvedType = arg.$resolvedType;
    if (!argResolvedType) {
        return false;
    }

    let dstType = param.type.type;
    let dstIsArray = param.type.array;
    const dstRef = param.type.reference;

    if (dstType === 'Any' && !dstIsArray) {
        return true;
    }

    // destination is field reference or transitive field reference, check if
    // argument is reference or array or reference
    if (dstType === 'FieldReference' || dstType === 'TransitiveFieldReference') {
        if (dstIsArray) {
            return (
                isArrayExpr(arg.value) &&
                !arg.value.items.find((item) => !isReferenceExpr(item) || !isDataModelField(item.target.ref))
            );
        } else {
            return isReferenceExpr(arg.value) && isDataModelField(arg.value.target.ref);
        }
    }

    if (isEnum(argResolvedType.decl)) {
        // enum type

        let attrArgDeclType = dstRef?.ref;
        if (dstType === 'ContextType' && isDataModelField(attr.$container) && attr.$container?.type?.reference) {
            // attribute parameter type is ContextType, need to infer type from
            // the attribute's container
            attrArgDeclType = resolved(attr.$container.type.reference);
            dstIsArray = attr.$container.type.array;
        }
        return attrArgDeclType === argResolvedType.decl && dstIsArray === argResolvedType.array;
    } else if (dstType) {
        // scalar type

        if (typeof argResolvedType?.decl !== 'string') {
            // destination type is not a reference, so argument type must be a plain expression
            return false;
        }

        if (dstType === 'ContextType') {
            // attribute parameter type is ContextType, need to infer type from
            // the attribute's container
            if (isDataModelField(attr.$container)) {
                if (!attr.$container?.type?.type) {
                    return false;
                }
                dstType = mapBuiltinTypeToExpressionType(attr.$container.type.type);
                dstIsArray = attr.$container.type.array;
            } else {
                dstType = 'Any';
            }
        }

        return typeAssignable(dstType, argResolvedType.decl, arg.value) && dstIsArray === argResolvedType.array;
    } else {
        // reference type
        return (dstRef?.ref === argResolvedType.decl || dstType === 'Any') && dstIsArray === argResolvedType.array;
    }
}
