import { isDataModel, isEnum, type DataModel, type Model } from '@zenstackhq/language/ast';
import { extractDocMeta, isIgnoredModel } from '../extractors';

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

    const lines: string[] = [`# ${title}`, ''];

    if (models.length > 0) {
        lines.push('## Models', '');
        for (const m of models) {
            lines.push(`- [${m.name}](${getModelPath(m, groupBy)})`);
        }
        lines.push('');
    }

    const enums = astModel.declarations
        .filter(isEnum)
        .map((e) => e.name)
        .sort();

    if (enums.length > 0) {
        lines.push('## Enums', '');
        for (const name of enums) {
            lines.push(`- [${name}](./enums/${name}.md)`);
        }
        lines.push('');
    }

    if (hasRelationships) {
        lines.push('## See Also', '');
        lines.push('- [Relationships](./relationships.md)', '');
    }

    return lines.join('\n');
}
