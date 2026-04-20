import type { AstNode } from 'langium';
import { AbstractDeclaration, BinaryExpr, DataModel, type ExpressionType } from './generated/ast';

export type { AstNode, Reference } from 'langium';
export * from './generated/ast';

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
    nullable?: boolean;
};

export const BinaryExprOperatorPriority: Record<BinaryExpr['operator'], number> = {
    //LogicalExpr
    '||': 1,
    '&&': 1,
    //EqualityExpr
    '==': 2,
    '!=': 2,
    //ComparisonExpr
    '>': 3,
    '<': 3,
    '>=': 3,
    '<=': 3,
    in: 4,
    //CollectionPredicateExpr
    '^': 5,
    '?': 5,
    '!': 5,
};

export interface InheritableNode extends AstNode {
    $inheritedFrom?: DataModel;
}

declare module 'langium' {
    export interface AstNode {
        /**
         * Resolved type information attached to expressions
         */
        $resolvedType?: ResolvedType;
    }
}
