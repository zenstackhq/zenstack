import { AstNode, ValidationAcceptor } from 'langium';
import { AbstractDeclaration, ExpressionType } from './generated/ast';

export type ResolvedShape = ExpressionType | AbstractDeclaration;

export type ResolvedType = {
    decl?: ResolvedShape;
    array?: boolean;
};

export interface AstValidator<T extends AstNode> {
    validate(node: T, accept: ValidationAcceptor): void;
}
