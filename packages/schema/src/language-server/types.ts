import { AstNode, ValidationAcceptor } from 'langium';
import { AbstractDeclaration, ExpressionType } from './generated/ast';

/**
 * Shape of type resolution result: an expression type or reference to a declaration
 */
export type ResolvedShape = ExpressionType | AbstractDeclaration;

/**
 * Resolved type information (attached to expressions by linker)
 */
export type ResolvedType = {
    decl?: ResolvedShape;
    array?: boolean;
};

/**
 * AST validator contract
 */
export interface AstValidator<T extends AstNode> {
    /**
     * Validates an AST node
     */
    validate(node: T, accept: ValidationAcceptor): void;
}
