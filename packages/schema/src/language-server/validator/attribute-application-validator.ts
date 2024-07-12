import {
    ArrayExpr,
    Attribute,
    AttributeArg,
    AttributeParam,
    DataModelAttribute,
    DataModelField,
    DataModelFieldAttribute,
    InternalAttribute,
    ReferenceExpr,
    isArrayExpr,
    isAttribute,
    isDataModel,
    isDataModelField,
    isEnum,
    isReferenceExpr,
} from '@zenstackhq/language/ast';
import { isDataModelFieldReference, isFutureExpr, isRelationshipField, resolved } from '@zenstackhq/sdk';
import { ValidationAcceptor, streamAst } from 'langium';
import pluralize from 'pluralize';
import { AstValidator } from '../types';
import { getStringLiteral, mapBuiltinTypeToExpressionType, typeAssignable } from './utils';

// a registry of function handlers marked with @check
const attributeCheckers = new Map<string, PropertyDescriptor>();

// function handler decorator
function check(name: string) {
    return function (_target: unknown, _propertyKey: string, descriptor: PropertyDescriptor) {
        if (!attributeCheckers.get(name)) {
            attributeCheckers.set(name, descriptor);
        }
        return descriptor;
    };
}

type AttributeApplication = DataModelAttribute | DataModelFieldAttribute | InternalAttribute;

/**
 * Validates function declarations.
 */
export default class AttributeApplicationValidator implements AstValidator<AttributeApplication> {
    validate(attr: AttributeApplication, accept: ValidationAcceptor) {
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
                    return;
                }
            } else {
                paramDecl = decl.params.find((p) => p.name === arg.name);
                if (!paramDecl) {
                    accept('error', `Attribute "${decl.name}" doesn't have a parameter named "${arg.name}"`, {
                        node: arg,
                    });
                    return;
                }
            }

            if (!assignableToAttributeParam(arg, paramDecl, attr)) {
                accept('error', `Value is not assignable to parameter`, {
                    node: arg,
                });
                return;
            }

            if (filledParams.has(paramDecl)) {
                accept('error', `Parameter "${paramDecl.name}" is already provided`, { node: arg });
                return;
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
            return;
        }

        // run checkers for specific attributes
        const checker = attributeCheckers.get(decl.name);
        if (checker) {
            checker.value.call(this, attr, accept);
        }
    }

    @check('@@allow')
    @check('@@deny')
    private _checkModelLevelPolicy(attr: AttributeApplication, accept: ValidationAcceptor) {
        const kind = getStringLiteral(attr.args[0].value);
        if (!kind) {
            accept('error', `expects a string literal`, { node: attr.args[0] });
            return;
        }
        this.validatePolicyKinds(kind, ['create', 'read', 'update', 'delete', 'all'], attr, accept);
    }

    @check('@allow')
    @check('@deny')
    private _checkFieldLevelPolicy(attr: AttributeApplication, accept: ValidationAcceptor) {
        const kind = getStringLiteral(attr.args[0].value);
        if (!kind) {
            accept('error', `expects a string literal`, { node: attr.args[0] });
            return;
        }
        const kindItems = this.validatePolicyKinds(kind, ['read', 'update', 'all'], attr, accept);

        const expr = attr.args[1].value;
        if (streamAst(expr).some((node) => isFutureExpr(node))) {
            accept('error', `"future()" is not allowed in field-level policy rules`, { node: expr });
        }

        // 'update' rules are not allowed for relation fields
        if (kindItems.includes('update') || kindItems.includes('all')) {
            const field = attr.$container as DataModelField;
            if (isRelationshipField(field)) {
                accept(
                    'error',
                    `Field-level policy rules with "update" or "all" kind are not allowed for relation fields. Put rules on foreign-key fields instead.`,
                    { node: attr }
                );
            }
        }
    }

    @check('@@validate')
    private _checkValidate(attr: AttributeApplication, accept: ValidationAcceptor) {
        const condition = attr.args[0]?.value;
        if (
            condition &&
            streamAst(condition).some(
                (node) => isDataModelFieldReference(node) && isDataModel(node.$resolvedType?.decl)
            )
        ) {
            accept('error', `\`@@validate\` condition cannot use relation fields`, { node: condition });
        }
    }

    private validatePolicyKinds(
        kind: string,
        candidates: string[],
        attr: AttributeApplication,
        accept: ValidationAcceptor
    ) {
        const items = kind.split(',').map((x) => x.trim());
        items.forEach((item) => {
            if (!candidates.includes(item)) {
                accept(
                    'error',
                    `Invalid policy rule kind: "${item}", allowed: ${candidates.map((c) => '"' + c + '"').join(', ')}`,
                    { node: attr }
                );
            }
        });
        return items;
    }
}

function assignableToAttributeParam(arg: AttributeArg, param: AttributeParam, attr: AttributeApplication): boolean {
    const argResolvedType = arg.$resolvedType;
    if (!argResolvedType) {
        return false;
    }

    let dstType = param.type.type;
    let dstIsArray = param.type.array;

    if (dstType === 'ContextType') {
        // ContextType is inferred from the attribute's container's type
        if (isDataModelField(attr.$container)) {
            dstIsArray = attr.$container.type.array;
        }
    }

    const dstRef = param.type.reference;

    if (dstType === 'Any' && !dstIsArray) {
        return true;
    }

    if (argResolvedType.decl === 'Any') {
        // arg is any type
        if (!argResolvedType.array) {
            // if it's not an array, it's assignable to any type
            return true;
        } else {
            // otherwise it's assignable to any array type
            return argResolvedType.array === dstIsArray;
        }
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

export function validateAttributeApplication(attr: AttributeApplication, accept: ValidationAcceptor) {
    new AttributeApplicationValidator().validate(attr, accept);
}
