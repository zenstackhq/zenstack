import { isDataModel, type DataModel, type DataField, type Enum, type Procedure, type TypeDef } from '@zenstackhq/language/ast';
import { stripCommentPrefix, getAttrName, formatAttrArgs, extractProcedureComments, resolveTypeName } from '../extractors';
import type { SkillPageProps } from '../types';

interface SkillCounts {
    models: number;
    views: number;
    enums: number;
    types: number;
    procedures: number;
}

/** Returns a pluralized count string (e.g. "3 models", "1 view"). */
function plural(n: number, word: string): string {
    return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** Joins non-zero entity counts into a comma-separated summary string. */
function formatCountSummary(counts: SkillCounts): string {
    const parts: string[] = [];
    if (counts.models > 0) parts.push(plural(counts.models, 'model'));
    if (counts.views > 0) parts.push(plural(counts.views, 'view'));
    if (counts.types > 0) parts.push(plural(counts.types, 'type'));
    if (counts.enums > 0) parts.push(plural(counts.enums, 'enum'));
    if (counts.procedures > 0) parts.push(plural(counts.procedures, 'procedure'));
    return parts.join(', ');
}

/** Formats a single field as a Prisma-style declaration line with type and attributes. */
function fieldDeclarationLine(field: DataField): string {
    let typeName = resolveTypeName(field.type);
    if (field.type.array) typeName += '[]';
    if (field.type.optional) typeName += '?';

    const attrs = (field.attributes ?? [])
        .filter(a => {
            const name = getAttrName(a);
            return name && !name.startsWith('@@@') && name !== '@meta';
        })
        .map(a => `${getAttrName(a)}${formatAttrArgs(a)}`)
        .join(' ');

    const attrPart = attrs ? ` ${attrs}` : '';
    return `    ${field.name} ${typeName}${attrPart}`;
}

/** Renders a complete model/view declaration block with comments, fields, and attributes. */
function renderModelDeclaration(model: DataModel, keyword: 'model' | 'view'): string[] {
    const lines: string[] = [];
    const desc = stripCommentPrefix(model.comments);
    if (desc) {
        for (const dLine of desc.split('\n')) {
            lines.push(`/// ${dLine}`);
        }
    }

    const mixinPart = model.mixins.length > 0
        ? ` with ${model.mixins.map(m => m.ref?.name ?? '').filter(Boolean).join(', ')}`
        : '';

    lines.push(`${keyword} ${model.name}${mixinPart} {`);
    for (const field of model.fields) {
        const fieldDesc = stripCommentPrefix(field.comments);
        if (fieldDesc) {
            lines.push(`    /// ${fieldDesc}`);
        }
        lines.push(fieldDeclarationLine(field));
    }

    for (const attr of model.attributes) {
        const name = attr.decl.ref?.name;
        if (!name || name.startsWith('@@@')) continue;
        const args = attr.args.map(a => a.$cstNode?.text ?? '').join(', ');
        lines.push(`    ${name}(${args})`);
    }

    lines.push('}');
    return lines;
}

/** Renders an enum declaration block with doc comments and values. */
function renderEnumDeclaration(e: Enum): string[] {
    const lines: string[] = [];
    const desc = stripCommentPrefix(e.comments);
    if (desc) {
        for (const dLine of desc.split('\n')) {
            lines.push(`/// ${dLine}`);
        }
    }
    lines.push(`enum ${e.name} {`);
    for (const field of e.fields) {
        const valDesc = stripCommentPrefix(field.comments);
        if (valDesc) {
            lines.push(`    /// ${valDesc}`);
        }
        lines.push(`    ${field.name}`);
    }
    lines.push('}');
    return lines;
}

/** Renders a type definition declaration block with fields and doc comments. */
function renderTypeDeclaration(td: TypeDef): string[] {
    const lines: string[] = [];
    const desc = stripCommentPrefix(td.comments);
    if (desc) {
        for (const dLine of desc.split('\n')) {
            lines.push(`/// ${dLine}`);
        }
    }
    lines.push(`type ${td.name} {`);
    for (const field of td.fields) {
        const fieldDesc = stripCommentPrefix(field.comments);
        if (fieldDesc) {
            lines.push(`    /// ${fieldDesc}`);
        }
        lines.push(fieldDeclarationLine(field));
    }
    lines.push('}');
    return lines;
}

/** Summarizes a model's relation fields as human-readable "field → Target (cardinality)" lines. */
function modelRelationLines(model: DataModel): string[] {
    const rels = model.fields.filter(f => f.type.reference?.ref && isDataModel(f.type.reference.ref));
    if (rels.length === 0) return [];
    return rels.map(f => {
        const ref = f.type.reference?.ref;
        if (!ref) return '';
        const card = f.type.array ? 'has many' : f.type.optional ? 'optional' : 'required';
        return `- ${f.name} → ${ref.name} (${card})`;
    }).filter(Boolean);
}

// --- Analysis helpers ---

/** Analyzes `@id` + `@default` patterns across models to describe the ID generation convention. */
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

/** Lists which type definitions are used as mixins and by which models. */
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

/** Finds all `@computed` fields across models for the conventions section. */
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

/** Extracts example foreign key field names from `@relation` attributes across models. */
function detectFKExamples(models: DataModel[]): string[] {
    const fks: string[] = [];
    for (const m of models) {
        for (const f of m.fields) {
            if (!(f.type.reference?.ref && isDataModel(f.type.reference.ref))) continue;
            if (f.type.array) continue;
            const relAttr = f.attributes.find(a => getAttrName(a) === '@relation');
            if (!relAttr) continue;
            const fieldsArg = relAttr.args.find(a => {
                const text = a.$cstNode?.text ?? '';
                return text.includes('fields:') || text.startsWith('[');
            });
            if (!fieldsArg) continue;
            const text = fieldsArg.$cstNode?.text ?? '';
            const bracketMatch = text.match(/\[([^\]]+)\]/);
            if (!bracketMatch) continue;
            for (const fk of bracketMatch[1]!.split(',').map(s => s.trim())) {
                if (fk && !fks.includes(fk)) fks.push(fk);
            }
        }
    }
    return fks;
}

/** Returns true if any model's access policy references `auth()`. */
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

/** Renders YAML frontmatter with the skill name and description. */
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

/** Renders the schema overview section with entity counts and a categorized entity list. */
function renderOverview(title: string, counts: SkillCounts, models: DataModel[], views: DataModel[]): string[] {
    const lines: string[] = [];
    lines.push(`# ${title} — Schema Skill`);
    lines.push('');
    lines.push(`This skill provides the data schema context for ${title}. Consult it whenever you need to understand the data model, write type-safe code against it, or respect its constraints.`);
    lines.push('');
    lines.push('## Schema Overview');
    lines.push('');
    lines.push(`This schema contains ${formatCountSummary(counts)}.`);
    lines.push('');

    const allEntities = [...models, ...views].sort((a, b) => a.name.localeCompare(b.name));
    if (allEntities.length > 0) {
        lines.push('Entities:');
        for (const m of allEntities) {
            const desc = stripCommentPrefix(m.comments);
            const kind = m.isView ? 'View' : 'Model';
            const descPart = desc ? ` — ${desc.split('\n')[0]}` : '';
            lines.push(`- **${m.name}** (${kind})${descPart}`);
        }
        lines.push('');
    }

    return lines;
}

/** Renders detected schema conventions: ID strategy, mixins, computed fields, FK patterns. */
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
        const fkExamples = detectFKExamples(models);
        const fkExamplePart = fkExamples.length > 0
            ? ` (e.g. \`${fkExamples.slice(0, 3).join('`, `')}\`)`
            : '';
        lines.push(`- **Relations**: ${modelsWithRelations.length} of ${models.length} models have relationships. When creating records, always provide required foreign key fields${fkExamplePart}.`);
    }

    lines.push('');
    return lines;
}

/** Renders access policies and validation rules that agents must respect. */
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

/** Renders step-by-step guidance for writing queries, calling procedures, and generating test data. */
function renderWorkflow(procedures: Procedure[], hasRelationships: boolean): string[] {
    const lines: string[] = [];
    lines.push('## How To Use This Schema');
    lines.push('');

    lines.push('### Writing queries or mutations');
    lines.push('');
    lines.push('1. Find the model in the Entity Reference below');
    lines.push('2. Check its fields for types, optionality, and defaults');
    lines.push('3. Check access policies — will the operation be allowed for the current user?');
    lines.push('4. Check validation — will the input values pass schema-level validation?');
    lines.push('5. For full field details, follow the entity documentation link');
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
                let typeName = resolveTypeName(p.type);
                if (p.type.array) typeName += '[]';
                if (p.optional) typeName += '?';
                return `${p.name}: ${typeName}`;
            }).join(', ');
            let returnType = resolveTypeName(proc.returnType);
            if (returnType === 'Unknown') returnType = 'Void';
            if (proc.returnType.array) returnType += '[]';
            const desc = extractProcedureComments(proc, ' ');
            const descPart = desc ? ` — ${desc}` : '';
            lines.push(`- \`${proc.name}(${params}) → ${returnType}\` *(${kind})*${descPart} — [${proc.name} (Procedure)](./procedures/${proc.name}.md)`);
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

// --- Entity Reference ---

/** Renders the full entity reference with Prisma declaration blocks and doc page links. */
function renderEntityReference(models: DataModel[], enums: Enum[], typeDefs: TypeDef[], views: DataModel[]): string[] {
    const lines: string[] = [];
    lines.push('---');
    lines.push('');
    lines.push('## Entity Reference');
    lines.push('');

    if (models.length > 0) {
        lines.push('### Models');
        lines.push('');
        for (const model of [...models].sort((a, b) => a.name.localeCompare(b.name))) {
            lines.push(`#### ${model.name}`);
            lines.push('');
            lines.push('```prisma');
            lines.push(...renderModelDeclaration(model, 'model'));
            lines.push('```');
            lines.push('');

            const rels = modelRelationLines(model);
            if (rels.length > 0) {
                lines.push('Relationships:');
                for (const r of rels) lines.push(r);
                lines.push('');
            }

            lines.push(`[${model.name} (Model)](./models/${model.name}.md)`);
            lines.push('');
        }
    }

    if (enums.length > 0) {
        lines.push('### Enums');
        lines.push('');
        for (const e of [...enums].sort((a, b) => a.name.localeCompare(b.name))) {
            lines.push(`#### ${e.name}`);
            lines.push('');
            lines.push('```prisma');
            lines.push(...renderEnumDeclaration(e));
            lines.push('```');
            lines.push('');
            lines.push(`[${e.name} (Enum)](./enums/${e.name}.md)`);
            lines.push('');
        }
    }

    if (typeDefs.length > 0) {
        lines.push('### Types');
        lines.push('');
        for (const td of [...typeDefs].sort((a, b) => a.name.localeCompare(b.name))) {
            lines.push(`#### ${td.name}`);
            lines.push('');
            lines.push('```prisma');
            lines.push(...renderTypeDeclaration(td));
            lines.push('```');
            lines.push('');
            lines.push(`[${td.name} (Type)](./types/${td.name}.md)`);
            lines.push('');
        }
    }

    if (views.length > 0) {
        lines.push('### Views');
        lines.push('');
        for (const view of [...views].sort((a, b) => a.name.localeCompare(b.name))) {
            lines.push(`#### ${view.name}`);
            lines.push('');
            lines.push('```prisma');
            lines.push(...renderModelDeclaration(view, 'view'));
            lines.push('```');
            lines.push('');
            lines.push(`[${view.name} (View)](./views/${view.name}.md)`);
            lines.push('');
        }
    }

    return lines;
}

/** Renders the footer with links to the full index and relationships pages. */
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

/**
 * Renders a `SKILL.md` file — an AI-agent-readable schema reference designed for
 * use as a skill definition in tools like Cursor, Claude Code, and skills.sh.
 *
 * The output includes a schema overview, detected conventions, access/validation constraints,
 * workflow guidance, and a full entity reference with prisma declaration blocks.
 */
export function renderSkillPage(props: SkillPageProps): string {
    const { title, models, views, enums, typeDefs, procedures, hasRelationships } = props;
    const counts: SkillCounts = {
        models: models.length,
        views: views.length,
        enums: enums.length,
        types: typeDefs.length,
        procedures: procedures.length,
    };

    return [
        ...renderFrontmatter(title),
        ...renderOverview(title, counts, models, views),
        ...renderConventions(models, typeDefs),
        ...renderConstraints(models),
        ...renderWorkflow(procedures, hasRelationships),
        ...renderEntityReference(models, enums, typeDefs, views),
        ...renderFooter(hasRelationships),
    ].join('\n');
}
