import { isDataModel, type DataModel } from '@zenstackhq/language/ast';
import { collectFKFieldNames, getAttrName, resolveTypeName } from '../extractors';
import type { Relationship } from '../types';

interface FullErdProps {
    models: DataModel[];
    relations: Relationship[];
}

/** Builds a complete Mermaid erDiagram string with entity bodies and relationship connectors. */
export function buildFullErDiagram(props: FullErdProps): string {
    const { models, relations } = props;
    const lines: string[] = ['erDiagram'];

    for (const model of [...models].sort((a, b) => a.name.localeCompare(b.name))) {
        const fkNames = collectFKFieldNames(model.fields);
        const scalarFields = model.fields.filter(
            (f) => !(f.type.reference?.ref && isDataModel(f.type.reference.ref)),
        );

        lines.push(`    ${model.name} {`);
        for (const field of scalarFields) {
            const typeName = resolveTypeName(field.type);
            const hasId = field.attributes.some((a) => getAttrName(a) === '@id');
            const hasUnique = field.attributes.some((a) => getAttrName(a) === '@unique');
            let annotation = '';
            if (hasId) annotation = ' PK';
            else if (hasUnique) annotation = ' UK';
            else if (fkNames.has(field.name)) annotation = ' FK';
            lines.push(`        ${typeName} ${field.name}${annotation}`);
        }
        lines.push('    }');
    }

    const seen = new Set<string>();
    for (const rel of relations) {
        const key = [rel.from, rel.to].sort().join('--');
        if (seen.has(key)) continue;
        seen.add(key);

        if (rel.type === 'One\u2192Many') {
            lines.push(`    ${rel.from} ||--o{ ${rel.to} : "${rel.field}"`);
        } else {
            lines.push(`    ${rel.from} }o--|| ${rel.to} : "${rel.field}"`);
        }
    }

    return lines.join('\n') + '\n';
}

/** Renders the Mermaid ERD source to SVG using beautiful-mermaid. Returns null if unavailable. */
export async function renderErdSvg(mermaidSource: string, theme?: string): Promise<string | null> {
    try {
        const bm = await import('beautiful-mermaid');
        const themeObj = theme && bm.THEMES[theme] ? bm.THEMES[theme] : undefined;
        return await bm.renderMermaid(mermaidSource, themeObj);
    } catch {
        return null;
    }
}
