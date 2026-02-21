import {
    isDataModel,
    isEnum,
    type DataField,
    type DataFieldAttribute,
    type DataModel,
    type Enum,
} from '@zenstackhq/language/ast';
import { getAllFields } from '@zenstackhq/language/utils';
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

    const allFields = getAllFields(model);
    const sortedFields = [...allFields].sort((a, b) => a.name.localeCompare(b.name));

    const relationFields = allFields
        .filter((f) => f.type.reference?.ref && isDataModel(f.type.reference.ref))
        .sort((a, b) => a.name.localeCompare(b.name));

    if (sortedFields.length > 0) {
        lines.push('## Fields', '');
        lines.push('| Field | Type | Required | Default | Attributes | Description |');
        lines.push('| --- | --- | --- | --- | --- | --- |');

        for (const field of sortedFields) {
            const fieldDescription = stripCommentPrefix(field.comments);
            const isComputed = field.attributes.some((a) => getAttrName(a) === '@computed');
            const inheritedFrom =
                isDataModel(field.$container) && field.$container !== model
                    ? field.$container.name
                    : undefined;
            const descParts: string[] = [];
            if (isComputed) descParts.push('**Computed**');
            if (inheritedFrom) {
                descParts.push(`*Inherited from [${inheritedFrom}](./${inheritedFrom}.md)*`);
            }
            if (fieldDescription) descParts.push(fieldDescription);
            lines.push(
                `| ${field.name} | ${getFieldTypeName(field)} | ${isFieldRequired(field) ? 'Yes' : 'No'} | ${getDefaultValue(field)} | ${getFieldAttributes(field)} | ${descParts.join(' ')} |`,
            );
        }
        lines.push('');
    }

    const policyAttrs = model.attributes.filter((a) => {
        const name = a.decl.ref?.name ?? '';
        return name === '@@allow' || name === '@@deny';
    });

    if (relationFields.length > 0) {
        lines.push('## Relationships', '');
        lines.push('| Field | Related Model | Type |');
        lines.push('| --- | --- | --- |');

        for (const field of relationFields) {
            const relatedModel = field.type.reference?.ref?.name ?? '';
            let relType: string;
            if (field.type.array) {
                relType = 'One\u2192Many';
            } else if (field.type.optional) {
                relType = 'Many\u2192One?';
            } else {
                relType = 'Many\u2192One';
            }
            lines.push(
                `| ${field.name} | [${relatedModel}](./${relatedModel}.md) | ${relType} |`,
            );
        }
        lines.push('');
    }

    if (policyAttrs.length > 0) {
        lines.push('## Access Policies', '');
        lines.push('| Operation | Rule | Effect |');
        lines.push('| --- | --- | --- |');

        for (const attr of policyAttrs) {
            const attrName = attr.decl.ref?.name ?? '';
            const effect = attrName === '@@allow' ? 'Allow' : 'Deny';
            const operationArg = attr.args[0]?.$cstNode?.text ?? '';
            const operation = operationArg.replace(/^['"]|['"]$/g, '');
            const condition = attr.args[1]?.$cstNode?.text ?? '';
            lines.push(`| ${operation} | \`${condition}\` | ${effect} |`);
        }
        lines.push('');
    }

    const indexAttrs = model.attributes.filter((a) => {
        const name = a.decl.ref?.name ?? '';
        return name === '@@index' || name === '@@unique' || name === '@@id';
    });

    if (indexAttrs.length > 0) {
        lines.push('## Indexes', '');
        lines.push('| Fields | Type |');
        lines.push('| --- | --- |');

        for (const attr of indexAttrs) {
            const attrName = attr.decl.ref?.name ?? '';
            let indexType: string;
            if (attrName === '@@unique') {
                indexType = 'Unique';
            } else if (attrName === '@@id') {
                indexType = 'Primary';
            } else {
                indexType = 'Index';
            }
            const fieldsArg = attr.args[0]?.$cstNode?.text ?? '';
            lines.push(`| \`${fieldsArg}\` | ${indexType} |`);
        }
        lines.push('');
    }

    const validationRules: Array<{ fieldName: string; rule: string }> = [];
    for (const field of sortedFields) {
        for (const attr of field.attributes) {
            const attrDecl = attr.decl.ref;
            if (!attrDecl) continue;
            const isValidation = attrDecl.attributes.some(
                (ia) => ia.decl.ref?.name === '@@@validation',
            );
            if (isValidation) {
                validationRules.push({
                    fieldName: field.name,
                    rule: `\`${getAttrName(attr)}\``,
                });
            }
        }
    }

    if (validationRules.length > 0) {
        lines.push('## Validation Rules', '');
        lines.push('| Field | Rule |');
        lines.push('| --- | --- |');
        for (const { fieldName, rule } of validationRules) {
            lines.push(`| ${fieldName} | ${rule} |`);
        }
        lines.push('');
    }

    return lines.join('\n');
}

function renderEnumPage(enumDecl: Enum): string {
    const lines: string[] = [`# ${enumDecl.name}`, ''];

    const description = stripCommentPrefix(enumDecl.comments);
    if (description) {
        for (const line of description.split('\n')) {
            lines.push(`> ${line}`);
        }
        lines.push('');
    }

    if (enumDecl.fields.length > 0) {
        lines.push('## Values', '');
        lines.push('| Value | Description |');
        lines.push('| --- | --- |');

        for (const field of enumDecl.fields) {
            const fieldDesc = stripCommentPrefix(field.comments);
            lines.push(`| ${field.name} | ${fieldDesc} |`);
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

        const enumsDir = path.join(outputDir, 'enums');
        const enums = context.model.declarations.filter(isEnum);
        if (enums.length > 0) {
            fs.mkdirSync(enumsDir, { recursive: true });
            for (const enumDecl of enums) {
                fs.writeFileSync(
                    path.join(enumsDir, `${enumDecl.name}.md`),
                    renderEnumPage(enumDecl),
                );
            }
        }
    },
};

export default plugin;
