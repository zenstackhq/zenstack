import { isDataModel, isEnum, isProcedure, isTypeDef, type DataModel, type Model } from '@zenstackhq/language/ast';
import { extractDocMeta, isIgnoredModel } from '../extractors';
import { generatedHeader } from './common';

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

    const models = astModel.declarations
        .filter(isDataModel)
        .filter((m) => includeInternal || !isIgnoredModel(m))
        .sort((a, b) => a.name.localeCompare(b.name));

    const typeNames = astModel.declarations
        .filter(isTypeDef)
        .map((t) => t.name)
        .sort();

    const enumNames = astModel.declarations
        .filter(isEnum)
        .map((e) => e.name)
        .sort();

    const procedures = astModel.declarations
        .filter(isProcedure)
        .sort((a, b) => a.name.localeCompare(b.name));

    const lines: string[] = [...generatedHeader(), `# ${title}`, ''];

    const summaryParts: string[] = [];
    if (models.length > 0) summaryParts.push(`${models.length} ${models.length === 1 ? 'model' : 'models'}`);
    if (typeNames.length > 0) summaryParts.push(`${typeNames.length} ${typeNames.length === 1 ? 'type' : 'types'}`);
    if (enumNames.length > 0) summaryParts.push(`${enumNames.length} ${enumNames.length === 1 ? 'enum' : 'enums'}`);
    if (procedures.length > 0) summaryParts.push(`${procedures.length} ${procedures.length === 1 ? 'procedure' : 'procedures'}`);
    if (summaryParts.length > 0) {
        lines.push(`> ${summaryParts.join(' · ')}`, '');
    }

    if (models.length > 0) {
        lines.push('## Models', '');
        for (const m of models) {
            lines.push(`- [${m.name}](${getModelPath(m, groupBy)})`);
        }
        lines.push('');
    }

    if (typeNames.length > 0) {
        lines.push('## Types', '');
        for (const name of typeNames) {
            lines.push(`- [${name}](./types/${name}.md)`);
        }
        lines.push('');
    }

    if (enumNames.length > 0) {
        lines.push('## Enums', '');
        for (const name of enumNames) {
            lines.push(`- [${name}](./enums/${name}.md)`);
        }
        lines.push('');
    }

    if (procedures.length > 0) {
        lines.push('## Procedures', '');
        for (const proc of procedures) {
            const kind = proc.mutation ? 'mutation' : 'query';
            lines.push(`- [${proc.name}](./procedures/${proc.name}.md) — *${kind}*`);
        }
        lines.push('');
    }

    if (hasRelationships) {
        lines.push('## See Also', '');
        lines.push('- [Relationships](./relationships.md)', '');
    }

    return lines.join('\n');
}
