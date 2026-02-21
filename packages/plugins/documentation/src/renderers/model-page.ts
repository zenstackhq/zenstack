import { isDataModel, isTypeDef, type DataModel, type Procedure } from '@zenstackhq/language/ast';
import { getAllFields } from '@zenstackhq/language/utils';
import { breadcrumbs, generatedHeader } from './common';
import {
    extractDocMeta,
    extractFieldDocExample,
    getAttrName,
    getDefaultValue,
    getFieldAttributes,
    getFieldTypeName,
    getRelativeSourcePath,
    isFieldRequired,
    stripCommentPrefix,
} from '../extractors';
import type { RenderOptions } from '../types';

function isModelReferencedByProc(proc: Procedure, modelName: string): boolean {
    if (proc.returnType.reference?.ref?.name === modelName) return true;
    if (proc.returnType.type === modelName) return true;
    for (const param of proc.params) {
        if (param.type.reference?.ref?.name === modelName) return true;
    }
    return false;
}

export function renderModelPage(model: DataModel, options: RenderOptions, procedures: Procedure[] = []): string {
    const lines: string[] = [
        ...generatedHeader(),
        breadcrumbs('Models', model.name, '../'),
        '',
        `# ${model.name} <kbd>Model</kbd>`,
        '',
    ];

    const description = stripCommentPrefix(model.comments);
    if (description) {
        for (const line of description.split('\n')) {
            lines.push(`> ${line}`);
        }
        lines.push('');
    }

    const docMeta = extractDocMeta(model.attributes);
    const sourcePath = getRelativeSourcePath(model, options.schemaDir);

    const metaParts: string[] = [];
    if (docMeta.category) metaParts.push(`**Category:** ${docMeta.category}`);
    if (docMeta.since) metaParts.push(`**Since:** ${docMeta.since}`);
    if (docMeta.deprecated) metaParts.push(`**Deprecated:** ${docMeta.deprecated}`);
    if (sourcePath) metaParts.push(`**Defined in:** \`${sourcePath}\``);

    if (metaParts.length > 0) {
        lines.push(metaParts.join(' · '), '');
    }

    const mixinRefs = model.mixins
        .map((ref) => ref.ref)
        .filter((t): t is NonNullable<typeof t> => t != null)
        .sort((a, b) => a.name.localeCompare(b.name));

    const allFields = getAllFields(model);
    const orderedFields =
        options.fieldOrder === 'alphabetical'
            ? [...allFields].sort((a, b) => a.name.localeCompare(b.name))
            : [...allFields];

    const relationFields = allFields
        .filter((f) => f.type.reference?.ref && isDataModel(f.type.reference.ref))
        .sort((a, b) => a.name.localeCompare(b.name));

    const policyAttrs = model.attributes.filter((a) => {
        const name = a.decl.ref?.name ?? '';
        return name === '@@allow' || name === '@@deny';
    });

    const indexAttrs = model.attributes.filter((a) => {
        const name = a.decl.ref?.name ?? '';
        return name === '@@index' || name === '@@unique' || name === '@@id';
    });

    const validationRules: Array<{ fieldName: string; rule: string }> = [];
    for (const field of orderedFields) {
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

    const sections: string[] = [];
    if (mixinRefs.length > 0) sections.push('Mixins');
    if (orderedFields.length > 0) sections.push('Fields');
    if (options.includeRelationships && relationFields.length > 0) sections.push('Relationships');
    if (options.includePolicies && policyAttrs.length > 0) sections.push('Access Policies');
    if (options.includeIndexes && indexAttrs.length > 0) sections.push('Indexes');
    if (options.includeValidation && validationRules.length > 0) sections.push('Validation Rules');

    const referencingProcsForToc = procedures
        .filter((p) => isModelReferencedByProc(p, model.name));
    if (referencingProcsForToc.length > 0) sections.push('Used in Procedures');

    if (sections.length > 1) {
        const tocLinks = sections.map((s) => {
            const anchor = s.toLowerCase().replace(/\s+/g, '-');
            return `[${s}](#${anchor})`;
        });
        lines.push(tocLinks.join(' · '), '');
    }

    if (mixinRefs.length > 0) {
        lines.push('## Mixins', '');
        for (const mixin of mixinRefs) {
            lines.push(`- [${mixin.name}](../types/${mixin.name}.md)`);
        }
        lines.push('');
    }

    if (orderedFields.length > 0) {
        lines.push('## Fields', '');
        lines.push('| Field | Type | Required | Default | Attributes | Source | Description |');
        lines.push('| --- | --- | --- | --- | --- | --- | --- |');

        for (const field of orderedFields) {
            const fieldDescription = stripCommentPrefix(field.comments);
            const isComputed = field.attributes.some((a) => getAttrName(a) === '@computed');
            const inheritedFrom =
                isDataModel(field.$container) && field.$container !== model
                    ? field.$container.name
                    : undefined;
            const fromMixin =
                isTypeDef(field.$container) ? field.$container.name : undefined;

            let source = '—';
            if (fromMixin) {
                source = `[${fromMixin}](../types/${fromMixin}.md)`;
            } else if (inheritedFrom) {
                source = `[${inheritedFrom}](./${inheritedFrom}.md)`;
            }

            const descParts: string[] = [];
            if (isComputed) descParts.push('**Computed**');
            const example = extractFieldDocExample(field);
            if (example) descParts.push(`Example: \`${example}\``);
            if (fieldDescription) descParts.push(fieldDescription);
            const desc = descParts.length > 0 ? descParts.join(' ') : '—';
            lines.push(
                `| ${field.name} | ${getFieldTypeName(field, true)} | ${isFieldRequired(field) ? 'Yes' : 'No'} | ${getDefaultValue(field)} | ${getFieldAttributes(field)} | ${source} | ${desc} |`,
            );
        }
        lines.push('');
    }

    if (options.includeRelationships && relationFields.length > 0) {
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

    if (options.includePolicies && policyAttrs.length > 0) {
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

    if (options.includeIndexes && indexAttrs.length > 0) {
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

    if (options.includeValidation && validationRules.length > 0) {
        lines.push('## Validation Rules', '');
        lines.push('| Field | Rule |');
        lines.push('| --- | --- |');
        for (const { fieldName, rule } of validationRules) {
            lines.push(`| ${fieldName} | ${rule} |`);
        }
        lines.push('');
    }

    const referencingProcs = procedures
        .filter((p) => isModelReferencedByProc(p, model.name))
        .sort((a, b) => a.name.localeCompare(b.name));

    if (referencingProcs.length > 0) {
        lines.push('## Used in Procedures', '');
        for (const proc of referencingProcs) {
            const kind = proc.mutation ? 'mutation' : 'query';
            lines.push(`- [${proc.name}](../procedures/${proc.name}.md) — *${kind}*`);
        }
        lines.push('');
    }

    const cstText = model.$cstNode?.text;
    if (cstText) {
        lines.push('<details>');
        lines.push('<summary>Declaration</summary>', '');
        lines.push('```prisma');
        lines.push(cstText);
        lines.push('```', '');
        lines.push('</details>', '');
    }

    return lines.join('\n');
}
