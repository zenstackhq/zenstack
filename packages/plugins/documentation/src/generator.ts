import { isDataModel, isEnum, isProcedure, isTypeDef } from '@zenstackhq/language/ast';
import type { CliGeneratorContext } from '@zenstackhq/sdk';
import fs from 'node:fs';
import path from 'node:path';
import { collectRelationships, extractDocMeta, isIgnoredModel, resolveRenderOptions } from './extractors';
import { renderEnumPage } from './renderers/enum-page';
import { renderIndexPage } from './renderers/index-page';
import { renderModelPage } from './renderers/model-page';
import { renderRelationshipsPage } from './renderers/relationships-page';
import { renderProcedurePage } from './renderers/procedure-page';
import { renderTypePage } from './renderers/type-page';
import { buildNavList } from './renderers/common';

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
    options.schemaDir = path.dirname(path.resolve(context.schemaFile));
    const includeInternal = context.pluginOptions['includeInternalModels'] === true;
    const groupBy = context.pluginOptions['groupBy'];

    fs.mkdirSync(outputDir, { recursive: true });

    const modelsDir = path.join(outputDir, 'models');
    const allDataModels = context.model.declarations
        .filter(isDataModel)
        .filter((m) => includeInternal || !isIgnoredModel(m));

    const models = allDataModels.filter((m) => !m.isView);
    const views = allDataModels.filter((m) => m.isView);

    const procedures = context.model.declarations.filter(isProcedure);

    const allRelations = collectRelationships(models);
    const hasRelationships = options.includeRelationships && allRelations.length > 0;

    fs.writeFileSync(
        path.join(outputDir, 'index.md'),
        renderIndexPage(context.model, context.pluginOptions, hasRelationships),
    );

    if (models.length > 0) {
        fs.mkdirSync(modelsDir, { recursive: true });
        const sortedModelNames = [...models].sort((a, b) => a.name.localeCompare(b.name)).map((m) => m.name);
        const modelNav = buildNavList(sortedModelNames, './');
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
                renderModelPage(model, options, procedures, modelNav.get(model.name)),
            );
        }
    }

    const viewsDir = path.join(outputDir, 'views');
    if (views.length > 0) {
        fs.mkdirSync(viewsDir, { recursive: true });
        const sortedViewNames = [...views].sort((a, b) => a.name.localeCompare(b.name)).map((v) => v.name);
        const viewNav = buildNavList(sortedViewNames, './');
        for (const view of views) {
            fs.writeFileSync(
                path.join(viewsDir, `${view.name}.md`),
                renderModelPage(view, options, procedures, viewNav.get(view.name)),
            );
        }
    }

    if (hasRelationships) {
        fs.writeFileSync(
            path.join(outputDir, 'relationships.md'),
            renderRelationshipsPage(allRelations),
        );
    }

    const typesDir = path.join(outputDir, 'types');
    const typeDefs = context.model.declarations.filter(isTypeDef);
    if (typeDefs.length > 0) {
        fs.mkdirSync(typesDir, { recursive: true });
        const sortedTypeNames = [...typeDefs].sort((a, b) => a.name.localeCompare(b.name)).map((t) => t.name);
        const typeNav = buildNavList(sortedTypeNames, './');
        for (const typeDef of typeDefs) {
            fs.writeFileSync(
                path.join(typesDir, `${typeDef.name}.md`),
                renderTypePage(typeDef, models, options, typeNav.get(typeDef.name)),
            );
        }
    }

    const enumsDir = path.join(outputDir, 'enums');
    const enums = context.model.declarations.filter(isEnum);
    if (enums.length > 0) {
        fs.mkdirSync(enumsDir, { recursive: true });
        const sortedEnumNames = [...enums].sort((a, b) => a.name.localeCompare(b.name)).map((e) => e.name);
        const enumNav = buildNavList(sortedEnumNames, './');
        for (const enumDecl of enums) {
            fs.writeFileSync(
                path.join(enumsDir, `${enumDecl.name}.md`),
                renderEnumPage(enumDecl, models, options, enumNav.get(enumDecl.name)),
            );
        }
    }

    const proceduresDir = path.join(outputDir, 'procedures');
    if (procedures.length > 0) {
        fs.mkdirSync(proceduresDir, { recursive: true });
        const sortedProcNames = [...procedures].sort((a, b) => a.name.localeCompare(b.name)).map((p) => p.name);
        const procNav = buildNavList(sortedProcNames, './');
        for (const proc of procedures) {
            fs.writeFileSync(
                path.join(proceduresDir, `${proc.name}.md`),
                renderProcedurePage(proc, options, procNav.get(proc.name)),
            );
        }
    }
}
