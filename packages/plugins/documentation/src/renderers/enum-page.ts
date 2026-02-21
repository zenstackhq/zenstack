import { isEnum, type DataModel, type Enum } from '@zenstackhq/language/ast';
import { getAllFields } from '@zenstackhq/language/utils';
import { formatDefinedIn, stripCommentPrefix } from '../extractors';
import type { RenderOptions } from '../types';

export function renderEnumPage(enumDecl: Enum, allModels: DataModel[], options: RenderOptions): string {
    const lines: string[] = [
        `[Index](../index.md)`,
        '',
        `# ${enumDecl.name}`,
        '',
    ];

    const description = stripCommentPrefix(enumDecl.comments);
    if (description) {
        for (const line of description.split('\n')) {
            lines.push(`> ${line}`);
        }
        lines.push('');
    }

    const definedIn = formatDefinedIn(enumDecl, options.schemaDir);
    if (definedIn) lines.push(definedIn, '');

    if (enumDecl.fields.length > 0) {
        lines.push('## Values', '');
        lines.push('| Value | Description |');
        lines.push('| --- | --- |');

        for (const field of enumDecl.fields) {
            const fieldDesc = stripCommentPrefix(field.comments);
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

    if (usedBy.length > 0) {
        lines.push('## Used By', '');
        for (const name of usedBy) {
            lines.push(`- [${name}](../models/${name}.md)`);
        }
        lines.push('');
    }

    const cstText = enumDecl.$cstNode?.text;
    if (cstText) {
        lines.push('## Declaration', '');
        lines.push('```prisma');
        lines.push(cstText);
        lines.push('```', '');
    }

    return lines.join('\n');
}
