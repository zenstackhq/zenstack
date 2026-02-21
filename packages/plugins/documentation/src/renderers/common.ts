import type { DocMeta, GenerationContext, Navigation } from '../types';

export function generatedHeader(ctx?: GenerationContext): string[] {
    const lines = ['> [!CAUTION]', '> This documentation was auto-generated. Do not edit directly.'];
    if (ctx) {
        const parts: string[] = [];
        if (ctx.schemaFile) parts.push(`**Source:** \`${ctx.schemaFile}\``);
        parts.push(`**Generated:** ${ctx.generatedAt}`);
        lines.push(`> ${parts.join(' · ')}`);
    }
    lines.push('');
    return lines;
}

export function breadcrumbs(
    entityType: 'Models' | 'Views' | 'Enums' | 'Types' | 'Procedures',
    entityName: string,
    prefix: string,
): string {
    const anchor = entityType.toLowerCase();
    return `[Index](${prefix}index.md) / [${entityType}](${prefix}index.md#${anchor}) / ${entityName}`;
}

export function navigationFooter(nav: Navigation | undefined): string[] {
    if (!nav) return [];
    const parts: string[] = [];
    if (nav.prev) parts.push(`Previous: [${nav.prev.name}](${nav.prev.path})`);
    if (nav.next) parts.push(`Next: [${nav.next.name}](${nav.next.path})`);
    if (parts.length === 0) return [];
    return ['---', '', parts.join(' · '), ''];
}

const ZENSTACK_DOCS_BASE = 'https://zenstack.dev/docs/reference/zmodel';

const ENTITY_DOC_PATHS: Record<string, string> = {
    model: `${ZENSTACK_DOCS_BASE}/data-model`,
    enum: `${ZENSTACK_DOCS_BASE}/enum`,
    type: `${ZENSTACK_DOCS_BASE}/type`,
    view: `${ZENSTACK_DOCS_BASE}/view`,
    procedure: `${ZENSTACK_DOCS_BASE}/procedure`,
};

export function referenceLink(entityType: 'model' | 'enum' | 'type' | 'view' | 'procedure'): string[] {
    const url = ENTITY_DOC_PATHS[entityType];
    if (!url) return [];
    return [`*Learn more about ZModel ${entityType}s in the [ZenStack documentation](${url}).*`, ''];
}

export function declarationBlock(cstText: string | undefined, sourcePath: string | undefined): string[] {
    if (!cstText) return [];
    const summaryLabel = sourcePath ? `Declaration · <code>${sourcePath}</code>` : 'Declaration';
    return [
        '<details>',
        `<summary>${summaryLabel}</summary>`,
        '',
        '```prisma',
        cstText,
        '```',
        '',
        '</details>',
        '',
    ];
}

export function renderDescription(comments: string[], stripFn: (c: string[]) => string): string[] {
    const description = stripFn(comments);
    if (!description) return [];
    const lines: string[] = [];
    for (const line of description.split('\n')) {
        lines.push(`> ${line}`);
    }
    lines.push('');
    return lines;
}

export function renderMetadata(
    docMeta: DocMeta,
    sourcePath: string | undefined,
    extra?: { mappedTable?: string; dbSchema?: string },
): string[] {
    const parts: string[] = [];
    if (docMeta.category) parts.push(`**Category:** ${docMeta.category}`);
    if (docMeta.since) parts.push(`**Since:** ${docMeta.since}`);
    if (docMeta.deprecated) parts.push(`**Deprecated:** ${docMeta.deprecated}`);
    if (extra?.mappedTable) parts.push(`**Table:** \`${extra.mappedTable}\``);
    if (extra?.dbSchema) parts.push(`**Schema:** \`${extra.dbSchema}\``);
    if (sourcePath) parts.push(`**Defined in:** \`${sourcePath}\``);
    if (parts.length === 0) return [];
    return [parts.join(' · '), ''];
}

export function buildNavList(
    sortedNames: string[],
    pathPrefix: string,
): Map<string, Navigation> {
    const navMap = new Map<string, Navigation>();
    for (let i = 0; i < sortedNames.length; i++) {
        const current = sortedNames[i]!;
        const nav: Navigation = {};
        if (i > 0) {
            const prev = sortedNames[i - 1]!;
            nav.prev = { name: prev, path: `${pathPrefix}${prev}.md` };
        }
        if (i < sortedNames.length - 1) {
            const next = sortedNames[i + 1]!;
            nav.next = { name: next, path: `${pathPrefix}${next}.md` };
        }
        navMap.set(current, nav);
    }
    return navMap;
}
