import type { DataModel, TypeDef } from '@zenstackhq/language/ast';
import { breadcrumbs, declarationBlock, generatedHeader, navigationFooter, referencesSection, renderDescription, sectionHeading } from './common';
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

/** Renders a full documentation page for a type definition, including fields, mixin usage, and a class diagram. */
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

    lines.push(...declarationBlock(typeDef.$cstNode?.text, sourcePath));

    const sortedFields =
        options.fieldOrder === 'alphabetical'
            ? [...typeDef.fields].sort((a, b) => a.name.localeCompare(b.name))
            : [...typeDef.fields];

    if (sortedFields.length > 0) {
        lines.push(...sectionHeading('Fields'), '');
        lines.push('| Field | Type | Required | Default | Attributes | Description |');
        lines.push('| --- | --- | --- | --- | --- | --- |');

        for (const field of sortedFields) {
            const fieldDescription = stripCommentPrefix(field.comments) || '—';
            const fieldAnchor = `<a id="field-${field.name}"></a>`;
            lines.push(
                `| ${fieldAnchor}\`${field.name}\` | ${getFieldTypeName(field, false)} | ${isFieldRequired(field) ? 'Yes' : 'No'} | ${getDefaultValue(field)} | ${getFieldAttributes(field)} | ${fieldDescription} |`,
            );
        }
        lines.push('');
    }

    const usedBy = _allModels
        .filter((m) => m.mixins.some((ref) => ref.ref?.name === typeDef.name))
        .map((m) => m.name)
        .sort();

    if (usedBy.length > 0) {
        lines.push(...sectionHeading('Used By'), '');
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

    lines.push(...referencesSection('type'));
    lines.push(...navigationFooter(navigation));

    return lines.join('\n');
}
