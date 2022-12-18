import { Enum } from '@zenstackhq/language/ast';
import { AstValidator } from '../types';
import { ValidationAcceptor } from 'langium';
import { validateDuplicatedDeclarations } from './utils';

/**
 * Validates enum declarations.
 */
export default class EnumValidator implements AstValidator<Enum> {
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    validate(_enum: Enum, accept: ValidationAcceptor) {
        validateDuplicatedDeclarations(_enum.fields, accept);
    }
}
