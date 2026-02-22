import { isDataModel, isTypeDef, type DataField, type DataModel, type DataModelAttribute, type Procedure } from '@zenstackhq/language/ast';
import { getAllFields } from '@zenstackhq/language/utils';
import { breadcrumbs, declarationBlock, generatedHeader, navigationFooter, referencesSection, renderDescription, renderMetadata, sectionHeading } from './common';
import type { Navigation } from '../types';
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

interface ValidationRule {
    fieldName: string;
    rule: string;
}

function isModelReferencedByProc(proc: Procedure, modelName: string): boolean {
    if (proc.returnType.reference?.ref?.name === modelName) return true;
    if (proc.returnType.type === modelName) return true;
    for (const param of proc.params) {
        if (param.type.reference?.ref?.name === modelName) return true;
        if (param.type.type === modelName) return true;
    }
    return false;
}

function collectValidationRules(orderedFields: DataField[], modelAttrs: DataModelAttribute[]): ValidationRule[] {
    const rules: ValidationRule[] = [];

    for (const field of orderedFields) {
        for (const attr of field.attributes) {
            const attrDecl = attr.decl.ref;
            if (!attrDecl) continue;
            const isValidation = attrDecl.attributes.some(
                (ia) => ia.decl.ref?.name === '@@@validation',
            );
            if (isValidation) {
                rules.push({ fieldName: field.name, rule: `\`${getAttrName(attr)}\`` });
            }
        }
    }

    const validateAttrs = modelAttrs.filter((a) => a.decl.ref?.name === '@@validate');
    for (const attr of validateAttrs) {
        const condition = attr.args[0]?.$cstNode?.text ?? '';
        const messageArg = attr.args[1]?.$cstNode?.text?.replace(/^['"]|['"]$/g, '');
        const pathArg = attr.args[2]?.$cstNode?.text;

        const fieldName = pathArg ?? 'Model';
        let ruleText = `\`${condition}\``;
        if (messageArg) {
            ruleText += ` — *${messageArg}*`;
        }
        rules.push({ fieldName, rule: ruleText });
    }

    return rules;
}

function collectFKFieldNames(allFields: DataField[]): Set<string> {
    const fkNames = new Set<string>();
    for (const field of allFields) {
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

function renderEntityDiagram(modelName: string, allFields: DataField[]): string[] {
    const fkNames = collectFKFieldNames(allFields);
    const scalarFields = allFields.filter(
        (f) => !(f.type.reference?.ref && isDataModel(f.type.reference.ref)),
    );
    if (scalarFields.length === 0) return [];

    const lines = [...sectionHeading('Entity Diagram'), ''];
    lines.push('```mermaid', 'erDiagram');
    lines.push(`    ${modelName} {`);

    for (const field of scalarFields) {
        const typeName = field.type.reference?.ref?.name ?? field.type.type ?? 'Unknown';
        const hasId = field.attributes.some((a) => getAttrName(a) === '@id');
        const hasUnique = field.attributes.some((a) => getAttrName(a) === '@unique');

        let annotation = '';
        if (hasId) annotation = ' PK';
        else if (hasUnique) annotation = ' UK';
        else if (fkNames.has(field.name)) annotation = ' FK';

        lines.push(`        ${typeName} ${field.name}${annotation}`);
    }

    lines.push('    }');
    lines.push('```', '');
    return lines;
}

function renderFieldsSection(model: DataModel, orderedFields: DataField[]): string[] {
    if (orderedFields.length === 0) return [];

    const lines = [...sectionHeading('Fields'), '', '| Field | Type | Required | Default | Attributes | Source | Description |', '| --- | --- | --- | --- | --- | --- | --- |'];

    for (const field of orderedFields) {
        const fieldDescription = stripCommentPrefix(field.comments);
        const isComputed = field.attributes.some((a) => getAttrName(a) === '@computed');
        const isIgnored = field.attributes.some((a) => getAttrName(a) === '@ignore');
        const inheritedFrom =
            isDataModel(field.$container) && field.$container !== model
                ? field.$container.name
                : undefined;
        const fromMixin = isTypeDef(field.$container) ? field.$container.name : undefined;

        let source = '—';
        if (fromMixin) {
            source = `[${fromMixin}](../types/${fromMixin}.md)`;
        } else if (inheritedFrom) {
            source = `[${inheritedFrom}](./${inheritedFrom}.md)`;
        }

        let typeCol = getFieldTypeName(field, true);
        if (isComputed) typeCol += ' <kbd>computed</kbd>';
        if (isIgnored) typeCol += ' <kbd>ignored</kbd>';

        const descParts: string[] = [];
        const example = extractFieldDocExample(field);
        if (example) descParts.push(`Example: \`${example}\``);
        if (fieldDescription) descParts.push(fieldDescription);
        const desc = descParts.length > 0 ? descParts.join(' ') : '—';
        const fieldAnchor = `<a id="field-${field.name}"></a>`;
        lines.push(
            `| ${fieldAnchor}\`${field.name}\` | ${typeCol} | ${isFieldRequired(field) ? 'Yes' : 'No'} | ${getDefaultValue(field)} | ${getFieldAttributes(field)} | ${source} | ${desc} |`,
        );
    }
    lines.push('');
    return lines;
}

function renderRelationshipsSection(modelName: string, relationFields: DataField[]): string[] {
    if (relationFields.length === 0) return [];

    const lines = [...sectionHeading('Relationships'), '', '| Field | Related Model | Type |', '| --- | --- | --- |'];
    const mermaidLines: string[] = [];
    const seenPairs = new Set<string>();

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
        lines.push(`| \`${field.name}\` | [${relatedModel}](./${relatedModel}.md) | ${relType} |`);

        const pairKey = [modelName, relatedModel].sort().join('--');
        if (!seenPairs.has(pairKey)) {
            seenPairs.add(pairKey);
            if (field.type.array) {
                mermaidLines.push(`    ${modelName} ||--o{ ${relatedModel} : "${field.name}"`);
            } else {
                mermaidLines.push(`    ${modelName} }o--|| ${relatedModel} : "${field.name}"`);
            }
        }
    }
    lines.push('');

    if (mermaidLines.length > 0) {
        lines.push('```mermaid', 'erDiagram', ...mermaidLines, '```', '');
    }
    return lines;
}

function renderPoliciesSection(policyAttrs: DataModelAttribute[]): string[] {
    if (policyAttrs.length === 0) return [];

    const lines = [
        ...sectionHeading('Access Policies'), '',
        '> [!IMPORTANT]',
        '> Operations are **denied by default**. `@@allow` rules grant access; `@@deny` rules override any allow.', '',
        '| Operation | Rule | Effect |',
        '| --- | --- | --- |',
    ];

    for (const attr of policyAttrs) {
        const attrName = attr.decl.ref?.name ?? '';
        const effect = attrName === '@@allow' ? 'Allow' : 'Deny';
        const operationArg = attr.args[0]?.$cstNode?.text ?? '';
        const operation = operationArg.replace(/^['"]|['"]$/g, '');
        const condition = attr.args[1]?.$cstNode?.text ?? '';
        lines.push(`| ${operation} | \`${condition}\` | ${effect} |`);
    }
    lines.push('');
    return lines;
}

function renderIndexesSection(indexAttrs: DataModelAttribute[]): string[] {
    if (indexAttrs.length === 0) return [];

    const lines = [...sectionHeading('Indexes'), '', '| Fields | Type |', '| --- | --- |'];

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
    return lines;
}

function renderValidationSection(rules: ValidationRule[]): string[] {
    if (rules.length === 0) return [];
    const lines = [...sectionHeading('Validation Rules'), '', '| Field | Rule |', '| --- | --- |'];
    for (const { fieldName, rule } of rules) {
        const nameCol = fieldName === 'Model' ? fieldName : `\`${fieldName}\``;
        lines.push(`| ${nameCol} | ${rule} |`);
    }
    lines.push('');
    return lines;
}

function renderProceduresSection(procedures: Procedure[], modelName: string): string[] {
    const referenced = procedures
        .filter((p) => isModelReferencedByProc(p, modelName))
        .sort((a, b) => a.name.localeCompare(b.name));

    if (referenced.length === 0) return [];

    const lines = [...sectionHeading('Used in Procedures'), ''];
    for (const proc of referenced) {
        const kind = proc.mutation ? 'mutation' : 'query';
        lines.push(`- [${proc.name}](../procedures/${proc.name}.md) — *${kind}*`);
    }
    lines.push('');
    return lines;
}

/** Renders a full documentation page for a data model, including fields, relationships, policies, validation, and procedures. */
export function renderModelPage(model: DataModel, options: RenderOptions, procedures: Procedure[] = [], navigation?: Navigation): string {
    const docMeta = extractDocMeta(model.attributes);
    const isDeprecated = !!docMeta.deprecated;
    const nameDisplay = isDeprecated ? `~~${model.name}~~` : model.name;

    const badgeParts = ['<kbd>Model</kbd>'];
    const hasAuth = model.attributes.some((a) => a.decl.ref?.name === '@@auth');
    const hasDelegate = model.attributes.some((a) => a.decl.ref?.name === '@@delegate');
    if (hasAuth) badgeParts.push('<kbd>Auth</kbd>');
    if (hasDelegate) badgeParts.push('<kbd>Delegate</kbd>');
    if (isDeprecated) badgeParts.push('<kbd>Deprecated</kbd>');
    const badges = ' ' + badgeParts.join(' ');

    const lines: string[] = [
        ...generatedHeader(options.genCtx),
        breadcrumbs('Models', model.name, '../'),
        '',
        `# ${nameDisplay}${badges}`,
        '',
    ];

    lines.push(...renderDescription(model.comments, stripCommentPrefix));
    const sourcePath = getRelativeSourcePath(model, options.schemaDir);

    const mapAttr = model.attributes.find((a) => a.decl.ref?.name === '@@map');
    const schemaAttr = model.attributes.find((a) => a.decl.ref?.name === '@@schema');
    const mappedTable = mapAttr?.args[0]?.$cstNode?.text?.replace(/^['"]|['"]$/g, '');
    const dbSchema = schemaAttr?.args[0]?.$cstNode?.text?.replace(/^['"]|['"]$/g, '');

    lines.push(...renderMetadata(docMeta, sourcePath, { mappedTable, dbSchema }));

    lines.push(...declarationBlock(model.$cstNode?.text, sourcePath));

    const allFields = getAllFields(model, true);

    lines.push(...renderEntityDiagram(model.name, [...allFields]));

    const mixinRefs = model.mixins
        .map((ref) => ref.ref)
        .filter((t): t is NonNullable<typeof t> => t != null)
        .sort((a, b) => a.name.localeCompare(b.name));

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

    const validationRules = collectValidationRules(orderedFields, model.attributes);

    const sections: string[] = [];
    if (mixinRefs.length > 0) sections.push('Mixins');
    if (orderedFields.length > 0) sections.push('Fields');
    if (options.includeRelationships && relationFields.length > 0) sections.push('Relationships');
    if (options.includePolicies && policyAttrs.length > 0) sections.push('Access Policies');
    if (options.includeIndexes && indexAttrs.length > 0) sections.push('Indexes');
    if (options.includeValidation && validationRules.length > 0) sections.push('Validation Rules');

    const referencingProcs = procedures.filter((p) => isModelReferencedByProc(p, model.name));
    if (referencingProcs.length > 0) sections.push('Used in Procedures');

    if (sections.length > 1) {
        const tocLinks = sections.map((s) => {
            const anchor = s.toLowerCase().replace(/\s+/g, '-');
            return `[${s}](#${anchor})`;
        });
        lines.push(tocLinks.join(' · '), '');
    }

    if (mixinRefs.length > 0) {
        lines.push(...sectionHeading('Mixins'), '');
        for (const mixin of mixinRefs) {
            lines.push(`- [${mixin.name}](../types/${mixin.name}.md)`);
        }
        lines.push('');
    }

    lines.push(...renderFieldsSection(model, orderedFields));
    if (options.includeRelationships) lines.push(...renderRelationshipsSection(model.name, relationFields));
    if (options.includePolicies) lines.push(...renderPoliciesSection(policyAttrs));
    if (options.includeIndexes) lines.push(...renderIndexesSection(indexAttrs));
    if (options.includeValidation) lines.push(...renderValidationSection(validationRules));
    lines.push(...renderProceduresSection(procedures, model.name));

    lines.push(...referencesSection('model'));
    lines.push(...navigationFooter(navigation));

    return lines.join('\n');
}
