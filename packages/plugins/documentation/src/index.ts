import { isDataModel, isEnum, type DataModel } from '@zenstackhq/language/ast';
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

    const enums = context.model.declarations
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

    return lines.join('\n');
}

function stripCommentPrefix(comments: string[]): string {
    return comments
        .map((c) => c.replace(/^\/\/\/\s?/, ''))
        .join('\n')
        .trim();
}

function renderModelPage(model: DataModel): string {
    const lines: string[] = [`# ${model.name}`, ''];

    const description = stripCommentPrefix(model.comments);
    if (description) {
        for (const line of description.split('\n')) {
            lines.push(`> ${line}`);
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

        const modelsDir = path.join(outputDir, 'models');
        const models = context.model.declarations.filter(isDataModel);
        if (models.length > 0) {
            fs.mkdirSync(modelsDir, { recursive: true });
            for (const model of models) {
                fs.writeFileSync(
                    path.join(modelsDir, `${model.name}.md`),
                    renderModelPage(model),
                );
            }
        }
    },
};

export default plugin;
