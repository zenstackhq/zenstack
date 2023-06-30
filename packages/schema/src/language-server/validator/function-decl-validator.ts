import { FunctionDecl } from '@zenstackhq/language/ast';
import { ValidationAcceptor } from 'langium';
import { AstValidator } from '../types';
import { validateAttributeApplication } from './utils';

/**
 * Validates function declarations.
 */
export default class FunctionDeclValidator implements AstValidator<FunctionDecl> {
    validate(funcDecl: FunctionDecl, accept: ValidationAcceptor) {
        funcDecl.attributes.forEach((attr) => {
            validateAttributeApplication(attr, accept);
        });
    }
}
