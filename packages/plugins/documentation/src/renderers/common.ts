import type { GenerationContext, Navigation } from '../types';

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
