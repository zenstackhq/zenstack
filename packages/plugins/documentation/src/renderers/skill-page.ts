import { isDataModel, type DataModel, type Enum, type Model, type Procedure, type TypeDef } from '@zenstackhq/language/ast';
import { stripCommentPrefix, getAttrName, formatAttrArgs, extractProcedureComments } from '../extractors';

interface SkillCounts {
    models: number;
    views: number;
    enums: number;
    types: number;
    procedures: number;
}

function formatCountSummary(counts: SkillCounts): string {
    const parts: string[] = [];
    if (counts.models > 0) parts.push(`${counts.models} model${counts.models === 1 ? '' : 's'}`);
    if (counts.views > 0) parts.push(`${counts.views} view${counts.views === 1 ? '' : 's'}`);
    if (counts.types > 0) parts.push(`${counts.types} type${counts.types === 1 ? '' : 's'}`);
    if (counts.enums > 0) parts.push(`${counts.enums} enum${counts.enums === 1 ? '' : 's'}`);
    if (counts.procedures > 0) parts.push(`${counts.procedures} procedure${counts.procedures === 1 ? '' : 's'}`);
    return parts.join(', ');
}

function compactFieldLine(field: { name: string; type: { type?: string; reference?: { ref?: { name: string } }; array?: boolean; optional?: boolean }; comments?: string[]; attributes?: Array<{ decl: { ref?: { name: string } }; args: Array<{ $cstNode?: { text?: string } }> }> }): string {
    let typeName = field.type.reference?.ref?.name ?? field.type.type ?? 'Unknown';
    if (field.type.array) typeName += '[]';
    if (field.type.optional) typeName += '?';

    const attrs = (field.attributes ?? [])
        .filter(a => {
            const name = getAttrName(a);
            return name && !name.startsWith('@@@') && name !== '@meta';
        })
        .map(a => `${getAttrName(a)}${formatAttrArgs(a)}`)
        .join(' ');

    const description = field.comments ? stripCommentPrefix(field.comments) : '';
    const attrPart = attrs ? ` ${attrs}` : '';
    const descPart = description ? `  — ${description}` : '';

    return `  ${field.name}: ${typeName}${attrPart}${descPart}`;
}

function renderModelsSection(models: DataModel[]): string[] {
    if (models.length === 0) return [];
    const lines: string[] = [];
    lines.push('## Models');
    lines.push('');

    const sorted = [...models].sort((a, b) => a.name.localeCompare(b.name));
    for (const model of sorted) {
        lines.push(`### ${model.name}`);
        const desc = stripCommentPrefix(model.comments);
        if (desc) {
            lines.push('');
            lines.push(desc);
        }
        lines.push('');
        lines.push('```');
        for (const field of model.fields) {
            lines.push(compactFieldLine(field));
        }
        lines.push('```');
        lines.push('');
        lines.push(`[Full documentation](./models/${model.name}.md)`);
        lines.push('');
    }

    return lines;
}

function renderEnumsSection(enums: Enum[]): string[] {
    if (enums.length === 0) return [];
    const lines: string[] = [];
    lines.push('## Enums');
    lines.push('');

    const sorted = [...enums].sort((a, b) => a.name.localeCompare(b.name));
    for (const e of sorted) {
        lines.push(`### ${e.name}`);
        const desc = stripCommentPrefix(e.comments);
        if (desc) {
            lines.push('');
            lines.push(desc);
        }
        lines.push('');
        lines.push('Values:');
        for (const field of e.fields) {
            const valDesc = stripCommentPrefix(field.comments);
            const descPart = valDesc ? ` — ${valDesc}` : '';
            lines.push(`- ${field.name}${descPart}`);
        }
        lines.push('');
        lines.push(`[Full documentation](./enums/${e.name}.md)`);
        lines.push('');
    }

    return lines;
}

function renderTypesSection(typeDefs: TypeDef[]): string[] {
    if (typeDefs.length === 0) return [];
    const lines: string[] = [];
    lines.push('## Types');
    lines.push('');

    const sorted = [...typeDefs].sort((a, b) => a.name.localeCompare(b.name));
    for (const td of sorted) {
        lines.push(`### ${td.name}`);
        const desc = stripCommentPrefix(td.comments);
        if (desc) {
            lines.push('');
            lines.push(desc);
        }
        lines.push('');
        lines.push('```');
        for (const field of td.fields) {
            lines.push(compactFieldLine(field));
        }
        lines.push('```');
        lines.push('');
        lines.push(`[Full documentation](./types/${td.name}.md)`);
        lines.push('');
    }

    return lines;
}

function renderViewsSection(views: DataModel[]): string[] {
    if (views.length === 0) return [];
    const lines: string[] = [];
    lines.push('## Views');
    lines.push('');

    const sorted = [...views].sort((a, b) => a.name.localeCompare(b.name));
    for (const view of sorted) {
        lines.push(`### ${view.name}`);
        const desc = stripCommentPrefix(view.comments);
        if (desc) {
            lines.push('');
            lines.push(desc);
        }
        lines.push('');
        lines.push('```');
        for (const field of view.fields) {
            lines.push(compactFieldLine(field));
        }
        lines.push('```');
        lines.push('');
        lines.push(`[Full documentation](./views/${view.name}.md)`);
        lines.push('');
    }

    return lines;
}

function renderRelationshipsSection(models: DataModel[]): string[] {
    const rels: Array<{ from: string; field: string; to: string; cardinality: string }> = [];
    for (const model of models) {
        for (const field of model.fields) {
            if (field.type.reference?.ref && isDataModel(field.type.reference.ref)) {
                const to = field.type.reference.ref.name;
                let cardinality: string;
                if (field.type.array) {
                    cardinality = 'has many';
                } else if (field.type.optional) {
                    cardinality = 'belongs to (optional)';
                } else {
                    cardinality = 'belongs to';
                }
                rels.push({ from: model.name, field: field.name, to, cardinality });
            }
        }
    }
    if (rels.length === 0) return [];

    const lines: string[] = [];
    lines.push('## Relationships');
    lines.push('');
    for (const rel of rels) {
        lines.push(`- ${rel.from}.${rel.field} → ${rel.to} (${rel.cardinality})`);
    }
    lines.push('');
    return lines;
}

function renderPoliciesSection(models: DataModel[]): string[] {
    const modelsWithPolicies = models
        .filter(m => m.attributes.some(a => {
            const name = a.decl.ref?.name;
            return name === '@@allow' || name === '@@deny';
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

    if (modelsWithPolicies.length === 0) return [];

    const lines: string[] = [];
    lines.push('## Access Policies');
    lines.push('');

    for (const model of modelsWithPolicies) {
        lines.push(`### ${model.name}`);
        lines.push('');
        for (const attr of model.attributes) {
            const name = attr.decl.ref?.name;
            if (name !== '@@allow' && name !== '@@deny') continue;
            const effect = name === '@@allow' ? 'allow' : 'deny';
            const args = attr.args.map(a => a.$cstNode?.text ?? '').join(', ');
            lines.push(`- ${effect}(${args})`);
        }
        lines.push('');
    }

    return lines;
}

function renderProceduresSection(procedures: Procedure[]): string[] {
    if (procedures.length === 0) return [];
    const lines: string[] = [];
    lines.push('## Procedures');
    lines.push('');

    const sorted = [...procedures].sort((a, b) => a.name.localeCompare(b.name));
    for (const proc of sorted) {
        const kind = proc.mutation ? 'mutation' : 'query';
        const desc = extractProcedureComments(proc);

        const params = proc.params.map(p => {
            let typeName = p.type.reference?.ref?.name ?? p.type.type ?? 'Unknown';
            if (p.type.array) typeName += '[]';
            if (p.optional) typeName += '?';
            return `${p.name}: ${typeName}`;
        }).join(', ');

        let returnType = proc.returnType.reference?.ref?.name ?? proc.returnType.type ?? 'Void';
        if (proc.returnType.array) returnType += '[]';

        lines.push(`### ${proc.name} (${kind})`);
        if (desc) {
            lines.push('');
            lines.push(desc);
        }
        lines.push('');
        lines.push(`- Params: ${params || 'none'}`);
        lines.push(`- Returns: ${returnType}`);
        lines.push(`- Signature: \`${proc.name}(${params}) → ${returnType}\``);
        lines.push('');
        lines.push(`[Full documentation](./procedures/${proc.name}.md)`);
        lines.push('');
    }

    return lines;
}

function renderValidationSection(models: DataModel[]): string[] {
    const entries: Array<{ model: string; field: string; rule: string }> = [];

    for (const model of models) {
        for (const field of model.fields) {
            for (const attr of field.attributes) {
                const attrDecl = attr.decl.ref;
                if (!attrDecl) continue;
                const isValidation = attrDecl.attributes.some(
                    (ia) => ia.decl.ref?.name === '@@@validation',
                );
                if (isValidation) {
                    entries.push({
                        model: model.name,
                        field: field.name,
                        rule: `${getAttrName(attr)}${formatAttrArgs(attr)}`,
                    });
                }
            }
        }
    }

    if (entries.length === 0) return [];

    const lines: string[] = [];
    lines.push('## Validation');
    lines.push('');

    const byModel = new Map<string, Array<{ field: string; rule: string }>>();
    for (const entry of entries) {
        const list = byModel.get(entry.model) ?? [];
        list.push({ field: entry.field, rule: entry.rule });
        byModel.set(entry.model, list);
    }

    const sortedModels = [...byModel.keys()].sort();
    for (const modelName of sortedModels) {
        lines.push(`### ${modelName}`);
        lines.push('');
        for (const { field, rule } of byModel.get(modelName)!) {
            lines.push(`- ${field}: ${rule}`);
        }
        lines.push('');
    }

    return lines;
}

function renderDetailedDocsSection(hasRelationships: boolean): string[] {
    const lines: string[] = [];
    lines.push('## Detailed Documentation');
    lines.push('');
    lines.push('For full details including Mermaid diagrams, formatted tables, and cross-linked pages, see:');
    lines.push('');
    lines.push('- [Full schema index](./index.md)');
    if (hasRelationships) {
        lines.push('- [Relationships and ER diagrams](./relationships.md)');
    }
    lines.push('');
    return lines;
}

export function renderSkillPage(
    _schema: Model,
    title: string,
    models: DataModel[],
    views: DataModel[],
    enums: Enum[],
    typeDefs: TypeDef[],
    procedures: Procedure[],
    hasRelationships: boolean = false,
): string {
    const counts: SkillCounts = {
        models: models.length,
        views: views.length,
        enums: enums.length,
        types: typeDefs.length,
        procedures: procedures.length,
    };

    const lines: string[] = [];

    lines.push('---');
    lines.push(`name: ${title.toLowerCase().replace(/\s+/g, '-')}-schema`);
    lines.push(`description: Data model reference for ${title}. Use when working with this project's database schema, models, relationships, access policies, or ZenStack entities.`);
    lines.push('---');
    lines.push('');
    lines.push(`# ${title} — Schema Reference`);
    lines.push('');
    lines.push('This file provides a compact, machine-readable reference of the data schema.');
    lines.push('Use it to understand the domain model, field types, relationships, constraints, and access policies.');
    lines.push('');

    lines.push('## Schema Overview');
    lines.push('');
    lines.push(`This schema contains ${formatCountSummary(counts)}.`);
    lines.push('');

    lines.push(...renderModelsSection(models));
    lines.push(...renderEnumsSection(enums));
    lines.push(...renderTypesSection(typeDefs));
    lines.push(...renderViewsSection(views));
    lines.push(...renderRelationshipsSection(models));
    lines.push(...renderPoliciesSection(models));
    lines.push(...renderProceduresSection(procedures));
    lines.push(...renderValidationSection(models));
    lines.push(...renderDetailedDocsSection(hasRelationships));

    return lines.join('\n');
}
