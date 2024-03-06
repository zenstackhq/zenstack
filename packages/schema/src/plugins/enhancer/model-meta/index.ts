import { generateModelMeta, getDataModels, type PluginOptions } from '@zenstackhq/sdk';
import type { Model } from '@zenstackhq/sdk/ast';
import path from 'path';
import type { Project } from 'ts-morph';

export async function generate(model: Model, options: PluginOptions, project: Project, outDir: string) {
    const outFile = path.join(outDir, 'model-meta.ts');
    const dataModels = getDataModels(model);

    // save ts files if requested explicitly or the user provided
    const preserveTsFiles = options.preserveTsFiles === true || !!options.output;
    await generateModelMeta(project, dataModels, {
        output: outFile,
        generateAttributes: true,
        preserveTsFiles,
    });
}
