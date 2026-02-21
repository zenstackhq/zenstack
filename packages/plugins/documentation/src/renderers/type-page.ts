import type { DataModel, TypeDef } from '@zenstackhq/language/ast';
import { breadcrumbs, generatedHeader } from './common';
import {
    getDefaultValue,
    getFieldAttributes,
    getFieldTypeName,
    isFieldRequired,
    getRelativeSourcePath,
    stripCommentPrefix,
} from '../extractors';
import type { RenderOptions } from '../types';

export function renderTypePage(typeDef: TypeDef, _allModels: DataModel[], options: RenderOptions): string {
    const lines: string[] = [
        ...generatedHeader(),
        breadcrumbs('Types', typeDef.name, '../'),
        '',
        `# ${typeDef.name} <kbd>Type</kbd>`,
        '',
    ];

    const description = stripCommentPrefix(typeDef.comments);
    if (description) {
        for (const line of description.split('\n')) {
            lines.push(`> ${line}`);
        }
        lines.push('');
    }

    const sourcePath = getRelativeSourcePath(typeDef, options.schemaDir);
    if (sourcePath) {
        lines.push(`**Defined in:** \`${sourcePath}\``, '');
    }

    const sortedFields =
        options.fieldOrder === 'alphabetical'
            ? [...typeDef.fields].sort((a, b) => a.name.localeCompare(b.name))
            : [...typeDef.fields];

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

    const usedBy = _allModels
        .filter((m) => m.mixins.some((ref) => ref.ref?.name === typeDef.name))
        .map((m) => m.name)
        .sort();

    if (usedBy.length > 0) {
        lines.push('## Used By', '');
        for (const name of usedBy) {
            lines.push(`- [${name}](../models/${name}.md)`);
        }
        lines.push('');
    }

    const cstText = typeDef.$cstNode?.text;
    if (cstText) {
        lines.push('<details>');
        lines.push('<summary>Declaration</summary>', '');
        lines.push('```prisma');
        lines.push(cstText);
        lines.push('```', '');
        lines.push('</details>', '');
    }

    return lines.join('\n');
}
