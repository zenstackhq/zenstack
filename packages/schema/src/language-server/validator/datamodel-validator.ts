import {
    ArrayExpr,
    DataModel,
    DataModelField,
    isDataModel,
    isLiteralExpr,
    ReferenceExpr,
} from '@zenstackhq/language/ast';
import { ValidationAcceptor } from 'langium';
import { analyzePolicies } from '../../utils/ast-utils';
import { IssueCodes, SCALAR_TYPES } from '../constants';
import { AstValidator } from '../types';
import { getIdFields, getUniqueFields } from '../utils';
import { validateAttributeApplication, validateDuplicatedDeclarations } from './utils';
import { getLiteral } from '@zenstackhq/sdk';

/**
 * Validates data model declarations.
 */
export default class DataModelValidator implements AstValidator<DataModel> {
    validate(dm: DataModel, accept: ValidationAcceptor): void {
        validateDuplicatedDeclarations(dm.fields, accept);
        this.validateAttributes(dm, accept);
        this.validateFields(dm, accept);
    }

    private validateFields(dm: DataModel, accept: ValidationAcceptor) {
        const idFields = dm.fields.filter((f) => f.attributes.find((attr) => attr.decl.ref?.name === '@id'));
        const modelLevelIds = getIdFields(dm);

        if (idFields.length === 0 && modelLevelIds.length === 0) {
            const { allows, denies, hasFieldValidation } = analyzePolicies(dm);
            if (allows.length > 0 || denies.length > 0 || hasFieldValidation) {
                // TODO: relax this requirement to require only @unique fields
                // when access policies or field valdaition is used, require an @id field
                accept('error', 'Model must include a field with @id attribute or a model-level @@id attribute', {
                    node: dm,
                });
            }
        } else if (idFields.length > 0 && modelLevelIds.length > 0) {
            accept('error', 'Model cannot have both field-level @id and model-level @@id attributes', {
                node: dm,
            });
        } else if (idFields.length > 1) {
            accept('error', 'Model can include at most one field with @id attribute', {
                node: dm,
            });
        } else {
            const fieldsToCheck = idFields.length > 0 ? idFields : modelLevelIds;
            fieldsToCheck.forEach((idField) => {
                if (idField.type.optional) {
                    accept('error', 'Field with @id attribute must not be optional', { node: idField });
                }
                if (idField.type.array || !idField.type.type || !SCALAR_TYPES.includes(idField.type.type)) {
                    accept('error', 'Field with @id attribute must be of scalar type', { node: idField });
                }
            });
        }

        dm.fields.forEach((field) => this.validateField(field, accept));
    }

    private validateField(field: DataModelField, accept: ValidationAcceptor): void {
        if (field.type.array && field.type.optional) {
            accept('error', 'Optional lists are not supported. Use either `Type[]` or `Type?`', { node: field.type });
        }

        field.attributes.forEach((attr) => validateAttributeApplication(attr, accept));

        if (isDataModel(field.type.reference?.ref) && !(field.$container as DataModel).isAbstract) {
            this.validateRelationField(field, accept);
        }
    }

    private validateAttributes(dm: DataModel, accept: ValidationAcceptor) {
        dm.attributes.forEach((attr) => {
            validateAttributeApplication(attr, accept);
        });
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
            if (this.isSelfRelation(field, name)) {
                // self relations are partial
                // https://www.prisma.io/docs/concepts/components/prisma-schema/relations/self-relations
            } else {
                if (accept) {
                    accept('error', `Both "fields" and "references" must be provided`, { node: relAttr });
                }
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

    private isSelfRelation(field: DataModelField, relationName?: string) {
        if (field.type.reference?.ref === field.$container) {
            // field directly references back to its type
            return true;
        }

        if (relationName) {
            // field's relation points to another type, and that type's opposite relation field
            // points back
            const oppositeModelFields = field.type.reference?.ref?.fields as DataModelField[];
            if (oppositeModelFields) {
                for (const oppositeField of oppositeModelFields) {
                    // find the opposite relation with the matching name
                    const relAttr = oppositeField.attributes.find((a) => a.decl.ref?.name === '@relation');
                    if (relAttr) {
                        const relNameExpr = relAttr.args.find((a) => !a.name || a.name === 'name');
                        const relName = getLiteral<string>(relNameExpr?.value);
                        if (relName === relationName && oppositeField.type.reference?.ref === field.$container) {
                            // found an opposite relation field that points back to this field's type
                            return true;
                        }
                    }
                }
            }
        }

        return false;
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
                { node: field, code: IssueCodes.MissingOppositeRelation }
            );
            return;
        } else if (oppositeFields.length > 1) {
            oppositeFields.forEach((f) => {
                if (this.isSelfRelation(f)) {
                    // self relations are partial
                    // https://www.prisma.io/docs/concepts/components/prisma-schema/relations/self-relations
                } else {
                    accept(
                        'error',
                        `Fields ${oppositeFields.map((f) => '"' + f.name + '"').join(', ')} on model "${
                            oppositeModel.name
                        }" refer to the same relation to model "${field.$container.name}"`,
                        { node: f }
                    );
                }
            });
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
            // if both the field is array, then it's an implicit many-to-many relation
            if (!(field.type.array && oppositeField.type.array)) {
                [field, oppositeField].forEach((f) => {
                    if (!this.isSelfRelation(f, thisRelation.name)) {
                        accept(
                            'error',
                            'Field for one side of relation must carry @relation attribute with both "fields" and "references" fields',
                            { node: f }
                        );
                    }
                });
            }
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

            const containingModel = field.$container as DataModel;
            const uniqueFieldList = getUniqueFields(containingModel);

            thisRelation.fields?.forEach((ref) => {
                const refField = ref.target.ref as DataModelField;
                if (refField) {
                    if (refField.attributes.find((a) => a.decl.ref?.name === '@unique')) {
                        return;
                    }
                    if (uniqueFieldList.some((list) => list.includes(refField))) {
                        return;
                    }
                    accept(
                        'error',
                        `Field "${refField.name}" is part of a one-to-one relation and must be marked as @unique or be part of a model-level @@unique attribute`,
                        { node: refField }
                    );
                }
            });
        }
    }
}
