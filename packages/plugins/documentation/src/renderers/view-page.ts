import { type DataModel } from '@zenstackhq/language/ast';
import { breadcrumbs, declarationBlock, generatedHeader, navigationFooter, referenceLink, renderDescription, renderMetadata } from './common';
import {
    extractDocMeta,
    getDefaultValue,
    getFieldAttributes,
    getFieldTypeName,
    getRelativeSourcePath,
    isFieldRequired,
    stripCommentPrefix,
} from '../extractors';
import type { Navigation, RenderOptions } from '../types';

export function renderViewPage(view: DataModel, options: RenderOptions, navigation?: Navigation): string {
    const docMeta = extractDocMeta(view.attributes);
    const isDeprecated = !!docMeta.deprecated;
    const nameDisplay = isDeprecated ? `~~${view.name}~~` : view.name;
    const badges = isDeprecated ? ' <kbd>View</kbd> <kbd>Deprecated</kbd>' : ' <kbd>View</kbd>';

    const lines: string[] = [
        ...generatedHeader(options.genCtx),
        breadcrumbs('Views', view.name, '../'),
        '',
        `# ${nameDisplay}${badges}`,
        '',
    ];

    lines.push(...renderDescription(view.comments, stripCommentPrefix));
    const sourcePath = getRelativeSourcePath(view, options.schemaDir);
    lines.push(...renderMetadata(docMeta, sourcePath));

    const sortedFields =
        options.fieldOrder === 'alphabetical'
            ? [...view.fields].sort((a, b) => a.name.localeCompare(b.name))
            : [...view.fields];

    if (sortedFields.length > 0) {
        lines.push('## Fields', '');
        lines.push('| Field | Type | Required | Default | Attributes | Description |');
        lines.push('| --- | --- | --- | --- | --- | --- |');

        for (const field of sortedFields) {
            const fieldDescription = stripCommentPrefix(field.comments) || '—';
            const fieldAnchor = `<a id="field-${field.name}"></a>`;
            lines.push(
                `| ${fieldAnchor}${field.name} | ${getFieldTypeName(field, false)} | ${isFieldRequired(field) ? 'Yes' : 'No'} | ${getDefaultValue(field)} | ${getFieldAttributes(field)} | ${fieldDescription} |`,
            );
        }
        lines.push('');
    }

    lines.push(...referenceLink('view'));
    lines.push(...declarationBlock(view.$cstNode?.text, sourcePath));

    lines.push(...navigationFooter(navigation));

    return lines.join('\n');
}
