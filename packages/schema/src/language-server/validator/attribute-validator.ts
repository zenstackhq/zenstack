import { Attribute } from '@lang/generated/ast';
import { AstValidator } from '@lang/types';
import { ValidationAcceptor } from 'langium';

export default class AttributeValidator implements AstValidator<Attribute> {
    validate(attr: Attribute, accept: ValidationAcceptor) {}
}
