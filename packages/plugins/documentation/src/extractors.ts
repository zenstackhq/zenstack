import {
    isDataModel,
    isEnum,
    isTypeDef,
    type DataField,
    type DataFieldAttribute,
    type DataModel,
    type DataModelAttribute,
} from '@zenstackhq/language/ast';
import { getAllFields } from '@zenstackhq/language/utils';
import path from 'node:path';
import type { DocMeta, PluginOptions, Relationship, RelationType, RenderOptions } from './types';

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

/** Removes surrounding single or double quotes from a CST argument string. */
export function stripQuotes(s: string): string {
    return s.replace(/^['"]|['"]$/g, '');
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

/** Structural shape for both DataFieldType and FunctionParamType. */
export interface TypeLike {
    reference?: { readonly ref?: { readonly name: string } };
    type?: string;
    array?: boolean;
    optional?: boolean;
}

/** Returns the bare type name string (e.g. `"String"`, `"User"`) without markdown formatting. */
export function resolveTypeName(t: TypeLike): string {
    return t.reference?.ref?.name ?? t.type ?? 'Unknown';
}

/**
 * Returns a markdown-formatted type link for use in documentation tables.
 * When `linked` is true, reference types are rendered as markdown links to their pages.
 * Scalar types are wrapped in backticks; array/optional suffixes are appended.
 */
export function resolveTypeLink(t: TypeLike, linked: boolean): string {
    let typeName: string;
    if (t.reference?.ref) {
        const ref: unknown = t.reference.ref;
        if (linked) {
            if (isDataModel(ref)) {
                typeName = `[${ref.name}](../models/${ref.name}.md)`;
            } else if (isEnum(ref)) {
                typeName = `[${ref.name}](../enums/${ref.name}.md)`;
            } else if (isTypeDef(ref)) {
                typeName = `[${ref.name}](../types/${ref.name}.md)`;
            } else {
                typeName = t.reference.ref.name;
            }
        } else {
            typeName = t.reference.ref.name;
        }
    } else if (t.type) {
        typeName = t.type;
    } else {
        typeName = 'Unknown';
    }

    if (t.array) typeName += '[]';
    if (t.optional) typeName += '?';

    const isScalar = !t.reference?.ref;
    return isScalar ? `\`${typeName}\`` : typeName;
}

/**
 * Returns the display string for a field's type, optionally linking to the related model/enum page.
 * Model field links use relative `./` paths (caller is in models/ dir).
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
        const key = stripQuotes(attr.args[0]?.$cstNode?.text ?? '');
        const value = stripQuotes(attr.args[1]?.$cstNode?.text ?? '');

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
        const key = stripQuotes(attr.args[0]?.$cstNode?.text ?? '');
        if (key === 'doc:example') {
            return stripQuotes(attr.args[1]?.$cstNode?.text ?? '');
        }
    }
    return undefined;
}

/** Extracts the set of foreign key field names from `@relation(fields: [...])` attributes. */
export function collectFKFieldNames(fields: DataField[]): Set<string> {
    const fkNames = new Set<string>();
    for (const field of fields) {
        const relationAttr = field.attributes.find((a) => getAttrName(a) === '@relation');
        if (!relationAttr) continue;
        const cstText = relationAttr.$cstNode?.text ?? '';
        const fieldsMatch = cstText.match(/fields:\s*\[([^\]]+)\]/);
        if (fieldsMatch) {
            for (const name of fieldsMatch[1]!.split(',').map((s) => s.trim())) {
                fkNames.add(name);
            }
        }
    }
    return fkNames;
}

/** Collects all relation fields across the given models into a flat list of `Relationship` entries. */
export function collectRelationships(models: DataModel[]): Relationship[] {
    const rels: Relationship[] = [];
    for (const model of models) {
        for (const field of getAllFields(model)) {
            if (field.type.reference?.ref && isDataModel(field.type.reference.ref)) {
                const to = field.type.reference.ref.name;
                let relType: RelationType;
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

/** Converts plugin options into a typed `RenderOptions` with defaults. */
export function resolveRenderOptions(opts: PluginOptions): RenderOptions {
    return {
        includeRelationships: opts.includeRelationships !== false,
        includePolicies: opts.includePolicies !== false,
        includeValidation: opts.includeValidation !== false,
        includeIndexes: opts.includeIndexes !== false,
        fieldOrder: opts.fieldOrder === 'alphabetical' ? 'alphabetical' : 'declaration',
    };
}
