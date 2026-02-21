import type { Navigation } from '../types';

const GENERATED_NOTICE = '> *This documentation was auto-generated. Do not edit directly.*';

export function generatedHeader(): string[] {
    return [GENERATED_NOTICE, ''];
}

export function breadcrumbs(
    entityType: 'Models' | 'Enums' | 'Types' | 'Procedures',
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

export function buildNavList(
    sortedNames: string[],
    pathPrefix: string,
): Map<string, Navigation> {
    const navMap = new Map<string, Navigation>();
    for (let i = 0; i < sortedNames.length; i++) {
        const nav: Navigation = {};
        if (i > 0) nav.prev = { name: sortedNames[i - 1], path: `${pathPrefix}${sortedNames[i - 1]}.md` };
        if (i < sortedNames.length - 1) nav.next = { name: sortedNames[i + 1], path: `${pathPrefix}${sortedNames[i + 1]}.md` };
        navMap.set(sortedNames[i], nav);
    }
    return navMap;
}
