import {
    isDataModel,
    isEnum,
    type DataField,
    type DataFieldAttribute,
    type DataModel,
} from '@zenstackhq/language/ast';
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

function getFieldTypeName(field: DataField): string {
    let typeName: string;
    if (field.type.reference?.ref) {
        typeName = field.type.reference.ref.name;
    } else if (field.type.type) {
        typeName = field.type.type;
    } else {
        typeName = 'Unknown';
    }

    if (field.type.array) typeName += '[]';
    if (field.type.optional) typeName += '?';
    return typeName;
}

function getAttrName(attr: DataFieldAttribute): string {
    return attr.decl.ref?.name ?? '';
}

function formatAttrArgs(attr: DataFieldAttribute): string {
    if (attr.args.length === 0) return '';
    const parts = attr.args.map((arg) => {
        const text = arg.$cstNode?.text ?? '';
        if (arg.name) return `${arg.name}: ${text}`;
        return text;
    });
    return `(${parts.join(', ')})`;
}

function getDefaultValue(field: DataField): string {
    const defaultAttr = field.attributes.find((a) => getAttrName(a) === '@default');
    if (!defaultAttr || defaultAttr.args.length === 0) return '\u2014';
    return `\`${defaultAttr.args[0].$cstNode?.text ?? ''}\``;
}

function getFieldAttributes(field: DataField): string {
    const attrs = field.attributes
        .filter((a) => getAttrName(a) !== '@default')
        .map((a) => `\`${getAttrName(a)}${formatAttrArgs(a)}\``);
    return attrs.length > 0 ? attrs.join(', ') : '\u2014';
}

function isFieldRequired(field: DataField): boolean {
    return !field.type.optional && !field.type.array;
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

    const sortedFields = [...model.fields].sort((a, b) => a.name.localeCompare(b.name));

    if (sortedFields.length > 0) {
        lines.push('## Fields', '');
        lines.push('| Field | Type | Required | Default | Attributes | Description |');
        lines.push('| --- | --- | --- | --- | --- | --- |');

        for (const field of sortedFields) {
            const fieldDescription = stripCommentPrefix(field.comments);
            lines.push(
                `| ${field.name} | ${getFieldTypeName(field)} | ${isFieldRequired(field) ? 'Yes' : 'No'} | ${getDefaultValue(field)} | ${getFieldAttributes(field)} | ${fieldDescription} |`,
            );
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
