import { isDataModel, isEnum } from '@zenstackhq/language/ast';
import type { CliGeneratorContext } from '@zenstackhq/sdk';
import fs from 'node:fs';
import path from 'node:path';
import { collectRelationships, extractDocMeta, isIgnoredModel, resolveRenderOptions } from './extractors';
import { renderEnumPage } from './renderers/enum-page';
import { renderIndexPage } from './renderers/index-page';
import { renderModelPage } from './renderers/model-page';
import { renderRelationshipsPage } from './renderers/relationships-page';

function resolveOutputDir(context: CliGeneratorContext): string {
    const output = context.pluginOptions['output'];
    if (typeof output === 'string') {
        return path.resolve(output);
    }
    return path.resolve(context.defaultOutputPath);
}

export async function generate(context: CliGeneratorContext): Promise<void> {
    const outputDir = resolveOutputDir(context);
    const options = resolveRenderOptions(context.pluginOptions);
    const includeInternal = context.pluginOptions['includeInternalModels'] === true;
    const groupBy = context.pluginOptions['groupBy'];

    fs.mkdirSync(outputDir, { recursive: true });

    const modelsDir = path.join(outputDir, 'models');
    const models = context.model.declarations
        .filter(isDataModel)
        .filter((m) => includeInternal || !isIgnoredModel(m));

    const allRelations = collectRelationships(models);
    const hasRelationships = options.includeRelationships && allRelations.length > 0;

    fs.writeFileSync(
        path.join(outputDir, 'index.md'),
        renderIndexPage(context.model, context.pluginOptions, hasRelationships),
    );

    if (models.length > 0) {
        fs.mkdirSync(modelsDir, { recursive: true });
        for (const model of models) {
            let modelDir = modelsDir;
            if (groupBy === 'category') {
                const meta = extractDocMeta(model.attributes);
                if (meta.category) {
                    modelDir = path.join(modelsDir, meta.category);
                    fs.mkdirSync(modelDir, { recursive: true });
                }
            }
            fs.writeFileSync(
                path.join(modelDir, `${model.name}.md`),
                renderModelPage(model, options),
            );
        }
    }

    if (hasRelationships) {
        fs.writeFileSync(
            path.join(outputDir, 'relationships.md'),
            renderRelationshipsPage(allRelations),
        );
    }

    const enumsDir = path.join(outputDir, 'enums');
    const enums = context.model.declarations.filter(isEnum);
    if (enums.length > 0) {
        fs.mkdirSync(enumsDir, { recursive: true });
        for (const enumDecl of enums) {
            fs.writeFileSync(
                path.join(enumsDir, `${enumDecl.name}.md`),
                renderEnumPage(enumDecl, models),
            );
        }
    }
}
