import type { Relationship } from '../types';
import { generatedHeader } from './common';

export function renderRelationshipsPage(relations: Relationship[]): string {
    const lines: string[] = [
        ...generatedHeader(),
        '[Index](./index.md)',
        '',
        '# Relationships',
        '',
    ];

    lines.push('## Cross-Reference', '');
    lines.push('| Model | Field | Related Model | Type |');
    lines.push('| --- | --- | --- | --- |');
    for (const rel of relations) {
        lines.push(
            `| [${rel.from}](./models/${rel.from}.md) | ${rel.field} | [${rel.to}](./models/${rel.to}.md) | ${rel.type} |`,
        );
    }
    lines.push('');

    const seen = new Set<string>();
    const mermaidLines: string[] = [];
    for (const rel of relations) {
        const key = [rel.from, rel.to].sort().join('--');
        if (seen.has(key)) continue;
        seen.add(key);

        let mermaidRel: string;
        if (rel.type.includes('Many')) {
            mermaidRel = `    ${rel.from} ||--o{ ${rel.to} : "${rel.field}"`;
        } else {
            mermaidRel = `    ${rel.from} ||--|| ${rel.to} : "${rel.field}"`;
        }
        mermaidLines.push(mermaidRel);
    }

    if (mermaidLines.length > 0) {
        lines.push('## Entity Relationship Diagram', '');
        lines.push('```mermaid');
        lines.push('erDiagram');
        lines.push(...mermaidLines);
        lines.push('```', '');
    }

    return lines.join('\n');
}
