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
