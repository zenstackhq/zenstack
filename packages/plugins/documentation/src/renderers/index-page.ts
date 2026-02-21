import { isDataModel, isEnum, isProcedure, isTypeDef, type DataModel, type Model } from '@zenstackhq/language/ast';
import { extractDocMeta, isIgnoredModel, stripCommentPrefix } from '../extractors';
import type { DocMeta } from '../types';
import { generatedHeader } from './common';

function extractProcedureDescription(proc: { $cstNode?: { text?: string } }): string {
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
    return commentLines.join(' ').trim();
}

function firstSentence(text: string): string {
    if (!text) return '';
    const match = text.match(/^[^.!?\n]+[.!?]?/);
    return match ? match[0].trim() : text.trim();
}

function formatIndexEntry(name: string, path: string, desc: string, meta: DocMeta): string {
    const suffix = desc ? ` — ${desc}` : '';
    if (meta.deprecated) {
        const reason = meta.deprecated;
        return `- ~~[${name}](${path})~~ — *Deprecated: ${reason}*${desc ? ` ${desc}` : ''}`;
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

export function renderIndexPage(
    astModel: Model,
    pluginOptions: Record<string, unknown>,
    hasRelationships: boolean,
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

    const lines: string[] = [...generatedHeader(), `# ${title}`, ''];

    const summaryParts: string[] = [];
    if (models.length > 0) summaryParts.push(`${models.length} ${models.length === 1 ? 'model' : 'models'}`);
    if (views.length > 0) summaryParts.push(`${views.length} ${views.length === 1 ? 'view' : 'views'}`);
    if (types.length > 0) summaryParts.push(`${types.length} ${types.length === 1 ? 'type' : 'types'}`);
    if (enums.length > 0) summaryParts.push(`${enums.length} ${enums.length === 1 ? 'enum' : 'enums'}`);
    if (procedures.length > 0) summaryParts.push(`${procedures.length} ${procedures.length === 1 ? 'procedure' : 'procedures'}`);
    if (summaryParts.length > 0) {
        lines.push(`> ${summaryParts.join(' · ')}`, '');
    }

    if (models.length > 0) {
        lines.push('## Models', '');
        for (const m of models) {
            const desc = firstSentence(stripCommentPrefix(m.comments));
            const meta = extractDocMeta(m.attributes);
            lines.push(formatIndexEntry(m.name, getModelPath(m, groupBy), desc, meta));
        }
        lines.push('');
    }

    if (views.length > 0) {
        lines.push('## Views', '');
        for (const v of views) {
            const desc = firstSentence(stripCommentPrefix(v.comments));
            const meta = extractDocMeta(v.attributes);
            lines.push(formatIndexEntry(v.name, `./views/${v.name}.md`, desc, meta));
        }
        lines.push('');
    }

    if (types.length > 0) {
        lines.push('## Types', '');
        for (const t of types) {
            const desc = firstSentence(stripCommentPrefix(t.comments));
            const suffix = desc ? ` — ${desc}` : '';
            lines.push(`- [${t.name}](./types/${t.name}.md)${suffix}`);
        }
        lines.push('');
    }

    if (enums.length > 0) {
        lines.push('## Enums', '');
        for (const e of enums) {
            const desc = firstSentence(stripCommentPrefix(e.comments));
            const suffix = desc ? ` — ${desc}` : '';
            lines.push(`- [${e.name}](./enums/${e.name}.md)${suffix}`);
        }
        lines.push('');
    }

    if (procedures.length > 0) {
        lines.push('## Procedures', '');
        for (const proc of procedures) {
            const kind = proc.mutation ? 'mutation' : 'query';
            const desc = firstSentence(extractProcedureDescription(proc));
            const descSuffix = desc ? ` — ${desc}` : '';
            lines.push(`- [${proc.name}](./procedures/${proc.name}.md) · *${kind}*${descSuffix}`);
        }
        lines.push('');
    }

    if (hasRelationships) {
        lines.push('## See Also', '');
        lines.push('- [Relationships](./relationships.md)', '');
    }

    return lines.join('\n');
}
