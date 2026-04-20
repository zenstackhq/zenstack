import type { ValidationAcceptor } from 'langium';
import { type DataField, type TypeDef } from '../generated/ast';
import { validateAttributeApplication } from './attribute-application-validator';
import { validateDuplicatedDeclarations, type AstValidator } from './common';

/**
 * Validates type def declarations.
 */
export default class TypeDefValidator implements AstValidator<TypeDef> {
    validate(typeDef: TypeDef, accept: ValidationAcceptor): void {
        validateDuplicatedDeclarations(typeDef, typeDef.fields, accept);
        this.validateAttributes(typeDef, accept);
        this.validateFields(typeDef, accept);
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
}
