import { type PluginOptions } from '@zenstackhq/sdk';
import type { Model } from '@zenstackhq/sdk/ast';
import type { Project } from 'ts-morph';
import { PolicyGenerator } from './policy-guard-generator';

export async function generate(model: Model, options: PluginOptions, project: Project, outDir: string) {
    return new PolicyGenerator(options).generate(project, model, outDir);
}
