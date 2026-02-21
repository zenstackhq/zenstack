import { isEnum, type DataModel, type Enum } from '@zenstackhq/language/ast';
import { breadcrumbs, declarationBlock, generatedHeader, navigationFooter, referenceLink } from './common';
import { getAllFields } from '@zenstackhq/language/utils';
import { getRelativeSourcePath, stripCommentPrefix } from '../extractors';
import type { Navigation, RenderOptions } from '../types';

export function renderEnumPage(enumDecl: Enum, allModels: DataModel[], options: RenderOptions, navigation?: Navigation): string {
    const lines: string[] = [
        ...generatedHeader(options.genCtx),
        breadcrumbs('Enums', enumDecl.name, '../'),
        '',
        `# ${enumDecl.name} <kbd>Enum</kbd>`,
        '',
    ];

    const description = stripCommentPrefix(enumDecl.comments);
    if (description) {
        for (const line of description.split('\n')) {
            lines.push(`> ${line}`);
        }
        lines.push('');
    }

    const sourcePath = getRelativeSourcePath(enumDecl, options.schemaDir);
    if (sourcePath) {
        lines.push(`**Defined in:** \`${sourcePath}\``, '');
    }

    if (enumDecl.fields.length > 0) {
        lines.push('## Values', '');
        lines.push('| Value | Description |');
        lines.push('| --- | --- |');

        for (const field of enumDecl.fields) {
            const fieldDesc = stripCommentPrefix(field.comments) || '—';
            lines.push(`| ${field.name} | ${fieldDesc} |`);
        }
        lines.push('');
    }

    const usedBy = allModels
        .filter((m) =>
            getAllFields(m).some(
                (f) =>
                    f.type.reference?.ref &&
                    isEnum(f.type.reference.ref) &&
                    f.type.reference.ref.name === enumDecl.name,
            ),
        )
        .map((m) => m.name)
        .sort();

    const usageDetails: Array<{ modelName: string; fieldNames: string[] }> = [];
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
            usageDetails.push({ modelName: m.name, fieldNames: fields });
        }
    }
    usageDetails.sort((a, b) => a.modelName.localeCompare(b.modelName));

    if (usedBy.length > 0) {
        lines.push('## Used By', '');
        for (const { modelName, fieldNames } of usageDetails) {
            const fieldLinks = fieldNames
                .map((f) => `[\`${f}\`](../models/${modelName}.md#field-${f})`)
                .join(', ');
            lines.push(`- [${modelName}](../models/${modelName}.md) — ${fieldLinks}`);
        }
        lines.push('');

        lines.push('```mermaid');
        lines.push('classDiagram');
        lines.push(`    class ${enumDecl.name} {`);
        lines.push(`        <<enumeration>>`);
        for (const field of enumDecl.fields) {
            lines.push(`        ${field.name}`);
        }
        lines.push('    }');
        for (const { modelName, fieldNames } of usageDetails) {
            const label = fieldNames.join(', ');
            lines.push(`    ${modelName} --> ${enumDecl.name} : ${label}`);
        }
        lines.push('```', '');
    }

    lines.push(...referenceLink('enum'));
    lines.push(...declarationBlock(enumDecl.$cstNode?.text, sourcePath));

    lines.push(...navigationFooter(navigation));

    return lines.join('\n');
}
