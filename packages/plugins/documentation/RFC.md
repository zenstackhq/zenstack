# RFC: ZenStack Documentation Generator Plugin

**Package:** `@zenstackhq/plugin-documentation`
**Type:** CLI Plugin (code generation)
**Status:** Draft
**Author:** Sheldon
**Date:** 2026-02-21

---

## Motivation

ZenStack schemas encode significant domain knowledge — models, relationships, enums, access policies, validation rules, computed fields, and more. Today there is no automated way to produce human-readable reference documentation from a schema. Teams end up manually maintaining wiki pages or Notion docs that quickly drift from the source of truth.

A documentation generator plugin would:

- Keep docs in sync with the schema automatically (runs on `zenstack generate`)
- Surface access policies, validation constraints, and relationships in a readable format
- Serve as onboarding material for new engineers joining a project
- Provide a foundation for API documentation when the schema backs a REST/GraphQL layer

---

## Plugin Type: CLI Plugin

This is a **CLI plugin**, not a runtime plugin. It produces static markdown files at generation time and has zero runtime footprint.

### Why CLI Plugin?

- Documentation is a build-time artifact — it doesn't need to intercept queries or hook into the ORM
- The `CliPlugin` contract gives us everything we need: the full ZModel AST (`Model`), the schema file path, output path, and user-provided options
- Follows the same lifecycle as the Prisma and TypeScript generators — runs during `zenstack generate`

### Plugin Contract

The plugin must export a default `CliPlugin`:

```typescript
import type { CliPlugin, CliGeneratorContext } from '@zenstackhq/sdk';

const plugin: CliPlugin = {
    name: 'Documentation Generator',
    statusText: 'Generating documentation',
    async generate(context: CliGeneratorContext) {
        // context.model      — ZModel AST (Model)
        // context.schemaFile  — path to the .zmodel file
        // context.defaultOutputPath — default output directory
        // context.pluginOptions    — Record<string, unknown>
    },
};

export default plugin;
```

### Schema Declaration

Users register the plugin in their `schema.zmodel`:

```zmodel
plugin documentation {
    provider = '@zenstackhq/plugin-documentation'
    output   = './docs'
}
```

Or during development, using a relative path:

```zmodel
plugin documentation {
    provider = './plugins/documentation'
    output   = './docs'
}
```

---

## Schema Annotations Strategy

### Existing Mechanisms (No New Attributes Required)

ZModel already provides two mechanisms that the doc plugin can consume without introducing any new grammar:

#### 1. Triple-slash comments (`///`)

These are preserved in the AST on `DataModel`, `DataField`, `Enum`, `EnumField`, `TypeDef`, `Attribute`, and `FunctionDecl` nodes as `comments: Array<string>`.

```zmodel
/// Represents a registered user in the system.
/// Users can have multiple posts and belong to organizations.
model User {
    /// Unique identifier, auto-generated CUID.
    id    String @id @default(cuid())

    /// User's email address. Must be unique across all users.
    email String @unique @email

    /// Display name shown in the UI.
    name  String @length(min: 1, max: 100)

    /// Posts authored by this user.
    posts Post[]
}
```

The doc generator extracts `node.comments` and strips the `///` prefix.

#### 2. `@meta` / `@@meta` Attributes

The built-in `@meta(name, value)` and `@@meta(name, value)` attributes allow attaching arbitrary key-value metadata. The doc plugin can recognize specific meta keys:

```zmodel
model User {
    @@meta('doc:category', 'Identity')
    @@meta('doc:since', '1.0.0')
    @@meta('doc:deprecated', 'Use Account model instead')

    email String @unique @meta('doc:example', 'jane@example.com')
}
```

### No Custom Attributes

The plugin intentionally does not introduce any custom attributes via `plugin.zmodel`. The combination of `///` comments and `@meta`/`@@meta` provides sufficient expressiveness without adding new DSL surface area.

---

## Output Structure

### Default: Multi-file Markdown

```
docs/
├── index.md                 # Overview — lists all models, enums, type defs
├── models/
│   ├── User.md              # One file per model
│   ├── Post.md
│   └── Organization.md
├── enums/
│   ├── Role.md              # One file per enum
│   └── PostStatus.md
└── relationships.md         # Relationship graph / cross-reference table
```

### Model Page Content

Each model page should include:

```markdown
# User

> Represents a registered user in the system.
> Users can have multiple posts and belong to organizations.

**Category:** Identity
**Since:** 1.0.0

## Fields

| Field   | Type     | Required | Default    | Attributes           | Description                       |
| ------- | -------- | -------- | ---------- | -------------------- | --------------------------------- |
| id      | String   | Yes      | `cuid()`   | `@id`                | Unique identifier, auto-generated |
| email   | String   | Yes      | —          | `@unique`, `@email`  | User's email address              |
| name    | String   | Yes      | —          | `@length(1..100)`    | Display name shown in the UI      |
| posts   | Post[]   | —        | —          | —                    | Posts authored by this user        |

## Relationships

| Field | Related Model | Type     | Relation       |
| ----- | ------------- | -------- | -------------- |
| posts | Post          | One→Many | Post.author    |

## Access Policies

| Operation | Rule                          | Effect |
| --------- | ----------------------------- | ------ |
| read      | `auth() != null`              | Allow  |
| create    | `auth() != null`              | Allow  |
| update    | `auth() == this`              | Allow  |
| delete    | `auth() == this`              | Deny   |

## Validation Rules

| Field | Rule              | Message             |
| ----- | ----------------- | ------------------- |
| email | `@email`          | Must be valid email |
| name  | `@length(1..100)` | 1–100 characters    |

## Indexes

| Name    | Fields        | Type   |
| ------- | ------------- | ------ |
| —       | `[email]`     | Unique |
```

---

## Configuration Options

All options are set as plugin fields in `schema.zmodel`:

```zmodel
plugin documentation {
    provider = '@zenstackhq/plugin-documentation'

    // Required
    output = './docs'

    // Optional — defaults shown
    title = 'Schema Documentation'
    includeRelationships = true
    includePolicies = true
    includeValidation = true
    includeIndexes = true
    includeInternalModels = false
    groupBy = 'none'
}
```

### Option Reference

| Option                  | Type      | Default                  | Description                                                                                                |
| ----------------------- | --------- | ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `output`                | `String`  | `'./docs'`               | Output directory for generated documentation                                                               |
| `title`                 | `String`  | `'Schema Documentation'` | Title used in the index page                                                                               |
| `includeRelationships`  | `Boolean` | `true`                   | Include the relationships section on each model page and the `relationships.md` cross-reference             |
| `includePolicies`       | `Boolean` | `true`                   | Include access policy tables (from `@@allow` / `@@deny`)                                                   |
| `includeValidation`     | `Boolean` | `true`                   | Include validation attribute tables (`@email`, `@length`, `@regex`, etc.)                                  |
| `includeIndexes`        | `Boolean` | `true`                   | Include index / unique constraint tables                                                                   |
| `includeInternalModels` | `Boolean` | `false`                  | Include models marked with `@@ignore` (excluded by default)                                                |
| `groupBy`               | `String`  | `'none'`                 | Group models into subdirectories. `'none'` = flat, `'category'` = use `@@meta('doc:category', '...')`      |

---

## Testing Strategy

### Unit Tests (vitest)

The plugin is a pure function from AST → markdown strings. This makes it highly testable without needing a database or runtime.

#### Test Categories

1. **AST fixture tests** — Parse a `.zmodel` string into an AST, run the generator, assert the output markdown structure and content.
2. **Option tests** — Verify each configuration option produces the expected behavior (e.g., `singleFile`, `groupBy`, `includePolicies`).
3. **Edge case tests** — Models with no fields, self-referential relations, models extending other models, mixins, views, enums with attributes.
4. **Snapshot tests** — For the full output of representative schemas. Catch unintended regressions in formatting.

#### Test Utilities

The CLI test infrastructure provides:

- `loadSchemaDocument(schemaContent)` — parse a ZModel string into a `Model` AST
- Temporary directory management for output verification
- The `@zenstackhq/vitest-config` base configuration

#### Example Test

```typescript
import { describe, expect, it } from 'vitest';
import { loadSchemaDocument } from '../../cli/test/utils'; // or equivalent
import plugin from '../src/index';

describe('documentation plugin', () => {
    it('generates model page with fields table', async () => {
        const model = await loadSchemaDocument(`
            /// A blog post.
            model Post {
                id      String @id @default(cuid())
                /// The post title.
                title   String
                content String?
            }
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        const postDoc = fs.readFileSync(path.join(tmpDir, 'models', 'Post.md'), 'utf-8');
        expect(postDoc).toContain('# Post');
        expect(postDoc).toContain('A blog post.');
        expect(postDoc).toContain('| title');
        expect(postDoc).toContain('The post title.');
    });
});
```

### Integration Tests

- Add the plugin to the monorepo's `pnpm-workspace.yaml`
- Verify it runs correctly as part of `zenstack generate` on a sample project
- Confirm the generated markdown renders correctly (optional: use a markdown linter)

---

## Implementation Plan

### Phase 1 — MVP

- [ ] Scaffold package (`package.json`, `tsup.config.ts`, `vitest.config.ts`, `tsconfig.json`)
- [ ] Implement `CliPlugin` entry point
- [ ] AST traversal: extract models, fields, enums, relationships
- [ ] Markdown rendering: index page, model pages, enum pages
- [ ] Support `output` option
- [ ] Unit tests for core generation
- [ ] Wire into monorepo build (`turbo.json`, `pnpm-workspace.yaml`)

### Phase 2 — Rich Content

- [ ] Extract and render access policies (`@@allow` / `@@deny`)
- [ ] Extract and render validation attributes
- [ ] Extract and render indexes / unique constraints
- [ ] Extract and render computed fields (with `Computed` badge and expression)
- [ ] Inline inherited fields with `Inherited from [Parent](...)` annotation
- [ ] Support `@@meta('doc:*')` annotations (category, since, deprecated, example)
- [ ] `groupBy = 'category'` support
- [ ] `relationships.md` cross-reference page with Mermaid ER diagram
- [ ] Alphabetical field sorting
- [ ] Snapshot tests for representative schemas

### Phase 3 — Polish

- [ ] `includeInternalModels` support
- [ ] CI integration example in README

---

## Resolved Decisions

1. **Mermaid diagrams** — Yes. The `relationships.md` page will include a Mermaid ER diagram alongside the cross-reference table. Most markdown renderers (GitHub, GitLab, Docusaurus, VitePress, Obsidian) support Mermaid natively.

2. **Frontmatter** — No. Not in scope for now. Can be revisited if there's demand for static site generator integration.

3. **Template customization** — No. Ship an opinionated default. Custom templates add significant maintenance burden for minimal early value.

4. **Field ordering** — Alphabetical. Produces stable, diff-friendly output across regeneration runs.

5. **Computed fields** — Documented. `@computed` fields are part of the query API surface. They will appear in the fields table with a "Computed" badge/annotation and their expression shown.

6. **Inherited fields** — Shown inline on the child model's page, annotated with `Inherited from [ParentModel](../models/ParentModel.md)`. This keeps each model page self-contained while preserving the lineage.

---

## Package Structure

```
packages/plugins/documentation/
├── RFC.md                    # This document
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
├── src/
│   ├── index.ts              # CliPlugin default export
│   ├── generator.ts          # Main orchestrator
│   ├── renderers/
│   │   ├── index-page.ts     # Renders index.md
│   │   ├── model-page.ts     # Renders individual model pages
│   │   ├── enum-page.ts      # Renders individual enum pages
│   │   └── relationships.ts  # Renders relationships.md
│   ├── extractors/
│   │   ├── model.ts          # Extract model metadata from AST
│   │   ├── field.ts          # Extract field metadata from AST
│   │   ├── enum.ts           # Extract enum metadata from AST
│   │   ├── relationship.ts   # Extract relationship graph from AST
│   │   └── policy.ts         # Extract access policies from AST
│   ├── types.ts              # Internal types (ModelDoc, FieldDoc, etc.)
│   └── utils.ts              # Shared helpers
└── test/
    ├── generator.test.ts     # End-to-end generation tests
    ├── extractors/
    │   ├── model.test.ts
    │   ├── field.test.ts
    │   └── relationship.test.ts
    ├── renderers/
    │   ├── model-page.test.ts
    │   └── enum-page.test.ts
    └── fixtures/
        ├── basic.zmodel      # Simple schema
        ├── policies.zmodel   # Schema with access policies
        └── complex.zmodel    # Schema with inheritance, mixins, computed fields
```

---

## References

- `packages/sdk/src/cli-plugin.ts` — `CliPlugin` and `CliGeneratorContext` interfaces
- `packages/cli/src/actions/generate.ts` — Plugin loading and execution
- `packages/plugins/policy/` — Reference implementation for plugin packaging
- `packages/language/res/stdlib.zmodel` — Built-in attributes (`@meta`, `@@meta`, etc.)
- `packages/language/src/generated/ast.ts` — Full AST type definitions
