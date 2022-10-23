import { Enum } from '@lang/generated/ast';
import { AstValidator } from '@lang/types';
import { ValidationAcceptor } from 'langium';
import { validateDuplicatedDeclarations } from './utils';

export default class EnumValidator implements AstValidator<Enum> {
    validate(_enum: Enum, accept: ValidationAcceptor) {
        validateDuplicatedDeclarations(_enum.fields, accept);
    }
}
