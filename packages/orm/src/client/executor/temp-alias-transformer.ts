import { IdentifierNode, OperationNodeTransformer, type OperationNode, type QueryId } from 'kysely';
import { TEMP_ALIAS_PREFIX } from '../query-utils';

/**
 * Kysely node transformer that replaces temporary aliases created during query construction with
 * shorter names while ensuring the same temp alias gets replaced with the same name.
 */
export class TempAliasTransformer extends OperationNodeTransformer {
    private aliasMap = new Map<string, string>();

    run<T extends OperationNode>(node: T): T {
        this.aliasMap.clear();
        return this.transformNode(node);
    }

    protected override transformIdentifier(node: IdentifierNode, queryId?: QueryId): IdentifierNode {
        if (node.name.startsWith(TEMP_ALIAS_PREFIX)) {
            let mapped = this.aliasMap.get(node.name);
            if (!mapped) {
                mapped = `$t${this.aliasMap.size + 1}`;
                this.aliasMap.set(node.name, mapped);
            }
            return IdentifierNode.create(mapped);
        }
        return super.transformIdentifier(node, queryId);
    }
}
