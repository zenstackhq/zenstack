# Contributing to @zenstackhq/plugin-documentation

This guide covers how the plugin works internally, how the codebase is organized, and how to extend or modify it.

## Architecture

### Data flow

The plugin is a pure function: **ZModel AST in, Markdown files out**.

```text
schema.zmodel
      │
      ▼
┌─────────────┐
│  ZenStack   │   `zenstack generate` invokes the CliPlugin interface
│    CLI      │
└──────┬──────┘
       │  context.model (full AST)
       ▼
┌─────────────┐
│  generator  │   Walks the AST, dispatches to per-entity renderers
└──────┬──────┘
       │
  ┌────┼────┬──────────┬──────────┬──────────┐
  ▼    ▼    ▼          ▼          ▼          ▼
index model enum     type      view    procedure
 page  page  page     page      page     page
  │    │    │          │          │          │
  └────┴────┴──────────┴──────────┴──────────┘
       │
       ▼
   output directory (Markdown files)
```

There are no runtime dependencies beyond `@zenstackhq/language` (AST types) and `@zenstackhq/sdk` (the `CliPlugin` interface). No template engines, no Markdown libraries, no network calls.

### Plugin entry point

`src/index.ts` exports a `CliPlugin` object. The CLI calls `plugin.generate(context)` during `zenstack generate`.

```typescript
const plugin: CliPlugin = {
    name: 'Documentation Generator',
    statusText: 'Generating documentation',
    generate,
};
```

The `generate` function lives in `src/generator.ts`. It is the orchestrator:

1. Resolves the output directory from `pluginOptions.output`
2. Resolves render options (`includeRelationships`, `fieldOrder`, etc.)
3. Filters AST declarations into models, views, types, enums, and procedures
4. Creates output subdirectories (`models/`, `enums/`, etc.)
5. Calls the appropriate renderer for each entity, writes the returned string to disk
6. Renders the index page last (it needs generation stats like file count and duration)

### Source layout

```text
src/
├── index.ts              # CliPlugin default export
├── generator.ts          # Orchestrator — walks AST, writes files
├── types.ts              # Shared interfaces (RenderOptions, DocMeta, Relationship, etc.)
├── extractors.ts         # AST data extraction utilities
└── renderers/
    ├── common.ts         # Shared rendering: headers, breadcrumbs, sections, navigation
    ├── index-page.ts     # Renders index.md
    ├── model-page.ts     # Renders models/<Name>.md
    ├── view-page.ts      # Renders views/<Name>.md
    ├── enum-page.ts      # Renders enums/<Name>.md
    ├── type-page.ts      # Renders types/<Name>.md
    ├── procedure-page.ts # Renders procedures/<Name>.md
    ├── relationships-page.ts  # Renders relationships.md
    └── skill-page.ts     # Renders SKILL.md (LLM-optimized reference)
```

### Key interfaces

**`RenderOptions`** — Passed to every renderer. Controls which sections to include and field ordering:

```typescript
interface RenderOptions {
    includeRelationships: boolean;
    includePolicies: boolean;
    includeValidation: boolean;
    includeIndexes: boolean;
    fieldOrder: 'declaration' | 'alphabetical';
    schemaDir?: string;
    genCtx?: GenerationContext;
}
```

**`GenerationContext`** — Metadata about the generation run (schema file name, date, duration, file count):

```typescript
interface GenerationContext {
    schemaFile: string;
    generatedAt: string;
    durationMs?: number;
    filesGenerated?: number;
}
```

**`DocMeta`** — Extracted `@@meta('doc:*')` annotations:

```typescript
interface DocMeta {
    category?: string;
    since?: string;
    deprecated?: string;
}
```

## How renderers work

Every renderer follows the same pattern:

1. Accept the AST node(s) and `RenderOptions`
2. Build an array of strings (`string[]`), where each element is one line
3. Join with `'\n'` and return the full page content

```typescript
export function renderModelPage(
    model: DataModel,
    options: RenderOptions,
    procedures: Procedure[],
    nav: Navigation | undefined,
): string {
    const lines: string[] = [];
    lines.push(...generatedHeader(options.genCtx));
    lines.push(...breadcrumbs('Models', model.name, '../'));
    // ... build sections ...
    return lines.join('\n');
}
```

**Why arrays instead of string concatenation?** Pushing to an array and joining at the end is the most efficient pattern for iterative string construction in Node.js. It avoids creating intermediate string objects on every append. This was validated with benchmarks during development.

### Adding a new section to an existing page

1. Write a failing test in the appropriate `test/generator/*.test.ts` file
2. Add the section rendering logic to the renderer in `src/renderers/`
3. If the section needs AST data extraction, add a helper in `src/extractors.ts`
4. If the section should be toggleable, add a boolean to `RenderOptions` and `resolveRenderOptions()`
5. Run tests, verify the new section appears, update snapshots

### Adding a new entity type

1. Create a new renderer in `src/renderers/<entity>-page.ts`
2. Add it to `src/generator.ts` — filter the declarations, create the subdirectory, call the renderer
3. Add the entity to `renderIndexPage` so it appears on the index
4. Create a new test file `test/generator/<entity>-page.test.ts`
5. Add integration coverage in the relevant `test/integration/*.test.ts` files

## Extractors

`src/extractors.ts` contains pure functions for pulling data out of the ZModel AST. These are decoupled from rendering so they can be tested independently if needed, and so renderers stay focused on output formatting.

Key extractors:

| Function | Purpose |
|---|---|
| `stripCommentPrefix` | Strips `///` from AST comment strings |
| `getFieldTypeName` | Resolves a field's type to a display string, optionally with Markdown links |
| `getDefaultValue` | Extracts the `@default(...)` value |
| `getFieldAttributes` | Formats non-default, non-computed, non-meta attributes |
| `extractDocMeta` | Pulls `@@meta('doc:*')` annotations into a `DocMeta` object |
| `extractFieldDocExample` | Extracts `@meta('doc:example', '...')` values |
| `collectRelationships` | Builds a flat list of relationships from all models |
| `isIgnoredModel` | Checks for `@@ignore` attribute |
| `getSourceFilePath` | Resolves the `.zmodel` file a node was defined in (via CST) |
| `getRelativeSourcePath` | Makes the source path relative to the schema directory |
| `extractProcedureComments` | Extracts comments from procedure CST (procedures store comments differently) |

## Common rendering helpers

`src/renderers/common.ts` provides shared utilities used across all renderers:

| Function | Purpose |
|---|---|
| `generatedHeader` | The `> [!CAUTION]` auto-generated banner |
| `breadcrumbs` | `Index / EntityType / Name` navigation |
| `sectionHeading` | Consistent `## Emoji SectionName` with `<a id="...">` anchor |
| `navigationFooter` | Prev/next links between entities |
| `referencesSection` | "See also" link to ZenStack docs |
| `declarationBlock` | Collapsible `<details>` with raw ZModel source |
| `renderDescription` | `///` comments formatted as blockquotes |
| `renderMetadata` | Category, since, deprecated, source path as inline metadata |
| `buildNavList` | Builds prev/next navigation from a sorted list of entity names |

## Design decisions

### No runtime dependencies

The plugin depends only on `@zenstackhq/language` and `@zenstackhq/sdk`. No template engines (Handlebars, EJS, etc.) and no Markdown rendering libraries. This keeps the dependency surface minimal and avoids version conflicts in the monorepo.

### Explicit HTML anchors

Section headings and field rows include `<a id="...">` anchors for deep-linking. We can't rely on Markdown renderers to generate consistent heading IDs because some renderers strip emojis, some slugify differently, and some don't generate IDs at all. Explicit anchors guarantee that cross-links work everywhere.

### Deterministic output

- Entities of each type are sorted alphabetically
- Field order defaults to declaration order but can be set to alphabetical
- Timestamps use date-only (`YYYY-MM-DD`) format, no time component

This keeps diffs clean when docs are committed to version control.

### String arrays over template engines

The array-push-join pattern was chosen over template engines for three reasons:

1. **Performance** — No parsing overhead, no template compilation
2. **Type safety** — Template engines typically work with string interpolation, losing TypeScript's help
3. **Conditional sections** — Sections that should be omitted when empty are trivially handled by not pushing any lines, rather than needing template `if` blocks

## Testing

### Test organization

Tests are split by feature area, mirroring the renderer structure:

```text
test/
├── utils.ts                     # Shared helpers
├── generator/                   # Unit tests by page type
│   ├── common.test.ts           # Cross-page features (15 tests)
│   ├── index-page.test.ts       # Index page (19 tests)
│   ├── model-page.test.ts       # Model page (47 tests)
│   ├── enum-page.test.ts        # Enum page (9 tests)
│   ├── type-view-page.test.ts   # Type + View pages (14 tests)
│   ├── procedure-page.test.ts   # Procedure page (13 tests)
│   ├── skill-page.test.ts      # SKILL.md generation (30 tests)
│   └── snapshot.test.ts         # Full schema snapshot (1 test)
└── integration/                 # Tests against real schemas
    ├── samples.test.ts          # Sample project schemas (4 tests)
    ├── showcase.test.ts         # Comprehensive showcase schema (23 tests)
    ├── e2e-schemas.test.ts      # E2E test schemas (6 tests)
    └── multifile.test.ts        # Multi-file import schemas (3 tests)
```

### Test approach

Tests call the public `generate()` function through `generateFromSchema()` or `generateFromFile()` helpers, then assert on the generated Markdown output. This is intentional — it tests the full pipeline (AST loading → extraction → rendering → file writing) rather than internal functions.

```typescript
it('renders fields table with types and descriptions', async () => {
    const tmpDir = await generateFromSchema(`
        model User {
            id    String @id @default(cuid())
            /// User's email address.
            email String @unique
        }
    `);
    const doc = readDoc(tmpDir, 'models', 'User.md');
    expect(doc).toContain('| `id`');
    expect(doc).toContain("User's email address");
});
```

### Test utilities

`test/utils.ts` provides:

| Export | Purpose |
|---|---|
| `generateFromSchema(schema, options?)` | Parse inline ZModel, generate docs to a temp directory, return the path |
| `generateFromFile(schemaFile, options?)` | Generate docs from a `.zmodel` file |
| `readDoc(tmpDir, ...segments)` | Read a generated doc file |
| `findFieldLine(doc, fieldName)` | Find the table row for a specific field (matches `field-<name>` anchor) |
| `findBrokenLinks(outputDir)` | Walk all generated `.md` files, verify all relative links resolve to existing files |

### Snapshot tests

`snapshot.test.ts` captures the full output for a representative schema. It uses a `stabilize()` function to redact dynamic content before comparison:

- Temporary file paths (contain random UUIDs)
- Generation duration (varies per run)
- Generation date (varies per day)

Update snapshots with:

```bash
pnpm test -- --update
```

### Link integrity tests

Many tests use `findBrokenLinks()` to verify that every internal link in the generated docs resolves to an existing file. This catches cross-linking regressions. Integration tests always include a broken-link check.

### Running tests

```bash
# Run all tests
pnpm test

# Run a specific test file
pnpm test -- test/generator/model-page.test.ts

# Run tests matching a pattern
pnpm test -- -t "renders fields table"

# Update snapshots
pnpm test -- --update
```

## Development workflow

### Prerequisites

From the repository root:

```bash
pnpm install
pnpm build
```

The plugin package is at `packages/plugins/documentation/`.

### Build

```bash
# Build this package only (run from packages/plugins/documentation/)
pnpm build

# Build from repo root (builds all packages via Turbo)
cd /path/to/zenstack && pnpm build
```

The build uses `tsup-node` for bundling and `tsc --noEmit` for type checking.

### Test-driven development

This plugin was built with strict TDD. When adding features:

1. Write a failing test (RED)
2. Implement the minimum code to make it pass (GREEN)
3. Refactor if needed
4. Commit

### Linting

```bash
pnpm lint
```

Uses the shared `@zenstackhq/eslint-config`.

### Preview output

To visually inspect what the plugin generates, point the output at a local directory:

```bash
# In any project with a schema.zmodel:
plugin documentation {
    provider = '../path/to/packages/plugins/documentation'
    output   = './preview-output'
}
npx zenstack generate
```

Then browse the generated Markdown files or render them with your preferred viewer.

## Frequently touched files

When making changes, these are the files you'll most commonly modify:

| Change type | Files |
|---|---|
| New section on model pages | `src/renderers/model-page.ts`, `test/generator/model-page.test.ts` |
| New index page content | `src/renderers/index-page.ts`, `test/generator/index-page.test.ts` |
| New AST extraction logic | `src/extractors.ts` |
| New configuration option | `src/types.ts`, `src/extractors.ts` (`resolveRenderOptions`), `src/generator.ts` |
| Cross-page rendering changes | `src/renderers/common.ts`, `test/generator/common.test.ts` |
| New entity type | `src/generator.ts`, new renderer, new test file |
