import type { Procedure } from '@zenstackhq/language/ast';
import { extractProcedureComments, resolveTypeLink, resolveTypeName } from '../extractors';
import type { ProcedurePageProps } from '../types';
import { breadcrumbs, generatedHeader, navigationFooter, referencesSection, renderSourceAndDeclaration, sectionHeading } from './common';

/** Renders the page header with breadcrumb and mutation/query badge. */
function renderHeader(props: ProcedurePageProps): string[] {
    return [
        ...generatedHeader(props.options.genCtx),
        breadcrumbs('Procedures', props.proc.name, '../'),
        '',
        `# ${props.proc.name} <kbd>${props.proc.mutation ? 'Mutation' : 'Query'}</kbd>`,
        '',
    ];
}

/** Renders the procedure's doc comment as a blockquote. */
function renderProcDescription(proc: Procedure): string[] {
    const description = extractProcedureComments(proc);
    if (!description) return [];
    const lines: string[] = [];
    for (const descLine of description.split('\n')) {
        lines.push(`> ${descLine}`);
    }
    lines.push('');
    return lines;
}

/** Renders the procedure's parameters as a name/type/required table. */
function renderParametersSection(proc: Procedure): string[] {
    if (proc.params.length === 0) return [];
    const lines = [
        ...sectionHeading('Parameters'), '',
        '| Parameter | Type | Required |',
        '| --- | --- | --- |',
    ];
    for (const param of proc.params) {
        lines.push(`| \`${param.name}\` | ${resolveTypeLink(param.type, true)} | ${!param.optional ? 'Yes' : 'No'} |`);
    }
    lines.push('');
    return lines;
}

/** Renders the procedure's return type with linked type references. */
function renderReturnsSection(proc: Procedure): string[] {
    return [...sectionHeading('Returns'), '', resolveTypeLink(proc.returnType, true), ''];
}

/** Renders a Mermaid flowchart showing parameter inputs flowing through the procedure to its return type. */
function renderFlowDiagram(proc: Procedure): string[] {
    const lines = ['```mermaid', 'flowchart LR'];
    const procNodeId = `proc["${proc.name}"]`;
    if (proc.params.length > 0) {
        for (const param of proc.params) {
            const typeName = resolveTypeName(param.type);
            const suffix = param.optional ? '?' : '';
            const arrayMark = param.type.array ? '[]' : '';
            lines.push(`    ${param.name}["${param.name}: ${typeName}${arrayMark}${suffix}"] --> ${procNodeId}`);
        }
    } else {
        lines.push(`    input((" ")) --> ${procNodeId}`);
    }
    const retTypeName = resolveTypeName(proc.returnType);
    const retArray = proc.returnType.array ? '[]' : '';
    lines.push(`    ${procNodeId} --> ret["${retTypeName}${retArray}"]`);
    lines.push('```', '');
    return lines;
}

/** Renders a full documentation page for a procedure declaration. */
export function renderProcedurePage(props: ProcedurePageProps): string {
    return [
        ...renderHeader(props),
        ...renderProcDescription(props.proc),
        ...renderSourceAndDeclaration(props.proc, props.options.schemaDir),
        ...renderParametersSection(props.proc),
        ...renderReturnsSection(props.proc),
        ...renderFlowDiagram(props.proc),
        ...referencesSection('procedure'),
        ...navigationFooter(props.navigation),
    ].join('\n');
}
