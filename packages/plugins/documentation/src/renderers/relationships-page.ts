import type { Relationship, RelationshipsPageProps } from '../types';
import { generatedHeader } from './common';

/** Renders the relationships page header with breadcrumb back to the index. */
function renderHeader(props: RelationshipsPageProps): string[] {
    return [
        ...generatedHeader(props.genCtx),
        '[Index](./index.md) / Relationships',
        '',
        '# Relationships',
        '',
    ];
}

/** Renders all relationships as a model/field/related-model/type cross-reference table. */
function renderCrossReferenceTable(relations: Relationship[]): string[] {
    if (relations.length === 0) return [];
    const lines = [
        '## Cross-Reference', '',
        '| Model | Field | Related Model | Type |',
        '| --- | --- | --- | --- |',
    ];
    for (const rel of relations) {
        lines.push(
            `| [${rel.from}](./models/${rel.from}.md) | ${rel.field} | [${rel.to}](./models/${rel.to}.md) | ${rel.type} |`,
        );
    }
    lines.push('');
    return lines;
}

/** Renders a Mermaid ER diagram with deduplicated relationship connectors. */
function renderErDiagram(relations: Relationship[]): string[] {
    const seen = new Set<string>();
    const mermaidLines: string[] = [];
    for (const rel of relations) {
        const key = `${[rel.from, rel.to].sort().join('--')}::${rel.field}`;
        if (seen.has(key)) continue;
        seen.add(key);

        if (rel.type === 'One→Many') {
            mermaidLines.push(`    ${rel.from} ||--o{ ${rel.to} : "${rel.field}"`);
        } else {
            mermaidLines.push(`    ${rel.from} }o--|| ${rel.to} : "${rel.field}"`);
        }
    }
    if (mermaidLines.length === 0) return [];
    return [
        '## Entity Relationship Diagram', '',
        '```mermaid', 'erDiagram',
        ...mermaidLines,
        '```', '',
    ];
}

/** Renders the relationships overview page with a cross-reference table and a Mermaid ER diagram. */
export function renderRelationshipsPage(props: RelationshipsPageProps): string {
    return [
        ...renderHeader(props),
        ...renderCrossReferenceTable(props.relations),
        ...renderErDiagram(props.relations),
    ].join('\n');
}
