import type { ValidationAcceptor } from 'langium';
import { FunctionDecl } from '../generated/ast';
import { validateAttributeApplication } from './attribute-application-validator';
import type { AstValidator } from './common';

/**
 * Validates function declarations.
 */
export default class FunctionDeclValidator implements AstValidator<FunctionDecl> {
    validate(funcDecl: FunctionDecl, accept: ValidationAcceptor): void {
        if (!funcDecl) {
            accept('error', 'Function declaration is undefined', { node: funcDecl });
            return;
        }

        // Validate function name if present
        if (funcDecl.name !== undefined && funcDecl.name !== null) {
            const name = funcDecl.name;
            if (typeof name !== 'string' || name.trim() === '') {
                accept('error', 'Function name must be a non-empty string', { node: funcDecl });
            }
        }

        // Validate attributes if present
        if (funcDecl.attributes) {
            funcDecl.attributes.forEach((attr) => {
                if (attr) {
                    validateAttributeApplication(attr, accept);
                }
            });
        }
    }
}
