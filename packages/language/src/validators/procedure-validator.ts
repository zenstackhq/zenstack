import type { ValidationAcceptor } from 'langium';
import type { Procedure } from '../generated/ast';
import { validateAttributeApplication } from './attribute-application-validator';
import type { AstValidator } from './common';

const RESERVED_PROCEDURE_NAMES = new Set(['__proto__', 'prototype', 'constructor']);

/**
 * Validates procedure declarations.
 */
export default class ProcedureValidator implements AstValidator<Procedure> {
    validate(proc: Procedure, accept: ValidationAcceptor): void {
        this.validateName(proc, accept);
        proc.attributes.forEach((attr) => validateAttributeApplication(attr, accept));
    }

    private validateName(proc: Procedure, accept: ValidationAcceptor): void {
        if (RESERVED_PROCEDURE_NAMES.has(proc.name)) {
            accept('error', `Procedure name "${proc.name}" is reserved`, {
                node: proc,
                property: 'name',
            });
        }
    }
}
