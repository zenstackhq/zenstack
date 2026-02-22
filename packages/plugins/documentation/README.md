# @zenstackhq/plugin-documentation

Automatically generate rich, browsable Markdown documentation from your ZModel schema — every time you run `zenstack generate`.

## Why

Your ZModel schema is already the single source of truth for your data layer: models, relationships, enums, access policies, validation rules, computed fields, procedures. But that knowledge is locked inside `.zmodel` files that non-engineers can't easily read, and manually-maintained wiki pages inevitably drift.

This plugin turns your schema into a documentation site that:

- **Stays in sync** — regenerated on every `zenstack generate`, so docs never go stale
- **Surfaces hidden knowledge** — access policies, validation constraints, and indexes are documented automatically, not just fields and types
- **Onboards new engineers** — a browsable reference with cross-links, ER diagrams, and field descriptions means less time asking "what does this model do?"
- **Works with your tools** — outputs standard Markdown with Mermaid diagrams, compatible with GitHub, GitLab, Obsidian, Docusaurus, VitePress, and any Markdown renderer that supports fenced Mermaid blocks (Notion renders plain Markdown but not Mermaid natively)

## Quick Start

**1. Register the plugin** in your `schema.zmodel`:

```prisma
plugin documentation {
    provider = '@zenstackhq/plugin-documentation'
    output   = './docs/schema'
}
```

**2. Generate:**

```bash
npx zenstack generate
```

**3. Browse** your docs in `./docs/schema/`.

That's it. Every entity in your schema now has its own documentation page.

## What You Get

### A structured doc site

```
docs/schema/
├── index.md              # Overview with counts, descriptions, and navigation
├── relationships.md      # Full ER diagram + cross-reference table
├── models/
│   ├── User.md
│   └── Post.md
├── views/
│   └── UserProfile.md
├── types/
│   └── Timestamps.md
├── enums/
│   └── Role.md
└── procedures/
    └── signUp.md
```

### An index page with everything at a glance

The index lists every model, view, type, enum, and procedure with inline description excerpts, artifact counts, and links to the relationships diagram.

### Model pages packed with context

Each model page includes (when applicable):

- **Fields table** — name, type, required/optional, default value, attributes, description
- **Relationships** — related models with cardinality and a Mermaid ER diagram
- **Access policies** — every `@@allow` and `@@deny` rule in a readable table
- **Validation rules** — `@email`, `@length`, `@regex`, and all other validation attributes
- **Indexes** — `@@index` and `@@unique` constraints
- **Computed fields** — clearly badged so readers know they're derived
- **Mixins** — which types are mixed in, with links to their definitions
- **Procedures** — which procedures reference this model
- **Declaration** — the raw ZModel source in a collapsible block

Sections are only shown when they have content, so simple models get clean, short pages.

### Mermaid diagrams everywhere

- **Relationship pages** get a full-schema ER diagram
- **Model pages** get a focused ER diagram showing that model's relationships and a field-level entity diagram with PK/FK/UK annotations
- **Enum pages** get a class diagram showing which models use them
- **Type pages** get a class diagram showing mixin relationships
- **Procedure pages** get a flowchart showing input → procedure → output

### Rich cross-linking

Every reference is a working link:

- Field types link to their model, enum, or type page
- "Used By" sections on enums and types deep-link to the exact field on the model page
- Procedures link to return types and parameter types
- Models link back to procedures that reference them
- Prev/next navigation between entities of the same kind
- Breadcrumbs on every page back to the index

## Configuration

All options go inside the `plugin` block:

```prisma
plugin documentation {
    provider               = '@zenstackhq/plugin-documentation'
    output                 = './docs/schema'
    title                  = 'Acme API Schema'
    fieldOrder             = 'alphabetical'
    groupBy                = 'category'
    includeInternalModels  = true
    includeRelationships   = true
    includePolicies        = true
    includeValidation      = true
    includeIndexes         = true
    generateSkill          = true
}
```

| Option | Type | Default | Description |
|---|---|---|---|
| `output` | `string` | *(required)* | Directory to write generated docs |
| `title` | `string` | `"Schema Documentation"` | Heading on the index page |
| `fieldOrder` | `"declaration"` or `"alphabetical"` | `"declaration"` | How fields are ordered in tables |
| `groupBy` | `"category"` | *(none)* | Group models into subdirectories by their `@@meta('doc:category')` value |
| `includeInternalModels` | `boolean` | `false` | Include models marked `@@ignore` in output |
| `includeRelationships` | `boolean` | `true` | Generate relationship sections and `relationships.md` |
| `includePolicies` | `boolean` | `true` | Generate access policy tables |
| `includeValidation` | `boolean` | `true` | Generate validation rule tables |
| `includeIndexes` | `boolean` | `true` | Generate index/constraint tables |
| `generateSkill` | `boolean` | `false` | Generate a `SKILL.md` file for AI agent consumption |

## Enriching Your Documentation

### Triple-slash comments become descriptions

Add `///` comments to any model, field, enum value, or procedure. They become the description in the generated docs:

```prisma
/// A registered user in the platform.
/// Users can have multiple posts and belong to organizations.
model User {
    id    String @id @default(cuid())
    /// User's primary email address. Must be unique.
    email String @unique @email
}
```

### Documentation metadata with `@@meta`

Use `@@meta` with `doc:` prefixed keys to add structured metadata:

```prisma
model User {
    id    String @id @default(cuid())
    email String @meta('doc:example', 'jane@acme.com')

    @@meta('doc:category', 'Identity')
    @@meta('doc:since', '1.0')
    @@meta('doc:deprecated', 'Use Account model instead')
}
```

| Annotation | What it does |
|---|---|
| `@@meta('doc:category', '...')` | Shows **Category** in metadata. Used for `groupBy = 'category'` directory grouping. |
| `@@meta('doc:since', '...')` | Shows **Since** version in metadata |
| `@@meta('doc:deprecated', '...')` | Strikes through the name, adds a **Deprecated** badge, shows your message |
| `@meta('doc:example', '...')` | Shows an example value in the field's description column |

### Everything else is automatic

You don't need to annotate anything for the plugin to work. It automatically documents:

- All field types, optionality, and default values
- `@id`, `@unique`, `@map`, `@updatedAt`, `@json`, `@ignore`, `@computed` attributes
- All default-value functions: `cuid()`, `uuid()`, `nanoid()`, `ulid()`, `now()`, `autoincrement()`, `dbgenerated()`
- All validation attributes: `@email`, `@url`, `@datetime`, `@length`, `@regex`, `@startsWith`, `@endsWith`, `@contains`, `@gt`, `@gte`, `@lt`, `@lte`, `@trim`, `@lower`, `@upper`
- Model-level `@@validate` rules
- `@@allow` / `@@deny` access policies (including `auth()` expressions)
- `@@index` and `@@unique` constraints
- `@@map` (table name) and `@@schema` (database schema)
- `@@auth` and `@@delegate` model attributes
- Inherited fields from `extends` (with source links)
- Mixin fields from `with` (with source links)
- All relationships with cardinality
- Procedure parameters, return types, and mutation/query distinction

## Multi-File Schema Support

If your schema uses `import` to split across files:

```prisma
// schema.zmodel
import './models'
import './enums'
import './mixins'
```

The plugin resolves each entity to its originating file. The **Defined in** metadata and declaration blocks show the correct source filename (e.g. `models.zmodel`, `enums.zmodel`), not just the entry point.

## Recipes

### Commit generated docs to version control

Add the `zenstack generate` step to your CI pipeline and commit the output. This way docs stay in sync and are reviewable in PRs:

```bash
npx zenstack generate
git add docs/schema/
git diff --cached --quiet || git commit -m "docs: regenerate schema documentation"
```

### Serve as a static site

The generated Markdown works with any static site generator that supports Markdown + Mermaid:

- **Docusaurus** — drop the output into `docs/` and add a sidebar entry
- **VitePress** — use the output directory as a docs section
- **GitHub Pages** — push to a `docs/` folder and enable Pages

### Category-based organization

For larger schemas, group models into subdirectories by domain:

```prisma
model User {
    @@meta('doc:category', 'Identity')
}
model Post {
    @@meta('doc:category', 'Content')
}

plugin documentation {
    provider = '@zenstackhq/plugin-documentation'
    output   = './docs/schema'
    groupBy  = 'category'
}
```

This produces:
```
docs/schema/models/
├── Identity/
│   └── User.md
├── Content/
│   └── Post.md
└── Uncategorized.md
```

### Minimal output for simpler schemas

Turn off sections you don't need:

```prisma
plugin documentation {
    provider             = '@zenstackhq/plugin-documentation'
    output               = './docs/schema'
    includeRelationships = false
    includePolicies      = false
    includeValidation    = false
    includeIndexes       = false
}
```

This gives you clean model/enum/type pages with just fields, descriptions, and declarations.

## AI Agent Integration (SKILL.md)

Set `generateSkill = true` to produce a `SKILL.md` alongside the human-readable docs. This file gives AI coding agents (Cursor, Claude Code, Windsurf, and others) instant, project-specific context about your data layer.

```prisma
plugin documentation {
    provider      = '@zenstackhq/plugin-documentation'
    output        = './docs/schema'
    generateSkill = true
}
```

The generated `SKILL.md` includes:

- **YAML frontmatter** with name and description, compatible with the [skills.sh](https://skills.sh/docs) ecosystem
- **Schema overview** — entity counts at a glance
- **Compact entity catalog** — every model, enum, type, and view with fields, types, and attributes in a dense, machine-readable format
- **Relationship map** — flat listing of every model-to-model relationship with cardinality
- **Access policies** — allow/deny rules per model
- **Procedure signatures** — params, return types, mutation vs query
- **Validation constraints** — per-field validation rules
- **Links to full docs** — each entity links to its full documentation page for deeper context

The SKILL.md format is optimized for LLM consumption: information-dense, no visual formatting, consistent structure. When an agent needs to understand your data layer — to generate a query, build a form, write a migration, or reason about access control — it can read this single file instead of parsing `.zmodel` schemas.

You can install the generated skill into your project's `.agents/skills/` directory, or publish it via `npx skills add` for team-wide use. See the [skills.sh documentation](https://skills.sh/docs) for details.

## Compatibility

- Renders on any Markdown viewer (GitHub, GitLab, Bitbucket, Obsidian, VS Code, etc.)
- Mermaid diagrams require a renderer that supports fenced `mermaid` code blocks (GitHub, GitLab, Docusaurus, VitePress, Obsidian all do natively)
- GitHub Flavored Markdown alerts (`> [!CAUTION]`, `> [!IMPORTANT]`) render on GitHub; other viewers show them as blockquotes

## License

MIT
