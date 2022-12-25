import { AbstractDeclaration, ExpressionType } from './generated/ast';

export * from './generated/ast';
export { AstNode, Reference } from 'langium';

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

declare module './generated/ast' {
    interface AttributeArg {
        /**
         * Resolved attribute param declaration
         */
        $resolvedParam?: AttributeParam;
    }
}

declare module 'langium' {
    export interface AstNode {
        /**
         * Resolved type information attached to expressions
         */
        $resolvedType?: ResolvedType;
    }
}
