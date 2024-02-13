import { Enum, EnumField } from '@zenstackhq/language/ast';
import { ValidationAcceptor } from 'langium';
import { AstValidator } from '../types';
import { validateAttributeApplication } from './attribute-application-validator';
import { validateDuplicatedDeclarations } from './utils';

/**
 * Validates enum declarations.
 */
export default class EnumValidator implements AstValidator<Enum> {
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    validate(_enum: Enum, accept: ValidationAcceptor) {
        validateDuplicatedDeclarations(_enum, _enum.fields, accept);
        this.validateAttributes(_enum, accept);
        _enum.fields.forEach((field) => {
            this.validateField(field, accept);
        });
    }

    private validateAttributes(_enum: Enum, accept: ValidationAcceptor) {
        _enum.attributes.forEach((attr) => validateAttributeApplication(attr, accept));
    }

    private validateField(field: EnumField, accept: ValidationAcceptor) {
        field.attributes.forEach((attr) => validateAttributeApplication(attr, accept));
    }
}
