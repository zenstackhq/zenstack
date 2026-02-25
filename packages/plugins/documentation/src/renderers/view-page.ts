import { type DataModel } from '@zenstackhq/language/ast';
import { extractDocMeta, getRelativeSourcePath, resolveTypeName } from '../extractors';
import type { ViewPageProps } from '../types';
import { breadcrumbs, declarationBlock, generatedHeader, navigationFooter, orderFields, referencesSection, renderDescription, renderMetadata, renderSimpleFieldsTable } from './common';

/** Renders the page header with view badge and optional deprecation marker. */
function renderHeader(props: ViewPageProps): string[] {
    const docMeta = extractDocMeta(props.view.attributes);
    const isDeprecated = !!docMeta.deprecated;
    const nameDisplay = isDeprecated ? `~~${props.view.name}~~` : props.view.name;
    const badges = isDeprecated ? ' <kbd>View</kbd> <kbd>Deprecated</kbd>' : ' <kbd>View</kbd>';

    return [
        ...generatedHeader(props.options.genCtx),
        breadcrumbs('Views', props.view.name, '../'),
        '',
        `# ${nameDisplay}${badges}`,
        '',
    ];
}

/** Renders doc metadata and a collapsible declaration block for the view. */
function renderMetadataBlock(props: ViewPageProps): string[] {
    const docMeta = extractDocMeta(props.view.attributes);
    const sourcePath = getRelativeSourcePath(props.view, props.options.schemaDir);
    return [
        ...renderMetadata(docMeta, sourcePath),
        ...declarationBlock(props.view.$cstNode?.text, sourcePath),
    ];
}

/** Renders a single-entity Mermaid ER diagram listing the view's fields. */
function renderErDiagram(view: DataModel): string[] {
    if (view.fields.length === 0) return [];
    const lines = ['```mermaid', 'erDiagram', `    ${view.name} {`];
    for (const field of view.fields) {
        lines.push(`        ${resolveTypeName(field.type)} ${field.name}`);
    }
    lines.push('    }', '```', '');
    return lines;
}

/** Renders a full documentation page for a database view, including an ER diagram and fields table. */
export function renderViewPage(props: ViewPageProps): string {
    const sortedFields = orderFields(props.view.fields, props.options.fieldOrder);

    return [
        ...renderHeader(props),
        ...renderDescription(props.view.comments),
        ...renderMetadataBlock(props),
        ...renderErDiagram(props.view),
        ...renderSimpleFieldsTable(sortedFields),
        ...referencesSection('view'),
        ...navigationFooter(props.navigation),
    ].join('\n');
}
