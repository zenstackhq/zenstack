import fs from 'node:fs';
import path from 'node:path';
import type { CliGeneratorContext, CliPlugin } from '@zenstackhq/sdk';

function resolveOutputDir(context: CliGeneratorContext): string {
    const output = context.pluginOptions['output'];
    if (typeof output === 'string') {
        return path.resolve(output);
    }
    return path.resolve(context.defaultOutputPath);
}

const plugin: CliPlugin = {
    name: 'Documentation Generator',
    statusText: 'Generating documentation',
    async generate(context: CliGeneratorContext) {
        const outputDir = resolveOutputDir(context);
        fs.mkdirSync(outputDir, { recursive: true });
        fs.writeFileSync(path.join(outputDir, 'index.md'), '');
    },
};

export default plugin;
