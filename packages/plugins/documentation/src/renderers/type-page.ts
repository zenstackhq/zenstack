import type { DataModel, TypeDef } from '@zenstackhq/language/ast';
import { resolveTypeName } from '../extractors';
import type { TypePageProps } from '../types';
import { breadcrumbs, generatedHeader, navigationFooter, orderFields, referencesSection, renderDescription, renderSimpleFieldsTable, renderSourceAndDeclaration, sectionHeading } from './common';

/** Renders the page header with breadcrumb and type badge. */
function renderHeader(props: TypePageProps): string[] {
    return [
        ...generatedHeader(props.options.genCtx),
        breadcrumbs('Types', props.typeDef.name, '../'),
        '',
        `# ${props.typeDef.name} <kbd>Type</kbd>`,
        '',
    ];
}

/** Finds all models/views that apply this type as a mixin via `with`. */
function collectUsedByModels(typeDef: TypeDef, allModels: DataModel[]): DataModel[] {
    return allModels
        .filter((m) => m.mixins.some((ref) => ref.ref?.name === typeDef.name))
        .sort((a, b) => a.name.localeCompare(b.name));
}

/** Renders cross-reference links to models/views that use this type as a mixin. */
function renderUsedBySection(typeDef: TypeDef, usedBy: DataModel[]): string[] {
    if (usedBy.length === 0) return [];
    const firstField = typeDef.fields[0]?.name;
    const lines = [...sectionHeading('Used By'), ''];
    for (const m of usedBy) {
        const dir = m.isView ? 'views' : 'models';
        const anchor = firstField ? `#field-${firstField}` : '';
        const fieldLinks = typeDef.fields
            .map((f) => `[\`${f.name}\`](../${dir}/${m.name}.md#field-${f.name})`)
            .join(', ');
        lines.push(`- [${m.name}](../${dir}/${m.name}.md${anchor}) — ${fieldLinks}`);
    }
    lines.push('');
    return lines;
}

/** Renders a Mermaid class diagram showing mixin inheritance relationships. */
function renderClassDiagram(typeDef: TypeDef, usedBy: DataModel[]): string[] {
    if (usedBy.length === 0) return [];
    const lines = ['```mermaid', 'classDiagram', `    class ${typeDef.name} {`, `        <<mixin>>`];
    for (const field of typeDef.fields) {
        lines.push(`        ${resolveTypeName(field.type)} ${field.name}`);
    }
    lines.push('    }');
    for (const m of usedBy) {
        lines.push(`    ${m.name} ..|> ${typeDef.name} : uses`);
    }
    lines.push('```', '');
    return lines;
}

/** Renders a full documentation page for a type definition, including fields, mixin usage, and a class diagram. */
export function renderTypePage(props: TypePageProps): string {
    const sortedFields = orderFields(props.typeDef.fields, props.options.fieldOrder);
    const usedBy = collectUsedByModels(props.typeDef, props.allModels);

    return [
        ...renderHeader(props),
        ...renderDescription(props.typeDef.comments),
        ...renderSourceAndDeclaration(props.typeDef, props.options.schemaDir),
        ...renderSimpleFieldsTable(sortedFields),
        ...renderUsedBySection(props.typeDef, usedBy),
        ...renderClassDiagram(props.typeDef, usedBy),
        ...referencesSection('type'),
        ...navigationFooter(props.navigation),
    ].join('\n');
}
