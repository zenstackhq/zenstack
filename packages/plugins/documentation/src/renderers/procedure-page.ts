import { isDataModel, isEnum, type Procedure } from '@zenstackhq/language/ast';
import { extractProcedureComments, getRelativeSourcePath } from '../extractors';
import { breadcrumbs, declarationBlock, generatedHeader, navigationFooter, referenceLink } from './common';
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
            } else {
                typeName = `[${ref.name}](../types/${ref.name}.md)`;
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

export function renderProcedurePage(proc: Procedure, options: RenderOptions, navigation?: Navigation): string {
    const lines: string[] = [
        ...generatedHeader(options.genCtx),
        breadcrumbs('Procedures', proc.name, '../'),
        '',
        `# ${proc.name} <kbd>${proc.mutation ? 'Mutation' : 'Query'}</kbd>`,
        '',
    ];

    const description = extractProcedureComments(proc);
    if (description) {
        for (const descLine of description.split('\n')) {
            lines.push(`> ${descLine}`);
        }
        lines.push('');
    }

    const sourcePath = getRelativeSourcePath(proc, options.schemaDir);
    if (sourcePath) {
        lines.push(`**Defined in:** \`${sourcePath}\``, '');
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

    lines.push(...referenceLink('procedure'));
    lines.push(...declarationBlock(proc.$cstNode?.text, sourcePath));

    lines.push(...navigationFooter(navigation));

    return lines.join('\n');
}
