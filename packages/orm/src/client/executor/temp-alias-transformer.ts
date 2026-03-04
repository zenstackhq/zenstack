import { IdentifierNode, OperationNodeTransformer, type OperationNode, type QueryId } from 'kysely';
import { TEMP_ALIAS_PREFIX } from '../query-utils';

type TempAliasTransformerMode = 'alwaysCompact' | 'compactLongNames';

type TempAliasTransformerOptions = {
    mode?: TempAliasTransformerMode;
    maxIdentifierLength?: number;
};

/**
 * Kysely node transformer that replaces temporary aliases created during query construction with
 * shorter names while ensuring the same temp alias gets replaced with the same name.
 */
export class TempAliasTransformer extends OperationNodeTransformer {
    private aliasMap = new Map<string, string>();
    private readonly textEncoder = new TextEncoder();
    private readonly mode: TempAliasTransformerMode;
    private readonly maxIdentifierLength: number;
    private detectOnly = false;
    private hasOverlongTempAlias = false;

    constructor(options: TempAliasTransformerOptions = {}) {
        super();
        this.mode = options.mode ?? 'alwaysCompact';
        // PostgreSQL limits identifier length to 63 bytes and silently truncates overlong aliases.
        const maxIdentifierLength = options.maxIdentifierLength ?? 63;
        if (!Number.isFinite(maxIdentifierLength) || !Number.isInteger(maxIdentifierLength) || maxIdentifierLength <= 0) {
            throw new RangeError('maxIdentifierLength must be a positive integer');
        }
        this.maxIdentifierLength = maxIdentifierLength;
    }

    run<T extends OperationNode>(node: T): T {
        this.aliasMap.clear();
        if (this.mode === 'compactLongNames') {
            const hasOverlongAliases = this.detectOverlongTempAlias(node);
            if (!hasOverlongAliases) {
                return node;
            }
        }
        return this.transformNode(node);
    }

    private detectOverlongTempAlias(node: OperationNode) {
        this.detectOnly = true;
        this.hasOverlongTempAlias = false;
        this.transformNode(node);
        this.detectOnly = false;
        return this.hasOverlongTempAlias;
    }

    protected override transformIdentifier(node: IdentifierNode, queryId?: QueryId): IdentifierNode {
        if (this.detectOnly) {
            if (!node.name.startsWith(TEMP_ALIAS_PREFIX)) {
                return node;
            }

            const aliasByteLength = this.textEncoder.encode(node.name).length;
            if (aliasByteLength > this.maxIdentifierLength) {
                this.hasOverlongTempAlias = true;
            }
            return node;
        }

        if (node.name.startsWith(TEMP_ALIAS_PREFIX)) {
            let mapped = this.aliasMap.get(node.name);
            if (!mapped) {
                mapped = `$$t${this.aliasMap.size + 1}`;
                this.aliasMap.set(node.name, mapped);
            }
            return IdentifierNode.create(mapped);
        }
        return super.transformIdentifier(node, queryId);
    }
}
