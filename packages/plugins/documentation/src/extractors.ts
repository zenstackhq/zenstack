import {
    isDataModel,
    isEnum,
    type DataField,
    type DataFieldAttribute,
    type DataModel,
    type DataModelAttribute,
} from '@zenstackhq/language/ast';
import path from 'node:path';
import type { DocMeta, Relationship, RenderOptions } from './types';

interface AstLike {
    $cstNode?: { root?: { element?: { $document?: { uri?: { fsPath?: string } } } } };
    $container?: AstLike;
    $document?: { uri?: { fsPath?: string } };
}

/** Resolves the absolute file system path of the source file that defines `node`. */
export function getSourceFilePath(node: AstLike): string | undefined {
    const cstDoc = node.$cstNode?.root?.element?.$document?.uri?.fsPath;
    if (cstDoc) return cstDoc;
    let root: AstLike = node;
    while (root.$container) root = root.$container;
    return root.$document?.uri?.fsPath;
}

/** Returns the source file path relative to `schemaDir`, or just the basename if `schemaDir` is not set. */
export function getRelativeSourcePath(node: AstLike, schemaDir: string | undefined): string | undefined {
    const absPath = getSourceFilePath(node);
    if (!absPath) return undefined;
    return schemaDir ? path.relative(schemaDir, absPath) : path.basename(absPath);
}

/** Strips leading `///` prefixes from ZModel doc-comment lines and joins them. */
export function stripCommentPrefix(comments: string[]): string {
    return comments
        .map((c) => c.replace(/^\/\/\/\s?/, ''))
        .join('\n')
        .trim();
}

/** Returns `true` if the model has the `@@ignore` attribute. */
export function isIgnoredModel(model: DataModel): boolean {
    return model.attributes.some((a) => a.decl.ref?.name === '@@ignore');
}

/** Returns the resolved name of a field-level attribute (e.g. `@id`, `@default`). */
export function getAttrName(attr: DataFieldAttribute): string {
    return attr.decl.ref?.name ?? '';
}

/** Formats the argument list of a field attribute as a parenthesized string, e.g. `(cuid())`. */
export function formatAttrArgs(attr: DataFieldAttribute): string {
    if (attr.args.length === 0) return '';
    const parts = attr.args.map((arg) => arg.$cstNode?.text ?? '');
    return `(${parts.join(', ')})`;
}

/**
 * Returns the display string for a field's type, optionally linking to the related model/enum page.
 * Scalar types are wrapped in backticks; reference types are rendered as markdown links when `linked` is true.
 */
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

    const isScalar = !field.type.reference?.ref;
    return isScalar ? `\`${typeName}\`` : typeName;
}

/** Returns the formatted default value for a field, or an em-dash if none. */
export function getDefaultValue(field: DataField): string {
    const defaultAttr = field.attributes.find((a) => getAttrName(a) === '@default');
    const firstArg = defaultAttr?.args[0];
    if (!firstArg) return '\u2014';
    return `\`${firstArg.$cstNode?.text ?? ''}\``;
}

/** Returns a comma-separated string of field attributes, excluding `@default`, `@computed`, and `@meta`. */
export function getFieldAttributes(field: DataField): string {
    const attrs = field.attributes
        .filter((a) => {
            const name = getAttrName(a);
            return name !== '@default' && name !== '@computed' && name !== '@meta';
        })
        .map((a) => `\`${getAttrName(a)}${formatAttrArgs(a)}\``);
    return attrs.length > 0 ? attrs.join(', ') : '\u2014';
}

/** Returns `true` if the field is non-optional and non-array (i.e. required for creation). */
export function isFieldRequired(field: DataField): boolean {
    return !field.type.optional && !field.type.array;
}

/** Extracts `@@meta('doc:category', ...)`, `doc:since`, and `doc:deprecated` values from model attributes. */
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

/** Extracts the `@meta('doc:example', '...')` value from a field, if present. */
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

/** Collects all relation fields across the given models into a flat list of `Relationship` entries. */
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

/**
 * Extracts `///` doc-comments preceding a procedure declaration from its CST text.
 * Returns the comments joined by `joinWith` (newline by default, space for inline use).
 */
export function extractProcedureComments(
    proc: { $cstNode?: { text?: string } },
    joinWith: '\n' | ' ' = '\n',
): string {
    const cstText = proc.$cstNode?.text;
    if (!cstText) return '';
    const commentLines: string[] = [];
    for (const line of cstText.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.startsWith('///')) {
            commentLines.push(trimmed.replace(/^\/\/\/\s?/, ''));
        } else {
            break;
        }
    }
    return commentLines.join(joinWith).trim();
}

/** Converts raw plugin options into a typed `RenderOptions` with defaults. */
export function resolveRenderOptions(pluginOptions: Record<string, unknown>): RenderOptions {
    return {
        includeRelationships: pluginOptions['includeRelationships'] !== false,
        includePolicies: pluginOptions['includePolicies'] !== false,
        includeValidation: pluginOptions['includeValidation'] !== false,
        includeIndexes: pluginOptions['includeIndexes'] !== false,
        fieldOrder: pluginOptions['fieldOrder'] === 'alphabetical' ? 'alphabetical' : 'declaration',
    };
}
