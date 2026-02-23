import { isDataModel, isEnum, isProcedure, isTypeDef, type DataModel, type Enum, type Procedure, type TypeDef } from '@zenstackhq/language/ast';
import { extractDocMeta, extractProcedureComments, isIgnoredModel, stripCommentPrefix } from '../extractors';
import type { DocMeta, GenerationContext, IndexPageProps } from '../types';
import { generatedHeader } from './common';

/** Extracts the first sentence from a text block for use as a brief description. */
function firstSentence(text: string): string {
    if (!text) return '';
    const match = text.match(/^[^.!?\n]+[.!?]?/);
    return match ? match[0].trim() : text.trim();
}

/** Formats an index list entry with optional deprecation strikethrough and description. */
function formatIndexEntry(name: string, path: string, desc: string, meta: DocMeta): string {
    const suffix = desc ? ` — ${desc}` : '';
    if (meta.deprecated) {
        const reason = meta.deprecated;
        return `- ~~[${name}](${path})~~ — *Deprecated: ${reason}*${desc ? ` — ${desc}` : ''}`;
    }
    return `- [${name}](${path})${suffix}`;
}

interface IndexData {
    title: string;
    models: DataModel[];
    views: DataModel[];
    types: TypeDef[];
    enums: Enum[];
    procedures: Procedure[];
    hasRelationships: boolean;
    hasErdSvg: boolean;
    hasErdMmd: boolean;
    genCtx?: GenerationContext;
}

/** Extracts and sorts all entity declarations from the AST into categorized lists. */
function resolveIndexData(props: IndexPageProps): IndexData {
    const { astModel, pluginOptions, hasRelationships, genCtx } = props;
    const title = pluginOptions.title ?? 'Schema Documentation';
    const includeInternal = pluginOptions.includeInternalModels === true;

    const allDataModels = astModel.declarations
        .filter(isDataModel)
        .filter((m) => includeInternal || !isIgnoredModel(m));

    return {
        title,
        models: allDataModels.filter((m) => !m.isView).sort((a, b) => a.name.localeCompare(b.name)),
        views: allDataModels.filter((m) => m.isView).sort((a, b) => a.name.localeCompare(b.name)),
        types: astModel.declarations.filter(isTypeDef).sort((a, b) => a.name.localeCompare(b.name)),
        enums: astModel.declarations.filter(isEnum).sort((a, b) => a.name.localeCompare(b.name)),
        procedures: astModel.declarations.filter(isProcedure).sort((a, b) => a.name.localeCompare(b.name)),
        hasRelationships,
        hasErdSvg: props.hasErdSvg === true,
        hasErdMmd: props.hasErdMmd === true,
        genCtx,
    };
}

/** Renders the index page title and introductory text. */
function renderPageHeader(data: IndexData): string[] {
    return [
        ...generatedHeader(data.genCtx),
        `# ${data.title}`, '',
        'This documentation describes a [ZModel](https://zenstack.dev/docs/reference/zmodel/overview) schema' +
        ' — the data modeling language used by [ZenStack](https://zenstack.dev/).', '',
    ];
}

/** Renders a blockquote banner summarizing entity counts (e.g. "5 models · 2 enums"). */
function renderSummaryBanner(data: IndexData): string[] {
    const parts: string[] = [];
    if (data.models.length > 0) parts.push(`${data.models.length} ${data.models.length === 1 ? 'model' : 'models'}`);
    if (data.views.length > 0) parts.push(`${data.views.length} ${data.views.length === 1 ? 'view' : 'views'}`);
    if (data.types.length > 0) parts.push(`${data.types.length} ${data.types.length === 1 ? 'type' : 'types'}`);
    if (data.enums.length > 0) parts.push(`${data.enums.length} ${data.enums.length === 1 ? 'enum' : 'enums'}`);
    if (data.procedures.length > 0) parts.push(`${data.procedures.length} ${data.procedures.length === 1 ? 'procedure' : 'procedures'}`);
    if (parts.length === 0) return [];
    return [`> ${parts.join(' · ')}`, ''];
}

/** Renders inline navigation links to each entity category section. */
function renderTableOfContents(data: IndexData): string[] {
    const parts: string[] = [];
    if (data.models.length > 0) parts.push('[Models](#models)');
    if (data.views.length > 0) parts.push('[Views](#views)');
    if (data.types.length > 0) parts.push('[Types](#types)');
    if (data.enums.length > 0) parts.push('[Enums](#enums)');
    if (data.procedures.length > 0) parts.push('[Procedures](#procedures)');
    if (data.hasRelationships) parts.push('[Relationships](./relationships.md)');
    if (data.hasErdSvg || data.hasErdMmd) parts.push('[ERD](#erd)');
    if (parts.length === 0) return [];
    return [parts.join(' · '), ''];
}

/** Renders the models listing with descriptions and deprecation markers. */
function renderModelsSection(data: IndexData): string[] {
    if (data.models.length === 0) return [];
    const lines = ['<a id="models"></a>', '', '## 🗃️ Models', ''];
    for (const m of data.models) {
        const desc = firstSentence(stripCommentPrefix(m.comments));
        const meta = extractDocMeta(m.attributes);
        lines.push(formatIndexEntry(m.name, `./models/${m.name}.md`, desc, meta));
    }
    lines.push('');
    return lines;
}

/** Renders the views listing with descriptions and deprecation markers. */
function renderViewsSection(data: IndexData): string[] {
    if (data.views.length === 0) return [];
    const lines = ['<a id="views"></a>', '', '## 👁️ Views', ''];
    for (const v of data.views) {
        const desc = firstSentence(stripCommentPrefix(v.comments));
        const meta = extractDocMeta(v.attributes);
        lines.push(formatIndexEntry(v.name, `./views/${v.name}.md`, desc, meta));
    }
    lines.push('');
    return lines;
}

/** Renders the types listing with descriptions and deprecation markers. */
function renderTypesSection(data: IndexData): string[] {
    if (data.types.length === 0) return [];
    const lines = ['<a id="types"></a>', '', '## 🧩 Types', ''];
    for (const t of data.types) {
        const desc = firstSentence(stripCommentPrefix(t.comments));
        const meta = extractDocMeta(t.attributes);
        lines.push(formatIndexEntry(t.name, `./types/${t.name}.md`, desc, meta));
    }
    lines.push('');
    return lines;
}

/** Renders the enums listing with descriptions and deprecation markers. */
function renderEnumsSection(data: IndexData): string[] {
    if (data.enums.length === 0) return [];
    const lines = ['<a id="enums"></a>', '', '## 🏷️ Enums', ''];
    for (const e of data.enums) {
        const desc = firstSentence(stripCommentPrefix(e.comments));
        const meta = extractDocMeta(e.attributes);
        lines.push(formatIndexEntry(e.name, `./enums/${e.name}.md`, desc, meta));
    }
    lines.push('');
    return lines;
}

/** Renders the procedures listing with mutation/query badges and descriptions. */
function renderProceduresSection(data: IndexData): string[] {
    if (data.procedures.length === 0) return [];
    const lines = ['<a id="procedures"></a>', '', '## ⚡ Procedures', ''];
    for (const proc of data.procedures) {
        const kind = proc.mutation ? 'mutation' : 'query';
        const desc = firstSentence(extractProcedureComments(proc, ' '));
        const descSuffix = desc ? ` — ${desc}` : '';
        lines.push(`- [${proc.name}](./procedures/${proc.name}.md) · *${kind}*${descSuffix}`);
    }
    lines.push('');
    return lines;
}

/** Renders the ERD section, conditionally embedding SVG and/or linking Mermaid source. */
function renderErdSection(data: IndexData): string[] {
    if (!data.hasErdSvg && !data.hasErdMmd) return [];
    const lines = ['<a id="erd"></a>', '', '## 🗺️ Entity Relationship Diagram', ''];
    if (data.hasErdSvg) {
        lines.push('![Entity Relationship Diagram](./schema-erd.svg)', '');
    }
    if (data.hasErdMmd) {
        lines.push(`> [Mermaid source](./schema-erd.mmd)`, '');
    }
    return lines;
}

/** Renders a "See Also" section linking to the relationships page. */
function renderSeeAlso(data: IndexData): string[] {
    if (!data.hasRelationships) return [];
    return ['<a id="see-also"></a>', '', '## 📎 See Also', '', '- [Relationships](./relationships.md)', ''];
}

/** Renders a collapsible footer with generation stats (files, duration, source, date). */
function renderGenerationStats(genCtx?: GenerationContext): string[] {
    if (genCtx?.durationMs == null || genCtx.filesGenerated == null) return [];
    return [
        '---', '',
        '<details>',
        '<summary>Generation Stats</summary>', '',
        `| Metric | Value |`,
        `| --- | --- |`,
        `| **Files** | ${genCtx.filesGenerated} |`,
        `| **Duration** | ${genCtx.durationMs} ms |`,
        `| **Source** | \`${genCtx.schemaFile}\` |`,
        `| **Generated** | ${genCtx.generatedAt} |`,
        '', '</details>', '',
    ];
}

/** Renders the top-level index page listing all models, views, types, enums, and procedures. */
export function renderIndexPage(props: IndexPageProps): string {
    const data = resolveIndexData(props);

    return [
        ...renderPageHeader(data),
        ...renderSummaryBanner(data),
        ...renderTableOfContents(data),
        ...renderModelsSection(data),
        ...renderViewsSection(data),
        ...renderTypesSection(data),
        ...renderEnumsSection(data),
        ...renderProceduresSection(data),
        ...renderErdSection(data),
        ...renderSeeAlso(data),
        ...renderGenerationStats(data.genCtx),
    ].join('\n');
}
