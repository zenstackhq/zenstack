import { isDataModel, type DataModel, type Enum, type Model, type Procedure, type TypeDef } from '@zenstackhq/language/ast';
import { stripCommentPrefix, getAttrName, formatAttrArgs, extractProcedureComments } from '../extractors';

interface SkillCounts {
    models: number;
    views: number;
    enums: number;
    types: number;
    procedures: number;
}

function plural(n: number, word: string): string {
    return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function formatCountSummary(counts: SkillCounts): string {
    const parts: string[] = [];
    if (counts.models > 0) parts.push(plural(counts.models, 'model'));
    if (counts.views > 0) parts.push(plural(counts.views, 'view'));
    if (counts.types > 0) parts.push(plural(counts.types, 'type'));
    if (counts.enums > 0) parts.push(plural(counts.enums, 'enum'));
    if (counts.procedures > 0) parts.push(plural(counts.procedures, 'procedure'));
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

// --- Analysis helpers: extract patterns from the AST ---

function detectIdConvention(models: DataModel[]): string {
    const defaults = new Map<string, number>();
    for (const m of models) {
        for (const f of m.fields) {
            const isId = f.attributes.some(a => getAttrName(a) === '@id');
            if (!isId) continue;
            const defaultAttr = f.attributes.find(a => getAttrName(a) === '@default');
            const val = defaultAttr?.args[0]?.$cstNode?.text ?? 'none';
            defaults.set(val, (defaults.get(val) ?? 0) + 1);
        }
    }
    if (defaults.size === 0) return 'No consistent ID convention detected.';
    const sorted = [...defaults.entries()].sort((a, b) => b[1] - a[1]);
    const [primary, count] = sorted[0]!;
    if (count === models.length) return `All models use \`@default(${primary})\` for IDs.`;
    const exceptions = sorted.slice(1).map(([fn, c]) => `${c} use \`${fn}\``).join(', ');
    return `Most models use \`@default(${primary})\` for IDs. Exceptions: ${exceptions}.`;
}

function detectMixins(models: DataModel[], typeDefs: TypeDef[]): string[] {
    if (typeDefs.length === 0) return [];
    const lines: string[] = [];
    for (const td of typeDefs) {
        const users = models.filter(m =>
            m.mixins.some(mx => mx.ref?.name === td.name),
        );
        if (users.length > 0) {
            const fieldNames = td.fields.map(f => `\`${f.name}\``).join(', ');
            lines.push(`- **${td.name}** (${fieldNames}) — used by ${users.map(u => u.name).join(', ')}`);
        }
    }
    return lines;
}

function detectComputedFields(models: DataModel[]): string[] {
    const computed: string[] = [];
    for (const m of models) {
        for (const f of m.fields) {
            if (f.attributes.some(a => getAttrName(a) === '@computed')) {
                const desc = f.comments ? stripCommentPrefix(f.comments) : '';
                const descPart = desc ? ` — ${desc}` : '';
                computed.push(`- ${m.name}.${f.name}${descPart}`);
            }
        }
    }
    return computed;
}

function hasAuthRules(models: DataModel[]): boolean {
    return models.some(m =>
        m.attributes.some(a => {
            const name = a.decl.ref?.name;
            if (name !== '@@allow' && name !== '@@deny') return false;
            return a.args.some(arg => arg.$cstNode?.text?.includes('auth()'));
        }),
    );
}

// --- Instructional sections ---

function renderFrontmatter(title: string): string[] {
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return [
        '---',
        `name: ${slug}-schema`,
        `description: Schema reference for ${title}. Use when writing queries, building forms, creating or modifying models, generating API endpoints, writing tests with seed data, or reasoning about data access and validation in this project.`,
        '---',
        '',
    ];
}

function renderOverview(title: string, counts: SkillCounts, models: DataModel[]): string[] {
    const lines: string[] = [];
    lines.push(`# ${title} — Schema Skill`);
    lines.push('');
    lines.push(`This skill provides the data schema context for ${title}. Consult it whenever you need to understand the data model, write type-safe code against it, or respect its constraints.`);
    lines.push('');
    lines.push('## Schema Overview');
    lines.push('');
    lines.push(`This schema contains ${formatCountSummary(counts)}.`);
    lines.push('');

    const described = models.filter(m => stripCommentPrefix(m.comments));
    if (described.length > 0) {
        lines.push('Key entities:');
        for (const m of described.slice(0, 8)) {
            const desc = stripCommentPrefix(m.comments).split('\n')[0]!;
            lines.push(`- **${m.name}** — ${desc}`);
        }
        if (described.length > 8) {
            lines.push(`- ...and ${described.length - 8} more (see Entity Reference below)`);
        }
        lines.push('');
    }

    return lines;
}

function renderConventions(models: DataModel[], typeDefs: TypeDef[]): string[] {
    const lines: string[] = [];
    lines.push('## Conventions');
    lines.push('');
    lines.push('Follow these patterns when working with this schema:');
    lines.push('');

    lines.push(`- **IDs**: ${detectIdConvention(models)}`);

    const mixinLines = detectMixins(models, typeDefs);
    if (mixinLines.length > 0) {
        lines.push('- **Mixins** (shared field sets applied via `with`):');
        for (const ml of mixinLines) {
            lines.push(`  ${ml}`);
        }
    }

    const computedFields = detectComputedFields(models);
    if (computedFields.length > 0) {
        lines.push('- **Computed fields** are read-only and derived at the database level. Never set them directly:');
        for (const cf of computedFields) {
            lines.push(`  ${cf}`);
        }
    }

    const modelsWithRelations = models.filter(m =>
        m.fields.some(f => f.type.reference?.ref && isDataModel(f.type.reference.ref)),
    );
    if (modelsWithRelations.length > 0) {
        lines.push(`- **Relations**: ${modelsWithRelations.length} of ${models.length} models have relationships. When creating records, always provide required foreign key fields (e.g. \`organizationId\`, \`userId\`).`);
    }

    lines.push('');
    return lines;
}

function renderConstraints(models: DataModel[]): string[] {
    const modelsWithPolicies = models.filter(m =>
        m.attributes.some(a => {
            const name = a.decl.ref?.name;
            return name === '@@allow' || name === '@@deny';
        }),
    );

    const validationEntries: Array<{ model: string; field: string; rule: string }> = [];
    for (const model of models) {
        for (const field of model.fields) {
            for (const attr of field.attributes) {
                const attrDecl = attr.decl.ref;
                if (!attrDecl) continue;
                if (attrDecl.attributes.some((ia) => ia.decl.ref?.name === '@@@validation')) {
                    validationEntries.push({
                        model: model.name,
                        field: field.name,
                        rule: `${getAttrName(attr)}${formatAttrArgs(attr)}`,
                    });
                }
            }
        }
    }

    if (modelsWithPolicies.length === 0 && validationEntries.length === 0) return [];

    const lines: string[] = [];
    lines.push('## Constraints You Must Respect');
    lines.push('');

    if (modelsWithPolicies.length > 0) {
        lines.push('### Access Policies');
        lines.push('');
        lines.push('ZenStack enforces these rules at the ORM level. Your code does not need to re-implement them, but you must be aware of them when reasoning about what operations will succeed or fail.');
        if (hasAuthRules(models)) {
            lines.push('');
            lines.push('> Some rules reference `auth()` — the currently authenticated user. Operations that require `auth()` will fail for unauthenticated requests.');
        }
        lines.push('');

        for (const model of modelsWithPolicies.sort((a, b) => a.name.localeCompare(b.name))) {
            const rules: string[] = [];
            for (const attr of model.attributes) {
                const name = attr.decl.ref?.name;
                if (name !== '@@allow' && name !== '@@deny') continue;
                const effect = name === '@@allow' ? 'allow' : 'deny';
                const args = attr.args.map(a => a.$cstNode?.text ?? '').join(', ');
                rules.push(`${effect}(${args})`);
            }
            lines.push(`**${model.name}**: ${rules.join(' · ')}`);
            lines.push('');
        }
    }

    if (validationEntries.length > 0) {
        lines.push('### Validation');
        lines.push('');
        lines.push('These constraints are enforced at the schema level. When generating test data, seed scripts, or form inputs, produce values that satisfy them.');
        lines.push('');

        const byModel = new Map<string, Array<{ field: string; rule: string }>>();
        for (const entry of validationEntries) {
            const list = byModel.get(entry.model) ?? [];
            list.push({ field: entry.field, rule: entry.rule });
            byModel.set(entry.model, list);
        }

        for (const modelName of [...byModel.keys()].sort()) {
            const rules = byModel.get(modelName)!.map(r => `${r.field}: ${r.rule}`).join(', ');
            lines.push(`- **${modelName}**: ${rules}`);
        }
        lines.push('');
    }

    return lines;
}

function renderWorkflow(models: DataModel[], procedures: Procedure[], hasRelationships: boolean): string[] {
    const lines: string[] = [];
    lines.push('## How To Use This Schema');
    lines.push('');

    lines.push('### Writing queries or mutations');
    lines.push('');
    lines.push('1. Find the model in the Entity Reference below');
    lines.push('2. Check its fields for types, optionality, and defaults');
    lines.push('3. Check access policies — will the operation be allowed for the current user?');
    lines.push('4. Check validation — will the input values pass schema-level validation?');
    lines.push('5. For full field details, follow the `[Full documentation]` link');
    lines.push('');

    if (procedures.length > 0) {
        lines.push('### Calling procedures');
        lines.push('');
        lines.push('This schema defines server-side procedures. Use them instead of writing raw queries when available:');
        lines.push('');
        const sorted = [...procedures].sort((a, b) => a.name.localeCompare(b.name));
        for (const proc of sorted) {
            const kind = proc.mutation ? 'mutation' : 'query';
            const params = proc.params.map(p => {
                let typeName = p.type.reference?.ref?.name ?? p.type.type ?? 'Unknown';
                if (p.type.array) typeName += '[]';
                if (p.optional) typeName += '?';
                return `${p.name}: ${typeName}`;
            }).join(', ');
            let returnType = proc.returnType.reference?.ref?.name ?? proc.returnType.type ?? 'Void';
            if (proc.returnType.array) returnType += '[]';
            const desc = extractProcedureComments(proc, ' ');
            const descPart = desc ? ` — ${desc}` : '';
            lines.push(`- \`${proc.name}(${params}) → ${returnType}\` *(${kind})*${descPart} — [details](./procedures/${proc.name}.md)`);
        }
        lines.push('');
    }

    lines.push('### Generating test data');
    lines.push('');
    lines.push('When creating seed data or test fixtures:');
    lines.push('');
    lines.push('- Respect `@unique` constraints — duplicate values will cause insert failures');
    lines.push('- Satisfy validation rules (see Constraints above)');
    lines.push('- Provide all required foreign keys for relations');
    lines.push('- Fields with `@default(...)` can be omitted — the database generates them');
    lines.push('- Fields with `@computed` cannot be set — they are derived');
    lines.push('');

    if (hasRelationships) {
        lines.push('### Understanding relationships');
        lines.push('');
        lines.push('See the [relationships page](./relationships.md) for a full ER diagram and cross-reference table.');
        lines.push('');
    }

    return lines;
}

// --- Reference appendix ---

function renderEntityReference(models: DataModel[], enums: Enum[], typeDefs: TypeDef[], views: DataModel[]): string[] {
    const lines: string[] = [];
    lines.push('---');
    lines.push('');
    lines.push('## Entity Reference');
    lines.push('');
    lines.push('Compact field listings for every entity. For formatted tables, diagrams, and cross-links, follow the `[Full documentation]` links.');
    lines.push('');

    if (models.length > 0) {
        lines.push('### Models');
        lines.push('');
        for (const model of [...models].sort((a, b) => a.name.localeCompare(b.name))) {
            const desc = stripCommentPrefix(model.comments);
            const descPart = desc ? ` — ${desc.split('\n')[0]}` : '';
            lines.push(`#### ${model.name}${descPart}`);
            lines.push('');
            lines.push('```');
            for (const field of model.fields) {
                lines.push(compactFieldLine(field));
            }
            lines.push('```');
            lines.push('');

            const rels = model.fields.filter(f => f.type.reference?.ref && isDataModel(f.type.reference.ref));
            if (rels.length > 0) {
                lines.push('Relations: ' + rels.map(f => {
                    const target = f.type.reference!.ref!.name;
                    const card = f.type.array ? 'has many' : f.type.optional ? 'optional' : 'required';
                    return `${f.name} → ${target} (${card})`;
                }).join(', '));
                lines.push('');
            }

            lines.push(`[Full documentation](./models/${model.name}.md)`);
            lines.push('');
        }
    }

    if (enums.length > 0) {
        lines.push('### Enums');
        lines.push('');
        for (const e of [...enums].sort((a, b) => a.name.localeCompare(b.name))) {
            const desc = stripCommentPrefix(e.comments);
            const descPart = desc ? ` — ${desc.split('\n')[0]}` : '';
            lines.push(`#### ${e.name}${descPart}`);
            lines.push('');
            for (const field of e.fields) {
                const valDesc = stripCommentPrefix(field.comments);
                const vDescPart = valDesc ? ` — ${valDesc}` : '';
                lines.push(`- ${field.name}${vDescPart}`);
            }
            lines.push('');
            lines.push(`[Full documentation](./enums/${e.name}.md)`);
            lines.push('');
        }
    }

    if (typeDefs.length > 0) {
        lines.push('### Types');
        lines.push('');
        for (const td of [...typeDefs].sort((a, b) => a.name.localeCompare(b.name))) {
            const desc = stripCommentPrefix(td.comments);
            const descPart = desc ? ` — ${desc.split('\n')[0]}` : '';
            lines.push(`#### ${td.name}${descPart}`);
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
    }

    if (views.length > 0) {
        lines.push('### Views');
        lines.push('');
        for (const view of [...views].sort((a, b) => a.name.localeCompare(b.name))) {
            const desc = stripCommentPrefix(view.comments);
            const descPart = desc ? ` — ${desc.split('\n')[0]}` : '';
            lines.push(`#### ${view.name}${descPart}`);
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
    lines.push('### Relationships');
    lines.push('');
    for (const rel of rels) {
        lines.push(`- ${rel.from}.${rel.field} → ${rel.to} (${rel.cardinality})`);
    }
    lines.push('');
    return lines;
}

function renderFooter(hasRelationships: boolean): string[] {
    const lines: string[] = [];
    lines.push('---');
    lines.push('');
    lines.push('## Detailed Documentation');
    lines.push('');
    lines.push('For Mermaid diagrams, formatted tables, and fully cross-linked pages:');
    lines.push('');
    lines.push('- [Full schema index](./index.md)');
    if (hasRelationships) {
        lines.push('- [Relationships and ER diagrams](./relationships.md)');
    }
    lines.push('');
    return lines;
}

// --- Main export ---

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

    lines.push(...renderFrontmatter(title));
    lines.push(...renderOverview(title, counts, models));
    lines.push(...renderConventions(models, typeDefs));
    lines.push(...renderConstraints(models));
    lines.push(...renderWorkflow(models, procedures, hasRelationships));
    lines.push(...renderEntityReference(models, enums, typeDefs, views));
    lines.push(...renderRelationshipsSection(models));
    lines.push(...renderFooter(hasRelationships));

    return lines.join('\n');
}
