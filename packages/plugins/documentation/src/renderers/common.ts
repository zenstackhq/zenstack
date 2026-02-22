import type { DocMeta, GenerationContext, Navigation } from '../types';

const SECTION_EMOJI: Record<string, string> = {
    'Mixins': '🧩',
    'Entity Diagram': '📊',
    'Fields': '📋',
    'Relationships': '🔗',
    'Access Policies': '🔐',
    'Indexes': '📇',
    'Validation Rules': '✅',
    'Used in Procedures': '⚡',
    'Values': '📋',
    'Used By': '🔗',
    'Parameters': '📥',
    'Returns': '📤',
    'References': '📚',
};

/** Returns an anchor element and a level-2 heading with an emoji prefix for the given section name. */
export function sectionHeading(name: string): string[] {
    const emoji = SECTION_EMOJI[name] ?? '';
    const anchor = name.toLowerCase().replace(/\s+/g, '-');
    const prefix = emoji ? `${emoji} ` : '';
    return [`<a id="${anchor}"></a>`, '', `## ${prefix}${name}`];
}

/** Renders the auto-generated header banner with optional source file and generation date. */
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

/** Renders an Index / Category / Entity breadcrumb trail. */
export function breadcrumbs(
    entityType: 'Models' | 'Views' | 'Enums' | 'Types' | 'Procedures',
    entityName: string,
    prefix: string,
): string {
    const anchor = entityType.toLowerCase();
    return `[Index](${prefix}index.md) / [${entityType}](${prefix}index.md#${anchor}) / \`${entityName}\``;
}

/** Renders previous/next navigation links at the bottom of entity pages. */
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
    model: `${ZENSTACK_DOCS_BASE}/model`,
    enum: `${ZENSTACK_DOCS_BASE}/enum`,
    type: `${ZENSTACK_DOCS_BASE}/type`,
    view: `${ZENSTACK_DOCS_BASE}/view`,
    procedure: 'https://zenstack.dev/docs/category/reference',
};

/** Renders a "References" section linking to the official ZenStack documentation for the entity type. */
export function referencesSection(entityType: 'model' | 'enum' | 'type' | 'view' | 'procedure'): string[] {
    const url = ENTITY_DOC_PATHS[entityType];
    if (!url) return [];
    return [
        '---', '',
        ...sectionHeading('References'), '',
        `- [ZModel ${entityType}s — ZenStack documentation](${url})`,
        '',
    ];
}

/** Renders a collapsible `<details>` block containing the raw ZModel declaration and optional source path. */
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

/** Renders a blockquoted description from doc-comments. */
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

/** Renders category, since, deprecated, table mapping, and source path metadata as a single line. */
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

/** Builds a `Map<name, Navigation>` with prev/next links for a sorted list of entity names. */
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
