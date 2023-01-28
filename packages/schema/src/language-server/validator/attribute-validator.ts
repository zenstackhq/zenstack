import { Attribute } from '@zenstackhq/language/ast';
import { AstValidator } from '../types';
import { ValidationAcceptor } from 'langium';

/**
 * Validates attribute declarations.
 */
export default class AttributeValidator implements AstValidator<Attribute> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-empty-function
    validate(attr: Attribute, accept: ValidationAcceptor): void {}
}
