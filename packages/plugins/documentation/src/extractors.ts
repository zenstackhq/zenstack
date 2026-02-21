import {
    isDataModel,
    isEnum,
    type DataField,
    type DataFieldAttribute,
    type DataModel,
    type DataModelAttribute,
} from '@zenstackhq/language/ast';
import type { DocMeta, Relationship } from './types';

export function stripCommentPrefix(comments: string[]): string {
    return comments
        .map((c) => c.replace(/^\/\/\/\s?/, ''))
        .join('\n')
        .trim();
}

export function isIgnoredModel(model: DataModel): boolean {
    return model.attributes.some((a) => a.decl.ref?.name === '@@ignore');
}

export function getAttrName(attr: DataFieldAttribute): string {
    return attr.decl.ref?.name ?? '';
}

export function formatAttrArgs(attr: DataFieldAttribute): string {
    if (attr.args.length === 0) return '';
    const parts = attr.args.map((arg) => {
        const text = arg.$cstNode?.text ?? '';
        if (arg.name) return `${arg.name}: ${text}`;
        return text;
    });
    return `(${parts.join(', ')})`;
}

export function getFieldTypeName(field: DataField, linked: boolean): string {
    let typeName: string;
    if (field.type.reference?.ref) {
        const ref = field.type.reference.ref;
        if (linked) {
            if (isDataModel(ref)) {
                typeName = `[${ref.name}](./${ref.name}.md)`;
            } else if (isEnum(ref)) {
                typeName = `[${ref.name}](../enums/${ref.name}.md)`;
            } else {
                typeName = ref.name;
            }
        } else {
            typeName = ref.name;
        }
    } else if (field.type.type) {
        typeName = field.type.type;
    } else {
        typeName = 'Unknown';
    }

    if (field.type.array) typeName += '[]';
    if (field.type.optional) typeName += '?';
    return typeName;
}

export function getDefaultValue(field: DataField): string {
    const defaultAttr = field.attributes.find((a) => getAttrName(a) === '@default');
    const firstArg = defaultAttr?.args[0];
    if (!firstArg) return '\u2014';
    return `\`${firstArg.$cstNode?.text ?? ''}\``;
}

export function getFieldAttributes(field: DataField): string {
    const attrs = field.attributes
        .filter((a) => {
            const name = getAttrName(a);
            return name !== '@default' && name !== '@computed' && name !== '@meta';
        })
        .map((a) => `\`${getAttrName(a)}${formatAttrArgs(a)}\``);
    return attrs.length > 0 ? attrs.join(', ') : '\u2014';
}

export function isFieldRequired(field: DataField): boolean {
    return !field.type.optional && !field.type.array;
}

export function extractDocMeta(attributes: DataModelAttribute[]): DocMeta {
    const meta: DocMeta = {};
    for (const attr of attributes) {
        if (attr.decl.ref?.name !== '@@meta') continue;
        const nameArg = attr.args[0]?.$cstNode?.text ?? '';
        const key = nameArg.replace(/^['"]|['"]$/g, '');
        const valueArg = attr.args[1]?.$cstNode?.text ?? '';
        const value = valueArg.replace(/^['"]|['"]$/g, '');

        if (key === 'doc:category') meta.category = value;
        else if (key === 'doc:since') meta.since = value;
        else if (key === 'doc:deprecated') meta.deprecated = value;
    }
    return meta;
}

export function extractFieldDocExample(field: DataField): string | undefined {
    for (const attr of field.attributes) {
        if (getAttrName(attr) !== '@meta') continue;
        const keyArg = attr.args[0]?.$cstNode?.text ?? '';
        const key = keyArg.replace(/^['"]|['"]$/g, '');
        if (key === 'doc:example') {
            const valArg = attr.args[1]?.$cstNode?.text ?? '';
            return valArg.replace(/^['"]|['"]$/g, '');
        }
    }
    return undefined;
}

export function collectRelationships(models: DataModel[]): Relationship[] {
    const rels: Relationship[] = [];
    for (const model of models) {
        for (const field of model.fields) {
            if (field.type.reference?.ref && isDataModel(field.type.reference.ref)) {
                const to = field.type.reference.ref.name;
                let relType: string;
                if (field.type.array) {
                    relType = 'One\u2192Many';
                } else if (field.type.optional) {
                    relType = 'Many\u2192One?';
                } else {
                    relType = 'Many\u2192One';
                }
                rels.push({ from: model.name, field: field.name, to, type: relType });
            }
        }
    }
    return rels;
}

export function resolveRenderOptions(pluginOptions: Record<string, unknown>): import('./types').RenderOptions {
    return {
        includeRelationships: pluginOptions['includeRelationships'] !== false,
        includePolicies: pluginOptions['includePolicies'] !== false,
        includeValidation: pluginOptions['includeValidation'] !== false,
        includeIndexes: pluginOptions['includeIndexes'] !== false,
        fieldOrder: pluginOptions['fieldOrder'] === 'alphabetical' ? 'alphabetical' : 'declaration',
    };
}
