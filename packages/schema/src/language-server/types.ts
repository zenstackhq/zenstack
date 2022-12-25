import { AstNode, ValidationAcceptor } from 'langium';

/**
 * AST validator contract
 */
export interface AstValidator<T extends AstNode> {
    /**
     * Validates an AST node
     */
    validate(node: T, accept: ValidationAcceptor): void;
}
