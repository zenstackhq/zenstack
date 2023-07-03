import {
    ArrayExpr,
    Attribute,
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
    isAttribute,
    isDataModel,
    isDataModelField,
    isEnum,
    isLiteralExpr,
    isReferenceExpr,
    ReferenceExpr,
} from '@zenstackhq/language/ast';
import { resolved } from '@zenstackhq/sdk';
import { AstNode, ValidationAcceptor } from 'langium';
import pluralize from 'pluralize';

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
                const nonInheritedFields = decls.filter((x) => !(x as DataModelField).$isInherited);
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
    if (isLiteralExpr(node) && typeof node.value === 'string') {
        return node.value;
    } else {
        return undefined;
    }
}

const isoDateTimeRegex = /^\d{4}(-\d\d(-\d\d(T\d\d:\d\d(:\d\d)?(\.\d+)?(([+-]\d\d:\d\d)|Z)?)?)?)?$/i;

/**
 * Determines if the given sourceType is assignable to a destination of destType
 */
export function typeAssignable(destType: ExpressionType, sourceType: ExpressionType, sourceExpr?: Expression): boolean {
    // implicit conversion from ISO datetime string to datetime
    if (destType === 'DateTime' && sourceType === 'String' && sourceExpr && isLiteralExpr(sourceExpr)) {
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

export function validateAttributeApplication(
    attr: DataModelAttribute | DataModelFieldAttribute | InternalAttribute,
    accept: ValidationAcceptor
) {
    const decl = attr.decl.ref;
    if (!decl) {
        return;
    }

    const targetDecl = attr.$container;
    if (decl.name === '@@@targetField' && !isAttribute(targetDecl)) {
        accept('error', `attribute "${decl.name}" can only be used on attribute declarations`, { node: attr });
        return;
    }

    if (isDataModelField(targetDecl) && !isValidAttributeTarget(decl, targetDecl)) {
        accept('error', `attribute "${decl.name}" cannot be used on this type of field`, { node: attr });
    }

    const filledParams = new Set<AttributeParam>();

    for (const arg of attr.args) {
        let paramDecl: AttributeParam | undefined;
        if (!arg.name) {
            paramDecl = decl.params.find((p) => p.default && !filledParams.has(p));
            if (!paramDecl) {
                accept('error', `Unexpected unnamed argument`, {
                    node: arg,
                });
                return false;
            }
        } else {
            paramDecl = decl.params.find((p) => p.name === arg.name);
            if (!paramDecl) {
                accept('error', `Attribute "${decl.name}" doesn't have a parameter named "${arg.name}"`, {
                    node: arg,
                });
                return false;
            }
        }

        if (!assignableToAttributeParam(arg, paramDecl, attr)) {
            accept('error', `Value is not assignable to parameter`, {
                node: arg,
            });
            return false;
        }

        if (filledParams.has(paramDecl)) {
            accept('error', `Parameter "${paramDecl.name}" is already provided`, { node: arg });
            return false;
        }
        filledParams.add(paramDecl);
        arg.$resolvedParam = paramDecl;
    }

    const missingParams = decl.params.filter((p) => !p.type.optional && !filledParams.has(p));
    if (missingParams.length > 0) {
        accept(
            'error',
            `Required ${pluralize('parameter', missingParams.length)} not provided: ${missingParams
                .map((p) => p.name)
                .join(', ')}`,
            { node: attr }
        );
        return false;
    }

    return true;
}

function isValidAttributeTarget(attrDecl: Attribute, targetDecl: DataModelField) {
    const targetField = attrDecl.attributes.find((attr) => attr.decl.ref?.name === '@@@targetField');
    if (!targetField) {
        // no field type constraint
        return true;
    }

    const fieldTypes = (targetField.args[0].value as ArrayExpr).items.map(
        (item) => (item as ReferenceExpr).target.ref?.name
    );

    let allowed = false;
    for (const allowedType of fieldTypes) {
        switch (allowedType) {
            case 'StringField':
                allowed = allowed || targetDecl.type.type === 'String';
                break;
            case 'IntField':
                allowed = allowed || targetDecl.type.type === 'Int';
                break;
            case 'BigIntField':
                allowed = allowed || targetDecl.type.type === 'BigInt';
                break;
            case 'FloatField':
                allowed = allowed || targetDecl.type.type === 'Float';
                break;
            case 'DecimalField':
                allowed = allowed || targetDecl.type.type === 'Decimal';
                break;
            case 'BooleanField':
                allowed = allowed || targetDecl.type.type === 'Boolean';
                break;
            case 'DateTimeField':
                allowed = allowed || targetDecl.type.type === 'DateTime';
                break;
            case 'JsonField':
                allowed = allowed || targetDecl.type.type === 'Json';
                break;
            case 'BytesField':
                allowed = allowed || targetDecl.type.type === 'Bytes';
                break;
            case 'ModelField':
                allowed = allowed || isDataModel(targetDecl.type.reference?.ref);
                break;
            default:
                break;
        }
        if (allowed) {
            break;
        }
    }

    return allowed;
}
