import { isDataModel, isEnum, isProcedure, isTypeDef } from '@zenstackhq/language/ast';
import type { CliGeneratorContext } from '@zenstackhq/sdk';
import fs from 'node:fs';
import path from 'node:path';
import { collectRelationships, isIgnoredModel, resolveRenderOptions } from './extractors';
import { renderEnumPage } from './renderers/enum-page';
import { renderIndexPage } from './renderers/index-page';
import { renderModelPage } from './renderers/model-page';
import { renderRelationshipsPage } from './renderers/relationships-page';
import { renderProcedurePage } from './renderers/procedure-page';
import { renderTypePage } from './renderers/type-page';
import { renderSkillPage } from './renderers/skill-page';
import { renderViewPage } from './renderers/view-page';
import { buildNavList } from './renderers/common';
import { processDiagrams } from './renderers/diagram-processor';
import { buildFullErDiagram, renderErdSvg } from './renderers/erd';
import type { GenerationContext, PluginOptions } from './types';

/** Extracts typed plugin options from the raw ZModel plugin block key-value pairs. */
function resolvePluginOptions(raw: Record<string, unknown>): PluginOptions {
    return {
        output: typeof raw['output'] === 'string' ? raw['output'] : undefined,
        title: typeof raw['title'] === 'string' ? raw['title'] : undefined,
        fieldOrder: raw['fieldOrder'] === 'alphabetical' ? 'alphabetical' : 'declaration',
        includeInternalModels: raw['includeInternalModels'] === true,
        includeRelationships: raw['includeRelationships'] !== false,
        includePolicies: raw['includePolicies'] !== false,
        includeValidation: raw['includeValidation'] !== false,
        includeIndexes: raw['includeIndexes'] !== false,
        generateSkill: raw['generateSkill'] === true,
        generateErd: raw['generateErd'] === true,
        erdFormat: (['svg', 'mmd', 'both'] as const).includes(raw['erdFormat'] as 'svg' | 'mmd' | 'both')
            ? (raw['erdFormat'] as 'svg' | 'mmd' | 'both')
            : 'both',
        erdTheme: typeof raw['erdTheme'] === 'string' ? raw['erdTheme'] : undefined,
        diagramFormat: (['mermaid', 'svg', 'both'] as const).includes(raw['diagramFormat'] as 'mermaid' | 'svg' | 'both')
            ? (raw['diagramFormat'] as 'mermaid' | 'svg' | 'both')
            : 'mermaid',
    };
}

/** Resolves the absolute output directory path from plugin options or the CLI default. */
function resolveOutputDir(opts: PluginOptions, defaultPath: string): string {
    return path.resolve(opts.output ?? defaultPath);
}

/**
 * Main entry point for the documentation generator plugin.
 * Reads the ZModel AST from `context`, renders markdown pages for every entity,
 * and writes them into the configured output directory.
 */
export async function generate(context: CliGeneratorContext): Promise<void> {
    const startTime = performance.now();
    const pluginOpts = resolvePluginOptions(context.pluginOptions);
    const outputDir = resolveOutputDir(pluginOpts, context.defaultOutputPath);
    const options = resolveRenderOptions(pluginOpts);
    options.schemaDir = path.dirname(path.resolve(context.schemaFile));

    const genCtx: GenerationContext = {
        schemaFile: path.basename(context.schemaFile),
        generatedAt: new Date().toISOString().split('T')[0]!,
    };
    options.genCtx = genCtx;

    try {
        fs.mkdirSync(outputDir, { recursive: true });
    } catch (err) {
        throw new Error(`Failed to create output directory "${outputDir}": ${err instanceof Error ? err.message : String(err)}`);
    }

    let filesGenerated = 0;
    const diagFmt = pluginOpts.diagramFormat ?? 'mermaid';
    const diagTheme = pluginOpts.erdTheme;

    const modelsDir = path.join(outputDir, 'models');
    const allDataModels = context.model.declarations
        .filter(isDataModel)
        .filter((m) => pluginOpts.includeInternalModels || !isIgnoredModel(m));

    const models = allDataModels.filter((m) => !m.isView);
    const views = allDataModels.filter((m) => m.isView);

    const procedures = context.model.declarations.filter(isProcedure);

    const allRelations = collectRelationships(models);
    const hasRelationships = options.includeRelationships && allRelations.length > 0;

    if (models.length > 0) {
        fs.mkdirSync(modelsDir, { recursive: true });
        const sortedModels = [...models].sort((a, b) => a.name.localeCompare(b.name));
        const modelNav = buildNavList(sortedModels.map((m) => m.name), './');

        for (const model of sortedModels) {
            const mdPath = path.join(modelsDir, `${model.name}.md`);
            const content = renderModelPage({ model, options, procedures, navigation: modelNav.get(model.name) });
            await writePageWithDiagrams(mdPath, content, diagFmt, diagTheme);
            filesGenerated++;
        }
    }

    const viewsDir = path.join(outputDir, 'views');
    if (views.length > 0) {
        fs.mkdirSync(viewsDir, { recursive: true });
        const sortedViews = [...views].sort((a, b) => a.name.localeCompare(b.name));
        const viewNav = buildNavList(sortedViews.map((v) => v.name), './');
        for (const view of sortedViews) {
            const mdPath = path.join(viewsDir, `${view.name}.md`);
            const content = renderViewPage({ view, options, navigation: viewNav.get(view.name) });
            await writePageWithDiagrams(mdPath, content, diagFmt, diagTheme);
            filesGenerated++;
        }
    }

    if (hasRelationships) {
        const mdPath = path.join(outputDir, 'relationships.md');
        const content = renderRelationshipsPage({ relations: allRelations, genCtx });
        await writePageWithDiagrams(mdPath, content, diagFmt, diagTheme);
        filesGenerated++;
    }

    const typesDir = path.join(outputDir, 'types');
    const typeDefs = context.model.declarations.filter(isTypeDef);
    if (typeDefs.length > 0) {
        fs.mkdirSync(typesDir, { recursive: true });
        const sortedTypes = [...typeDefs].sort((a, b) => a.name.localeCompare(b.name));
        const typeNav = buildNavList(sortedTypes.map((t) => t.name), './');
        for (const typeDef of sortedTypes) {
            const mdPath = path.join(typesDir, `${typeDef.name}.md`);
            const content = renderTypePage({ typeDef, allModels: [...models, ...views], options, navigation: typeNav.get(typeDef.name) });
            await writePageWithDiagrams(mdPath, content, diagFmt, diagTheme);
            filesGenerated++;
        }
    }

    const enumsDir = path.join(outputDir, 'enums');
    const enums = context.model.declarations.filter(isEnum);
    if (enums.length > 0) {
        fs.mkdirSync(enumsDir, { recursive: true });
        const sortedEnums = [...enums].sort((a, b) => a.name.localeCompare(b.name));
        const enumNav = buildNavList(sortedEnums.map((e) => e.name), './');
        for (const enumDecl of sortedEnums) {
            const mdPath = path.join(enumsDir, `${enumDecl.name}.md`);
            const content = renderEnumPage({ enumDecl, allModels: [...models, ...views], options, navigation: enumNav.get(enumDecl.name) });
            await writePageWithDiagrams(mdPath, content, diagFmt, diagTheme);
            filesGenerated++;
        }
    }

    const proceduresDir = path.join(outputDir, 'procedures');
    if (procedures.length > 0) {
        fs.mkdirSync(proceduresDir, { recursive: true });
        const sortedProcs = [...procedures].sort((a, b) => a.name.localeCompare(b.name));
        const procNav = buildNavList(sortedProcs.map((p) => p.name), './');
        for (const proc of sortedProcs) {
            const mdPath = path.join(proceduresDir, `${proc.name}.md`);
            const content = renderProcedurePage({ proc, options, navigation: procNav.get(proc.name) });
            await writePageWithDiagrams(mdPath, content, diagFmt, diagTheme);
            filesGenerated++;
        }
    }

    if (pluginOpts.generateSkill) {
        writeFile(
            path.join(outputDir, 'SKILL.md'),
            renderSkillPage({
                schema: context.model,
                title: pluginOpts.title ?? 'Schema Documentation',
                models, views, enums, typeDefs, procedures, hasRelationships,
            }),
        );
        filesGenerated++;
    }

    let hasErdSvg = false;
    let hasErdMmd = false;
    if (pluginOpts.generateErd) {
        const mermaidSource = buildFullErDiagram({ models, relations: allRelations });
        const format = pluginOpts.erdFormat ?? 'both';

        if (format === 'mmd' || format === 'both') {
            writeFile(path.join(outputDir, 'schema-erd.mmd'), mermaidSource);
            filesGenerated++;
            hasErdMmd = true;
        }

        if (format === 'svg' || format === 'both') {
            const svg = await renderErdSvg(mermaidSource, pluginOpts.erdTheme);
            if (svg) {
                writeFile(path.join(outputDir, 'schema-erd.svg'), svg);
                filesGenerated++;
                hasErdSvg = true;
            } else if (format === 'svg') {
                writeFile(path.join(outputDir, 'schema-erd.mmd'), mermaidSource);
                filesGenerated++;
                hasErdMmd = true;
            }
        }
    }

    filesGenerated++;
    genCtx.durationMs = Math.round((performance.now() - startTime) * 100) / 100;
    genCtx.filesGenerated = filesGenerated;

    writeFile(
        path.join(outputDir, 'index.md'),
        renderIndexPage({ astModel: context.model, pluginOptions: pluginOpts, hasRelationships, hasErdSvg, hasErdMmd, genCtx }),
    );
}

/** Writes content to a file, wrapping fs errors with the target path for diagnostics. */
function writeFile(filePath: string, content: string): void {
    try {
        fs.writeFileSync(filePath, content);
    } catch (err) {
        throw new Error(`Failed to write "${filePath}": ${err instanceof Error ? err.message : String(err)}`);
    }
}

/**
 * Writes a markdown page, optionally converting inline Mermaid blocks to companion SVG files.
 */
async function writePageWithDiagrams(
    filePath: string,
    content: string,
    diagramFormat: 'mermaid' | 'svg' | 'both',
    theme?: string,
): Promise<number> {
    const baseName = path.basename(filePath, '.md');
    const dir = path.dirname(filePath);
    const result = await processDiagrams(content, baseName, diagramFormat, theme);
    writeFile(filePath, result.markdown);
    for (const svg of result.svgFiles) {
        writeFile(path.join(dir, svg.filename), svg.content);
    }
    return result.svgFiles.length;
}
