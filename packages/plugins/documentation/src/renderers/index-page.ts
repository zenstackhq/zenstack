import { isDataModel, isEnum, isProcedure, isTypeDef, type DataModel, type Model } from '@zenstackhq/language/ast';
import { extractDocMeta, extractProcedureComments, isIgnoredModel, stripCommentPrefix } from '../extractors';
import type { DocMeta, GenerationContext } from '../types';
import { generatedHeader } from './common';

function firstSentence(text: string): string {
    if (!text) return '';
    const match = text.match(/^[^.!?\n]+[.!?]?/);
    return match ? match[0].trim() : text.trim();
}

function formatIndexEntry(name: string, path: string, desc: string, meta: DocMeta): string {
    const suffix = desc ? ` — ${desc}` : '';
    if (meta.deprecated) {
        const reason = meta.deprecated;
        return `- ~~[${name}](${path})~~ — *Deprecated: ${reason}*${desc ? ` — ${desc}` : ''}`;
    }
    return `- [${name}](${path})${suffix}`;
}

function getModelPath(model: DataModel, groupBy: unknown): string {
    if (groupBy === 'category') {
        const meta = extractDocMeta(model.attributes);
        if (meta.category) {
            return `./models/${meta.category}/${model.name}.md`;
        }
    }
    return `./models/${model.name}.md`;
}

/** Renders the top-level index page listing all models, views, types, enums, and procedures. */
export function renderIndexPage(
    astModel: Model,
    pluginOptions: Record<string, unknown>,
    hasRelationships: boolean,
    genCtx?: GenerationContext,
): string {
    const title =
        typeof pluginOptions['title'] === 'string'
            ? pluginOptions['title']
            : 'Schema Documentation';

    const includeInternal = pluginOptions['includeInternalModels'] === true;
    const groupBy = pluginOptions['groupBy'];

    const allDataModels = astModel.declarations
        .filter(isDataModel)
        .filter((m) => includeInternal || !isIgnoredModel(m));

    const models = allDataModels
        .filter((m) => !m.isView)
        .sort((a, b) => a.name.localeCompare(b.name));

    const views = allDataModels
        .filter((m) => m.isView)
        .sort((a, b) => a.name.localeCompare(b.name));

    const types = astModel.declarations
        .filter(isTypeDef)
        .sort((a, b) => a.name.localeCompare(b.name));

    const enums = astModel.declarations
        .filter(isEnum)
        .sort((a, b) => a.name.localeCompare(b.name));

    const procedures = astModel.declarations
        .filter(isProcedure)
        .sort((a, b) => a.name.localeCompare(b.name));

    const lines: string[] = [...generatedHeader(genCtx), `# ${title}`, ''];

    lines.push(
        'This documentation describes a [ZModel](https://zenstack.dev/docs/reference/zmodel/overview) schema' +
        ' — the data modeling language used by [ZenStack](https://zenstack.dev/).',
        '',
    );

    const summaryParts: string[] = [];
    if (models.length > 0) summaryParts.push(`${models.length} ${models.length === 1 ? 'model' : 'models'}`);
    if (views.length > 0) summaryParts.push(`${views.length} ${views.length === 1 ? 'view' : 'views'}`);
    if (types.length > 0) summaryParts.push(`${types.length} ${types.length === 1 ? 'type' : 'types'}`);
    if (enums.length > 0) summaryParts.push(`${enums.length} ${enums.length === 1 ? 'enum' : 'enums'}`);
    if (procedures.length > 0) summaryParts.push(`${procedures.length} ${procedures.length === 1 ? 'procedure' : 'procedures'}`);
    if (summaryParts.length > 0) {
        lines.push(`> ${summaryParts.join(' · ')}`, '');
    }

    const tocParts: string[] = [];
    if (models.length > 0) tocParts.push('[Models](#models)');
    if (views.length > 0) tocParts.push('[Views](#views)');
    if (types.length > 0) tocParts.push('[Types](#types)');
    if (enums.length > 0) tocParts.push('[Enums](#enums)');
    if (procedures.length > 0) tocParts.push('[Procedures](#procedures)');
    if (hasRelationships) tocParts.push('[Relationships](./relationships.md)');
    if (tocParts.length > 0) {
        lines.push(tocParts.join(' · '), '');
    }

    if (models.length > 0) {
        lines.push('<a id="models"></a>', '', '## 🗃️ Models', '');
        for (const m of models) {
            const desc = firstSentence(stripCommentPrefix(m.comments));
            const meta = extractDocMeta(m.attributes);
            lines.push(formatIndexEntry(m.name, getModelPath(m, groupBy), desc, meta));
        }
        lines.push('');
    }

    if (views.length > 0) {
        lines.push('<a id="views"></a>', '', '## 👁️ Views', '');
        for (const v of views) {
            const desc = firstSentence(stripCommentPrefix(v.comments));
            const meta = extractDocMeta(v.attributes);
            lines.push(formatIndexEntry(v.name, `./views/${v.name}.md`, desc, meta));
        }
        lines.push('');
    }

    if (types.length > 0) {
        lines.push('<a id="types"></a>', '', '## 🧩 Types', '');
        for (const t of types) {
            const desc = firstSentence(stripCommentPrefix(t.comments));
            const suffix = desc ? ` — ${desc}` : '';
            lines.push(`- [${t.name}](./types/${t.name}.md)${suffix}`);
        }
        lines.push('');
    }

    if (enums.length > 0) {
        lines.push('<a id="enums"></a>', '', '## 📋 Enums', '');
        for (const e of enums) {
            const desc = firstSentence(stripCommentPrefix(e.comments));
            const suffix = desc ? ` — ${desc}` : '';
            lines.push(`- [${e.name}](./enums/${e.name}.md)${suffix}`);
        }
        lines.push('');
    }

    if (procedures.length > 0) {
        lines.push('<a id="procedures"></a>', '', '## ⚡ Procedures', '');
        for (const proc of procedures) {
            const kind = proc.mutation ? 'mutation' : 'query';
            const desc = firstSentence(extractProcedureComments(proc, ' '));
            const descSuffix = desc ? ` — ${desc}` : '';
            lines.push(`- [${proc.name}](./procedures/${proc.name}.md) · *${kind}*${descSuffix}`);
        }
        lines.push('');
    }

    if (hasRelationships) {
        lines.push('<a id="see-also"></a>', '', '## 📎 See Also', '');
        lines.push('- [Relationships](./relationships.md)', '');
    }

    if (genCtx?.durationMs != null && genCtx.filesGenerated != null) {
        lines.push('---', '');
        lines.push('<details>');
        lines.push('<summary>Generation Stats</summary>', '');
        lines.push(`| Metric | Value |`);
        lines.push(`| --- | --- |`);
        lines.push(`| **Files** | ${genCtx.filesGenerated} |`);
        lines.push(`| **Duration** | ${genCtx.durationMs} ms |`);
        lines.push(`| **Source** | \`${genCtx.schemaFile}\` |`);
        lines.push(`| **Generated** | ${genCtx.generatedAt} |`);
        lines.push('', '</details>', '');
    }

    return lines.join('\n');
}
