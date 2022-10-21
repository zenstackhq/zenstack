import { AstNode, ValidationAcceptor } from 'langium';
import { AbstractDeclaration } from './generated/ast';

export type TypedNode = AstNode & {
    $resolvedType?: {
        decl?: string | AbstractDeclaration;
        array?: boolean;
    };
};

export interface AstValidator<T extends AstNode> {
    validate(node: T, accept: ValidationAcceptor): void;
}
