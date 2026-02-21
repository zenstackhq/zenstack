import { type DataModel } from '@zenstackhq/language/ast';
import { breadcrumbs, generatedHeader, navigationFooter } from './common';
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
        ...generatedHeader(),
        breadcrumbs('Views', view.name, '../'),
        '',
        `# ${nameDisplay}${badges}`,
        '',
    ];

    const description = stripCommentPrefix(view.comments);
    if (description) {
        for (const line of description.split('\n')) {
            lines.push(`> ${line}`);
        }
        lines.push('');
    }
    const sourcePath = getRelativeSourcePath(view, options.schemaDir);

    const metaParts: string[] = [];
    if (docMeta.category) metaParts.push(`**Category:** ${docMeta.category}`);
    if (docMeta.since) metaParts.push(`**Since:** ${docMeta.since}`);
    if (docMeta.deprecated) metaParts.push(`**Deprecated:** ${docMeta.deprecated}`);
    if (sourcePath) metaParts.push(`**Defined in:** \`${sourcePath}\``);

    if (metaParts.length > 0) {
        lines.push(metaParts.join(' · '), '');
    }

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
            lines.push(
                `| ${field.name} | ${getFieldTypeName(field, false)} | ${isFieldRequired(field) ? 'Yes' : 'No'} | ${getDefaultValue(field)} | ${getFieldAttributes(field)} | ${fieldDescription} |`,
            );
        }
        lines.push('');
    }

    const cstText = view.$cstNode?.text;
    if (cstText) {
        lines.push('<details>');
        lines.push('<summary>Declaration</summary>', '');
        lines.push('```prisma');
        lines.push(cstText);
        lines.push('```', '');
        lines.push('</details>', '');
    }

    lines.push(...navigationFooter(navigation));

    return lines.join('\n');
}
