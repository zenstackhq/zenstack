import { ORMError, ORMErrorReason, RejectedByPolicyReason, type BaseCrudDialect } from '@zenstackhq/orm';
import { ExpressionUtils, type Expression, type SchemaDef } from '@zenstackhq/orm/schema';
import type { OperationNode } from 'kysely';
import {
    AliasNode,
    AndNode,
    BinaryOperationNode,
    ColumnNode,
    FunctionNode,
    OperatorNode,
    OrNode,
    ParensNode,
    ReferenceNode,
    TableNode,
    UnaryOperationNode,
    ValueNode,
} from 'kysely';

/**
 * Creates a `true` value node.
 */
export function trueNode<Schema extends SchemaDef>(dialect: BaseCrudDialect<Schema>) {
    return ValueNode.createImmediate(dialect.transformInput(true, 'Boolean', false));
}

/**
 * Creates a `false` value node.
 */
export function falseNode<Schema extends SchemaDef>(dialect: BaseCrudDialect<Schema>) {
    return ValueNode.createImmediate(dialect.transformInput(false, 'Boolean', false));
}

/**
 * Checks if a node is a truthy value node.
 */
export function isTrueNode(node: OperationNode): boolean {
    return ValueNode.is(node) && (node.value === true || node.value === 1);
}

/**
 * Checks if a node is a falsy value node.
 */
export function isFalseNode(node: OperationNode): boolean {
    return ValueNode.is(node) && (node.value === false || node.value === 0);
}

/**
 * Builds a logical conjunction of a list of nodes.
 */
export function conjunction<Schema extends SchemaDef>(
    dialect: BaseCrudDialect<Schema>,
    nodes: OperationNode[],
): OperationNode {
    if (nodes.length === 0) {
        return trueNode(dialect);
    }
    if (nodes.length === 1) {
        return nodes[0]!;
    }
    if (nodes.some(isFalseNode)) {
        return falseNode(dialect);
    }
    const items = nodes.filter((n) => !isTrueNode(n));
    if (items.length === 0) {
        return trueNode(dialect);
    }
    return items.reduce((acc, node) => AndNode.create(wrapParensIf(acc, OrNode.is), wrapParensIf(node, OrNode.is)));
}

export function disjunction<Schema extends SchemaDef>(
    dialect: BaseCrudDialect<Schema>,
    nodes: OperationNode[],
): OperationNode {
    if (nodes.length === 0) {
        return falseNode(dialect);
    }
    if (nodes.length === 1) {
        return nodes[0]!;
    }
    if (nodes.some(isTrueNode)) {
        return trueNode(dialect);
    }
    const items = nodes.filter((n) => !isFalseNode(n));
    if (items.length === 0) {
        return falseNode(dialect);
    }
    return items.reduce((acc, node) => OrNode.create(wrapParensIf(acc, AndNode.is), wrapParensIf(node, AndNode.is)));
}

/**
 * Negates a logical expression.
 */
export function logicalNot<Schema extends SchemaDef>(
    dialect: BaseCrudDialect<Schema>,
    node: OperationNode,
): OperationNode {
    if (isTrueNode(node)) {
        return falseNode(dialect);
    }
    if (isFalseNode(node)) {
        return trueNode(dialect);
    }
    return UnaryOperationNode.create(
        OperatorNode.create('not'),
        wrapParensIf(node, (n) => AndNode.is(n) || OrNode.is(n)),
    );
}

function wrapParensIf(node: OperationNode, predicate: (node: OperationNode) => boolean): OperationNode {
    return predicate(node) ? ParensNode.create(node) : node;
}

/**
 * Builds an expression node that checks if a node is true.
 */
export function buildIsTrue<Schema extends SchemaDef>(node: OperationNode, dialect: BaseCrudDialect<Schema>) {
    if (isTrueNode(node)) {
        return trueNode(dialect);
    } else if (isFalseNode(node)) {
        return falseNode(dialect);
    }
    return BinaryOperationNode.create(node, OperatorNode.create('='), trueNode(dialect));
}

/**
 * Builds an expression node that checks if a node is false.
 */
export function buildIsFalse<Schema extends SchemaDef>(node: OperationNode, dialect: BaseCrudDialect<Schema>) {
    if (isFalseNode(node)) {
        return trueNode(dialect);
    } else if (isTrueNode(node)) {
        return falseNode(dialect);
    }
    return BinaryOperationNode.create(
        // coalesce so null is treated as false
        FunctionNode.create('coalesce', [node, falseNode(dialect)]),
        OperatorNode.create('='),
        falseNode(dialect),
    );
}

/**
 * Gets the table name from a node.
 */
export function getTableName(node: OperationNode | undefined) {
    if (!node) {
        return node;
    }
    if (TableNode.is(node)) {
        return node.table.identifier.name;
    } else if (AliasNode.is(node)) {
        return getTableName(node.node);
    } else if (ReferenceNode.is(node) && node.table) {
        return getTableName(node.table);
    }
    return undefined;
}

/**
 * Gets the column name from a node.
 */
export function getColumnName(node: OperationNode | undefined) {
    if (!node) {
        return node;
    }
    if (AliasNode.is(node)) {
        return getColumnName(node.node);
    } else if (ReferenceNode.is(node)) {
        return getColumnName(node.column);
    } else if (ColumnNode.is(node)) {
        return node.column.name;
    }
    return undefined;
}

export function isBeforeInvocation(expr: Expression) {
    return ExpressionUtils.isCall(expr) && expr.function === 'before';
}

export function createRejectedByPolicyError(
    model: string | undefined,
    reason: RejectedByPolicyReason,
    message?: string,
    policyCodes?: string[],
) {
    const err = new ORMError(ORMErrorReason.REJECTED_BY_POLICY, message ?? 'operation is rejected by access policies');
    err.rejectedByPolicyReason = reason;
    err.model = model;
    err.policyCodes = policyCodes?.length ? policyCodes : undefined;
    return err;
}

export function createUnsupportedError(message: string) {
    return new ORMError(ORMErrorReason.NOT_SUPPORTED, message);
}
