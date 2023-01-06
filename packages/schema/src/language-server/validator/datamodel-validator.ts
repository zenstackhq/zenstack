import { SCALAR_TYPES } from '../constants';
import {
    ArrayExpr,
    Attribute,
    AttributeParam,
    DataModel,
    DataModelAttribute,
    DataModelField,
    DataModelFieldAttribute,
    isAttribute,
    isDataModel,
    isDataModelField,
    isLiteralExpr,
    ReferenceExpr,
} from '@zenstackhq/language/ast';
import { AstValidator } from '../types';
import { ValidationAcceptor } from 'langium';
import { assignableToAttributeParam, validateDuplicatedDeclarations } from './utils';
import pluralize from 'pluralize';

/**
 * Validates data model declarations.
 */
export default class DataModelValidator implements AstValidator<DataModel> {
    validate(dm: DataModel, accept: ValidationAcceptor): void {
        validateDuplicatedDeclarations(dm.fields, accept);
        this.validateFields(dm, accept);
        this.validateAttributes(dm, accept);
    }

    private validateFields(dm: DataModel, accept: ValidationAcceptor) {
        const idFields = dm.fields.filter((f) => f.attributes.find((attr) => attr.decl.ref?.name === '@id'));
        if (idFields.length === 0) {
            accept('error', 'Model must include a field with @id attribute', {
                node: dm,
            });
        } else if (idFields.length > 1) {
            accept('error', 'Model can include at most one field with @id attribute', {
                node: dm,
            });
        } else {
            if (idFields[0].type.optional) {
                accept('error', 'Field with @id attribute must not be optional', { node: idFields[0] });
            }

            if (idFields[0].type.array || !idFields[0].type.type || !SCALAR_TYPES.includes(idFields[0].type.type)) {
                accept('error', 'Field with @id attribute must be of scalar type', { node: idFields[0] });
            }
        }

        dm.fields.forEach((field) => this.validateField(field, accept));
    }

    private validateField(field: DataModelField, accept: ValidationAcceptor): void {
        if (field.type.array && field.type.optional) {
            accept('error', 'Optional lists are not supported. Use either `Type[]` or `Type?`', { node: field.type });
        }

        field.attributes.forEach((attr) => this.validateAttributeApplication(attr, accept));

        if (isDataModel(field.type.reference?.ref)) {
            this.validateRelationField(field, accept);
        }
    }

    private validateAttributes(dm: DataModel, accept: ValidationAcceptor) {
        dm.attributes.forEach((attr) => {
            this.validateAttributeApplication(attr, accept);
        });
    }

    private validateAttributeApplication(
        attr: DataModelAttribute | DataModelFieldAttribute,
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

        if (isDataModelField(targetDecl) && !this.isValidAttributeTarget(decl, targetDecl)) {
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

    private isValidAttributeTarget(attrDecl: Attribute, targetDecl: DataModelField) {
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

    private parseRelation(field: DataModelField, accept?: ValidationAcceptor) {
        const relAttr = field.attributes.find((attr) => attr.decl.ref?.name === '@relation');

        let name: string | undefined;
        let fields: ReferenceExpr[] | undefined;
        let references: ReferenceExpr[] | undefined;
        let valid = true;

        if (!relAttr) {
            return { attr: relAttr, name, fields, references, valid: true };
        }

        for (const arg of relAttr.args) {
            if (!arg.name || arg.name === 'name') {
                if (isLiteralExpr(arg.value)) {
                    name = arg.value.value as string;
                }
            } else if (arg.name === 'fields') {
                fields = (arg.value as ArrayExpr).items as ReferenceExpr[];
                if (fields.length === 0) {
                    if (accept) {
                        accept('error', `"fields" value cannot be emtpy`, {
                            node: arg,
                        });
                    }
                    valid = false;
                }
            } else if (arg.name === 'references') {
                references = (arg.value as ArrayExpr).items as ReferenceExpr[];
                if (references.length === 0) {
                    if (accept) {
                        accept('error', `"references" value cannot be emtpy`, {
                            node: arg,
                        });
                    }
                    valid = false;
                }
            }
        }

        if (!fields || !references) {
            if (accept) {
                accept('error', `Both "fields" and "references" must be provided`, { node: relAttr });
            }
        } else {
            // validate "fields" and "references" typing consistency
            if (fields.length !== references.length) {
                if (accept) {
                    accept('error', `"references" and "fields" must have the same length`, { node: relAttr });
                }
            } else {
                for (let i = 0; i < fields.length; i++) {
                    if (!fields[i].$resolvedType) {
                        if (accept) {
                            accept('error', `field reference is unresolved`, { node: fields[i] });
                        }
                    }
                    if (!references[i].$resolvedType) {
                        if (accept) {
                            accept('error', `field reference is unresolved`, { node: references[i] });
                        }
                    }

                    if (
                        fields[i].$resolvedType?.decl !== references[i].$resolvedType?.decl ||
                        fields[i].$resolvedType?.array !== references[i].$resolvedType?.array
                    ) {
                        if (accept) {
                            accept('error', `values of "references" and "fields" must have the same type`, {
                                node: relAttr,
                            });
                        }
                    }
                }
            }
        }

        return { attr: relAttr, name, fields, references, valid };
    }

    private validateRelationField(field: DataModelField, accept: ValidationAcceptor) {
        const thisRelation = this.parseRelation(field, accept);
        if (!thisRelation.valid) {
            return;
        }

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const oppositeModel = field.type.reference!.ref! as DataModel;

        let oppositeFields = oppositeModel.fields.filter((f) => f.type.reference?.ref === field.$container);
        oppositeFields = oppositeFields.filter((f) => {
            const fieldRel = this.parseRelation(f);
            return fieldRel.valid && fieldRel.name === thisRelation.name;
        });

        if (oppositeFields.length === 0) {
            accept(
                'error',
                `The relation field "${field.name}" on model "${field.$container.name}" is missing an opposite relation field on model "${oppositeModel.name}"`,
                { node: field }
            );
            return;
        } else if (oppositeFields.length > 1) {
            oppositeFields.forEach((f) =>
                accept(
                    'error',
                    `Fields ${oppositeFields.map((f) => '"' + f.name + '"').join(', ')} on model "${
                        oppositeModel.name
                    }" refer to the same relation to model "${field.$container.name}"`,
                    { node: f }
                )
            );
            return;
        }

        const oppositeField = oppositeFields[0];
        const oppositeRelation = this.parseRelation(oppositeField);

        let relationOwner: DataModelField;

        if (thisRelation?.references?.length && thisRelation.fields?.length) {
            if (oppositeRelation?.references || oppositeRelation?.fields) {
                accept('error', '"fields" and "references" must be provided only on one side of relation field', {
                    node: oppositeField,
                });
                return;
            } else {
                relationOwner = oppositeField;
            }
        } else if (oppositeRelation?.references?.length && oppositeRelation.fields?.length) {
            if (thisRelation?.references || thisRelation?.fields) {
                accept('error', '"fields" and "references" must be provided only on one side of relation field', {
                    node: field,
                });
                return;
            } else {
                relationOwner = field;
            }
        } else {
            [field, oppositeField].forEach((f) =>
                accept(
                    'error',
                    'Field for one side of relation must carry @relation attribute with both "fields" and "references" fields',
                    { node: f }
                )
            );
            return;
        }

        if (!relationOwner.type.array && !relationOwner.type.optional) {
            accept('error', 'Relation field needs to be list or optional', {
                node: relationOwner,
            });
            return;
        }

        if (relationOwner !== field && !relationOwner.type.array) {
            // one-to-one relation requires defining side's reference field to be @unique
            // e.g.:
            //     model User {
            //         id String @id @default(cuid())
            //         data UserData?
            //     }
            //     model UserData {
            //         id String @id @default(cuid())
            //         user User  @relation(fields: [userId], references: [id])
            //         userId String
            //     }
            //
            // UserData.userId field needs to be @unique

            thisRelation.fields?.forEach((ref) => {
                const refField = ref.target.ref as DataModelField;
                if (refField && !refField.attributes.find((a) => a.decl.ref?.name === '@unique')) {
                    accept(
                        'error',
                        `Field "${refField.name}" is part of a one-to-one relation and must be marked as @unique`,
                        { node: refField }
                    );
                }
            });
        }
    }
}
