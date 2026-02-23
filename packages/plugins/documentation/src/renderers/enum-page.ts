import { isEnum, type DataModel, type Enum } from '@zenstackhq/language/ast';
import { getAllFields } from '@zenstackhq/language/utils';
import { stripCommentPrefix } from '../extractors';
import type { EnumPageProps } from '../types';
import { breadcrumbs, generatedHeader, navigationFooter, referencesSection, renderDescription, renderSourceAndDeclaration, sectionHeading } from './common';

interface EnumUsage {
    modelName: string;
    fieldNames: string[];
    isView: boolean;
}

/** Finds all models/views that reference this enum and which fields use it. */
function collectEnumUsage(enumDecl: Enum, allModels: DataModel[]): EnumUsage[] {
    const usages: EnumUsage[] = [];
    for (const m of allModels) {
        const fields = getAllFields(m)
            .filter(
                (f) =>
                    f.type.reference?.ref &&
                    isEnum(f.type.reference.ref) &&
                    f.type.reference.ref.name === enumDecl.name,
            )
            .map((f) => f.name);
        if (fields.length > 0) {
            usages.push({ modelName: m.name, fieldNames: fields, isView: !!m.isView });
        }
    }
    return usages.sort((a, b) => a.modelName.localeCompare(b.modelName));
}

/** Renders the page header with breadcrumb, title, and enum badge. */
function renderHeader(props: EnumPageProps): string[] {
    return [
        ...generatedHeader(props.options.genCtx),
        breadcrumbs('Enums', props.enumDecl.name, '../'),
        '',
        `# ${props.enumDecl.name} <kbd>Enum</kbd>`,
        '',
    ];
}

/** Renders the enum values as a two-column table (value + description). */
function renderValuesSection(enumDecl: Enum): string[] {
    if (enumDecl.fields.length === 0) return [];
    const lines = [...sectionHeading('Values'), '', '| Value | Description |', '| --- | --- |'];
    for (const field of enumDecl.fields) {
        const fieldDesc = stripCommentPrefix(field.comments) || '—';
        lines.push(`| \`${field.name}\` | ${fieldDesc} |`);
    }
    lines.push('');
    return lines;
}

/** Renders cross-reference links to models/views that use this enum. */
function renderUsedBySection(_enumDecl: Enum, usages: EnumUsage[]): string[] {
    if (usages.length === 0) return [];
    const lines = [...sectionHeading('Used By'), ''];
    for (const { modelName, fieldNames, isView } of usages) {
        const dir = isView ? 'views' : 'models';
        const fieldLinks = fieldNames
            .map((f) => `[\`${f}\`](../${dir}/${modelName}.md#field-${f})`)
            .join(', ');
        lines.push(`- [${modelName}](../${dir}/${modelName}.md) — ${fieldLinks}`);
    }
    lines.push('');
    return lines;
}

/** Renders a Mermaid class diagram showing which models reference this enum. */
function renderUsageDiagram(enumDecl: Enum, usages: EnumUsage[]): string[] {
    if (usages.length === 0) return [];
    const lines = ['```mermaid', 'classDiagram', `    class ${enumDecl.name} {`, `        <<enumeration>>`];
    for (const field of enumDecl.fields) {
        lines.push(`        ${field.name}`);
    }
    lines.push('    }');
    for (const { modelName, fieldNames } of usages) {
        lines.push(`    ${modelName} --> ${enumDecl.name} : ${fieldNames.join(', ')}`);
    }
    lines.push('```', '');
    return lines;
}

/** Renders a full documentation page for an enum, including values, usage, and a class diagram. */
export function renderEnumPage(props: EnumPageProps): string {
    const usages = collectEnumUsage(props.enumDecl, props.allModels);

    return [
        ...renderHeader(props),
        ...renderDescription(props.enumDecl.comments),
        ...renderSourceAndDeclaration(props.enumDecl, props.options.schemaDir),
        ...renderValuesSection(props.enumDecl),
        ...renderUsedBySection(props.enumDecl, usages),
        ...renderUsageDiagram(props.enumDecl, usages),
        ...referencesSection('enum'),
        ...navigationFooter(props.navigation),
    ].join('\n');
}
