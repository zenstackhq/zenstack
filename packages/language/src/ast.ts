import { AstNode } from 'langium';
import { AbstractDeclaration, BinaryExpr, DataModel, ExpressionType } from './generated/ast';

export { AstNode, Reference } from 'langium';
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

declare module './generated/ast' {
    interface AttributeArg {
        /**
         * Resolved attribute param declaration
         */
        $resolvedParam?: AttributeParam;
    }

    interface DataModelField {
        $inheritedFrom?: DataModel;
    }

    interface DataModelAttribute {
        $inheritedFrom?: DataModel;
    }
}

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
