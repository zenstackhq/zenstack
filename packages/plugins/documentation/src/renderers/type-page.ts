import type { DataModel, TypeDef } from '@zenstackhq/language/ast';
import { breadcrumbs, declarationBlock, generatedHeader, navigationFooter, referenceLink, renderDescription } from './common';
import type { Navigation } from '../types';
import {
    getDefaultValue,
    getFieldAttributes,
    getFieldTypeName,
    isFieldRequired,
    getRelativeSourcePath,
    stripCommentPrefix,
} from '../extractors';
import type { RenderOptions } from '../types';

export function renderTypePage(typeDef: TypeDef, _allModels: DataModel[], options: RenderOptions, navigation?: Navigation): string {
    const lines: string[] = [
        ...generatedHeader(options.genCtx),
        breadcrumbs('Types', typeDef.name, '../'),
        '',
        `# ${typeDef.name} <kbd>Type</kbd>`,
        '',
    ];

    lines.push(...renderDescription(typeDef.comments, stripCommentPrefix));

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
            const fieldAnchor = `<a id="field-${field.name}"></a>`;
            lines.push(
                `| ${fieldAnchor}${field.name} | ${getFieldTypeName(field, false)} | ${isFieldRequired(field) ? 'Yes' : 'No'} | ${getDefaultValue(field)} | ${getFieldAttributes(field)} | ${fieldDescription} |`,
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
        const firstField = typeDef.fields[0]?.name;
        for (const name of usedBy) {
            const anchor = firstField ? `#field-${firstField}` : '';
            const fieldLinks = typeDef.fields
                .map((f) => `[\`${f.name}\`](../models/${name}.md#field-${f.name})`)
                .join(', ');
            lines.push(`- [${name}](../models/${name}.md${anchor}) — ${fieldLinks}`);
        }
        lines.push('');

        lines.push('```mermaid');
        lines.push('classDiagram');
        lines.push(`    class ${typeDef.name} {`);
        lines.push(`        <<mixin>>`);
        for (const field of typeDef.fields) {
            lines.push(`        ${field.type.type ?? 'Unknown'} ${field.name}`);
        }
        lines.push('    }');
        for (const name of usedBy) {
            lines.push(`    ${name} ..|> ${typeDef.name} : uses`);
        }
        lines.push('```', '');
    }

    lines.push(...referenceLink('type'));
    lines.push(...declarationBlock(typeDef.$cstNode?.text, sourcePath));

    lines.push(...navigationFooter(navigation));

    return lines.join('\n');
}
