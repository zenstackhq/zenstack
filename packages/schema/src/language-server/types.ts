import { AstNode } from 'langium';
import { AbstractDeclaration } from './generated/ast';

export type TypedNode = AstNode & {
    $resolvedType?: {
        decl?: string | AbstractDeclaration;
        array?: boolean;
    };
};
