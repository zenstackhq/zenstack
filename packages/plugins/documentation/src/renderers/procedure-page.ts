import { isDataModel, isEnum, isTypeDef, type Procedure } from '@zenstackhq/language/ast';
import { getRelativeSourcePath } from '../extractors';
import { breadcrumbs, generatedHeader, navigationFooter } from './common';
import type { Navigation, RenderOptions } from '../types';

function formatParamType(paramType: Procedure['returnType'], linked: boolean): string {
    let typeName: string;

    if (paramType.reference?.ref) {
        const ref = paramType.reference.ref;
        if (linked) {
            if (isDataModel(ref)) {
                typeName = `[${ref.name}](../models/${ref.name}.md)`;
            } else if (isEnum(ref)) {
                typeName = `[${ref.name}](../enums/${ref.name}.md)`;
            } else if (isTypeDef(ref)) {
                typeName = `[${ref.name}](../types/${ref.name}.md)`;
            } else {
                typeName = ref.name;
            }
        } else {
            typeName = ref.name;
        }
    } else if (paramType.type) {
        typeName = `\`${paramType.type}\``;
    } else {
        typeName = 'Unknown';
    }

    if (paramType.array) typeName += '[]';
    return typeName;
}

function extractProcedureComments(proc: Procedure): string {
    const cstText = proc.$cstNode?.text;
    if (!cstText) return '';
    const commentLines: string[] = [];
    for (const line of cstText.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('///')) {
            commentLines.push(trimmed.replace(/^\/\/\/\s?/, ''));
        } else {
            break;
        }
    }
    return commentLines.join('\n').trim();
}

export function renderProcedurePage(proc: Procedure, options: RenderOptions, navigation?: Navigation): string {
    const lines: string[] = [
        ...generatedHeader(),
        breadcrumbs('Procedures', proc.name, '../'),
        '',
        `# ${proc.name} <kbd>${proc.mutation ? 'Mutation' : 'Query'}</kbd>`,
        '',
    ];

    const description = extractProcedureComments(proc);
    if (description) {
        for (const line of description.split('\n')) {
            lines.push(`> ${line}`);
        }
        lines.push('');
    }

    if (proc.params.length > 0) {
        lines.push('## Parameters', '');
        lines.push('| Parameter | Type | Required |');
        lines.push('| --- | --- | --- |');

        for (const param of proc.params) {
            const required = !param.optional;
            const typeStr = formatParamType(param.type, true);
            lines.push(`| ${param.name} | ${typeStr} | ${required ? 'Yes' : 'No'} |`);
        }
        lines.push('');
    }

    const sourcePath = getRelativeSourcePath(proc, options.schemaDir);
    if (sourcePath) {
        lines.push(`**Defined in:** \`${sourcePath}\``, '');
    }

    lines.push('## Returns', '');
    lines.push(formatParamType(proc.returnType, true), '');

    lines.push('```mermaid');
    lines.push('flowchart LR');
    const procNodeId = `proc["${proc.name}"]`;
    if (proc.params.length > 0) {
        for (const param of proc.params) {
            const typeName = param.type.reference?.ref?.name ?? param.type.type ?? 'Unknown';
            const suffix = param.optional ? '?' : '';
            const arrayMark = param.type.array ? '[]' : '';
            lines.push(`    ${param.name}["${param.name}: ${typeName}${arrayMark}${suffix}"] --> ${procNodeId}`);
        }
    } else {
        lines.push(`    input((" ")) --> ${procNodeId}`);
    }
    const retTypeName = proc.returnType.reference?.ref?.name ?? proc.returnType.type ?? 'Unknown';
    const retArray = proc.returnType.array ? '[]' : '';
    lines.push(`    ${procNodeId} --> ret["${retTypeName}${retArray}"]`);
    lines.push('```', '');

    const cstText = proc.$cstNode?.text;
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
