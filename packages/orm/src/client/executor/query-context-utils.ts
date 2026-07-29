import { RawNode, SelectModifierNode, type OperationNode, type RootOperationNode } from 'kysely';
import { CONTEXT_COMMENT_PREFIX } from '../constants';
import type { QueryContext } from '../plugin';

// `modifyEnd` appends a plain `RawNode` on insert/update/delete nodes, but wraps it in a
// `SelectModifierNode` on select nodes
function getRawModifier(modifier: OperationNode): RawNode | undefined {
    if (RawNode.is(modifier)) {
        return modifier;
    }
    if (SelectModifierNode.is(modifier) && modifier.rawModifier && RawNode.is(modifier.rawModifier)) {
        return modifier.rawModifier;
    }
    return undefined;
}

/**
 * Extracts the ORM query context embedded as a trailing `-- $$context:` comment
 * (a `RawNode` in the root node's `endModifiers`), and returns the node with the
 * comment stripped so it never reaches plugins or the database driver.
 */
export function extractQueryContext(node: RootOperationNode): {
    queryContext?: QueryContext;
    strippedNode: RootOperationNode;
} {
    const endModifiers = (node as { endModifiers?: readonly OperationNode[] }).endModifiers;
    if (!endModifiers?.length) {
        return { strippedNode: node };
    }

    let queryContext: QueryContext | undefined;
    const remaining = endModifiers.filter((modifier) => {
        const rawNode = getRawModifier(modifier);
        if (!rawNode || !rawNode.sqlFragments[0]?.startsWith(CONTEXT_COMMENT_PREFIX)) {
            return true;
        }
        try {
            queryContext = JSON.parse(rawNode.sqlFragments[0].slice(CONTEXT_COMMENT_PREFIX.length));
        } catch {
            // malformed payload: treat as absent
        }
        return false;
    });

    if (remaining.length === endModifiers.length) {
        return { strippedNode: node };
    }

    return {
        queryContext,
        strippedNode: {
            ...node,
            endModifiers: remaining.length > 0 ? remaining : undefined,
        } as RootOperationNode,
    };
}
