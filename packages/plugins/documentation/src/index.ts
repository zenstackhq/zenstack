import { isDataModel } from '@zenstackhq/language/ast';
import type { CliGeneratorContext, CliPlugin } from '@zenstackhq/sdk';
import fs from 'node:fs';
import path from 'node:path';

function resolveOutputDir(context: CliGeneratorContext): string {
    const output = context.pluginOptions['output'];
    if (typeof output === 'string') {
        return path.resolve(output);
    }
    return path.resolve(context.defaultOutputPath);
}

function renderIndexPage(context: CliGeneratorContext): string {
    const title =
        typeof context.pluginOptions['title'] === 'string'
            ? context.pluginOptions['title']
            : 'Schema Documentation';

    const models = context.model.declarations
        .filter(isDataModel)
        .map((m) => m.name)
        .sort();

    const lines: string[] = [`# ${title}`, ''];

    if (models.length > 0) {
        lines.push('## Models', '');
        for (const name of models) {
            lines.push(`- [${name}](./models/${name}.md)`);
        }
        lines.push('');
    }

    return lines.join('\n');
}

const plugin: CliPlugin = {
    name: 'Documentation Generator',
    statusText: 'Generating documentation',
    async generate(context: CliGeneratorContext) {
        const outputDir = resolveOutputDir(context);
        fs.mkdirSync(outputDir, { recursive: true });
        fs.writeFileSync(path.join(outputDir, 'index.md'), renderIndexPage(context));
    },
};

export default plugin;
