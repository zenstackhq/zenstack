import type { ValidationAcceptor } from 'langium';
import { type DataField, type TypeDef } from '../generated/ast';
import { validateAttributeApplication } from './attribute-application-validator';
import { validateDuplicatedDeclarations, type AstValidator } from './common';
import { getPrimitiveTypeDefThisField } from '../utils';

/**
 * Validates type def declarations.
 */
export default class TypeDefValidator implements AstValidator<TypeDef> {
    validate(typeDef: TypeDef, accept: ValidationAcceptor): void {
        validateDuplicatedDeclarations(typeDef, typeDef.fields, accept);
        this.validateAttributes(typeDef, accept);
        this.validateFields(typeDef, accept);
        this.validatePrimitiveTypeDef(typeDef, accept);
    }

    private validateAttributes(typeDef: TypeDef, accept: ValidationAcceptor) {
        typeDef.attributes.forEach((attr) => validateAttributeApplication(attr, accept));
    }

    private validateFields(typeDef: TypeDef, accept: ValidationAcceptor) {
        typeDef.fields.forEach((field) => this.validateField(field, accept));
    }

    private validateField(field: DataField, accept: ValidationAcceptor): void {
        field.attributes.forEach((attr) => validateAttributeApplication(attr, accept));
    }

    private validatePrimitiveTypeDef(typeDef: TypeDef, accept: ValidationAcceptor) {
        if (typeDef.base) {
            if (typeDef.fields.length > 1) {
                accept('error', 'primitive type def must only declare 1 field', {
                    node: typeDef,
                });
            }
            const thisField = getPrimitiveTypeDefThisField(typeDef);
            if (!thisField) {
                accept('error', 'primitive type def is missing "this" field', {
                    node: typeDef,
                });
            } else {
                if (thisField.type.type !== typeDef.base) {
                    accept('error', 'primitive type def\'s "this" field must match the declared type', {
                        node: thisField,
                    });
                }

                if (thisField.type.array) {
                    accept('error', 'primitive type def\'s "this" field must be scalar', {
                        node: thisField,
                    });
                }

                if (thisField.type.optional) {
                    accept('error', 'primitive type def\'s "this" field must not be optional', {
                        node: thisField,
                    });
                }
            }

            if (typeDef.mixins.length > 0) {
                accept('error', `primitive type def cannot use mixins`, {
                    node: typeDef,
                });
            }
        } else {
            const primitiveTypeDefs = typeDef.mixins.filter((m) => !!m.ref?.base);
            for (const primitiveTypeDef of primitiveTypeDefs) {
                accept('error', `cannot use primitive type def "${primitiveTypeDef.$refText}" as a mixin`, {
                    node: typeDef,
                });
            }
        }
    }
}
