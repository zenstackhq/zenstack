# Agent Implementation Guide — Documentation Plugin

You are implementing a ZenStack CLI plugin that generates markdown documentation from ZModel schemas. Follow TDD (red-green-refactor) strictly. Read `RFC.md` and `TODO.md` in this directory for the full specification.

---

## Skill

Use the TDD skill at `/.agents/skills/tdd/SKILL.md`. One test at a time. RED → GREEN → next test. Never write all tests first.

---

## Context: What You're Building

A CLI plugin (`CliPlugin` from `@zenstackhq/sdk`) that:
- Receives the ZModel AST via `context.model`
- Extracts models, fields, enums, relationships from the AST
- Renders multi-file markdown documentation
- Writes files to the `output` directory

Zero runtime dependencies. Pure function: AST in → markdown files out.

---

## Reference Files (Read These First)

| File | Why |
|------|-----|
| `packages/sdk/src/cli-plugin.ts` | `CliPlugin` and `CliGeneratorContext` interfaces |
| `packages/plugins/policy/package.json` | Package structure reference (exports, deps, build) |
| `packages/plugins/policy/tsup.config.ts` | Build config to copy |
| `packages/plugins/policy/vitest.config.ts` | Test config to copy |
| `packages/language/src/generated/ast.ts` | Full AST types (`DataModel`, `DataField`, `Enum`, etc.) |
| `packages/language/res/stdlib.zmodel` | Built-in attributes (`@meta`, `@@meta`, `@id`, `@default`, etc.) |
| `packages/cli/src/actions/generate.ts` | How plugins are loaded and invoked |

---

## Phase 1 — MVP (Implement This First)

Work through these tracer bullets in order. Each bullet is one RED→GREEN cycle.

### Step 0: Scaffold

Before any tests, set up the package boilerplate. Copy structure from `packages/plugins/policy/`:

1. `package.json` — name: `@zenstackhq/plugin-documentation`, deps: `@zenstackhq/language` (workspace), `@zenstackhq/sdk` (workspace). Same `exports`, `type`, `scripts`, `devDependencies` pattern as policy plugin. No runtime deps on `@zenstackhq/orm` or `kysely`.
2. `tsconfig.json` — extend from `@zenstackhq/typescript-config`
3. `tsup.config.ts` — identical to policy plugin
4. `vitest.config.ts` — identical to policy plugin
5. `src/index.ts` — skeleton `CliPlugin` default export (empty `generate`)
6. Run `pnpm install` from repo root to link workspace deps

Verify: `pnpm build` succeeds for this package.

### Step 1: Tracer Bullet — Plugin Produces an Index File

**Test**: Call `plugin.generate()` with a minimal AST containing one model. Assert `index.md` exists in the output directory.

**Impl**: In `generate()`, resolve the output directory from `pluginOptions.output` (fall back to `defaultOutputPath`), create it, write an empty `index.md`.

This proves the plugin contract works end-to-end.

### Step 2: Index Page Lists Models

**Test**: AST with two models (`User`, `Post`). Assert `index.md` contains both model names, alpha-sorted, as markdown links to `./models/User.md` and `./models/Post.md`.

**Impl**: Traverse `model.declarations`, filter `isDataModel`, sort by name, render index page.

### Step 3: Index Page Lists Enums

**Test**: AST with one enum (`Role`). Assert `index.md` contains the enum name, linked to `./enums/Role.md`.

**Impl**: Filter `isEnum`, sort, append to index page.

### Step 4: Model Page — Heading and Description

**Test**: Model with `///` comments. Assert `models/User.md` exists, contains `# User` heading and the comment text as a blockquote.

**Impl**: Create `models/` dir, iterate models, write per-model file. Extract `node.comments`, strip `///` prefix.

### Step 5: Model Page — Fields Table

**Test**: Model with 3 fields (id, email, name). Assert `models/User.md` contains a markdown table with columns: Field, Type, Required, Default, Attributes, Description. Fields sorted alphabetically.

**Impl**: Extract fields from `DataModel.fields`. For each field, extract:
- `field.name`
- `field.type` (resolve type reference name, array `[]` suffix, optional `?`)
- Required = `!field.type.optional && !field.type.array`
- Default = find `@default` attribute, extract argument
- Attributes = all non-`@default` attributes, formatted
- Description = `field.comments` stripped

### Step 6: Model Page — Relationships Section

**Test**: Two models with a relation (`User` has `posts: Post[]`, `Post` has `author: User`). Assert `models/User.md` contains a Relationships table with: Field, Related Model (linked), Type (One→Many), Relation.

**Impl**: Identify fields whose type references another `DataModel`. Determine cardinality from array/optional markers. Find the `@relation` attribute if present.

### Step 7: Enum Page

**Test**: Enum with 3 values and `///` comments. Assert `enums/Role.md` exists with heading, description, and values table.

**Impl**: Create `enums/` dir, iterate enums, write per-enum file with name, comments, and value list.

### Step 8: Title Option

**Test**: Pass `pluginOptions.title = 'My API'`. Assert `index.md` heading is `# My API` instead of the default.

**Impl**: Read `pluginOptions.title`, default to `'Schema Documentation'`.

### Step 9: End-to-End File Structure

**Test**: Schema with 2 models and 1 enum. Assert the full directory tree: `index.md`, `models/User.md`, `models/Post.md`, `enums/Role.md`.

**Impl**: Should already work if prior steps are correct. This is a sanity check.

---

## Phase 2 — Rich Content

Only start Phase 2 after all Phase 1 tests pass.

### Step 10: Access Policies

**Test**: Model with `@@allow('read', auth() != null)` and `@@deny('delete', true)`. Assert model page contains an Access Policies table with Operation, Rule, Effect columns.

**Impl**: Extract `@@allow` / `@@deny` attributes. Parse first arg as operation string, second as condition expression (stringify the AST expression). Effect = attribute name.

### Step 11: Validation Rules

**Test**: Model with `@email`, `@length(min: 1, max: 100)`. Assert model page contains a Validation Rules table.

**Impl**: Identify validation attributes (those with `@@@validation` internal attribute in stdlib). Extract field name, attribute name, and arguments.

### Step 12: Indexes

**Test**: Model with `@@index([email, name])` and `@@unique([email])`. Assert model page contains an Indexes table.

**Impl**: Extract `@@index`, `@@unique`, composite `@@id` attributes. Parse field list argument.

### Step 13: Computed Fields

**Test**: Model with a `@computed` field. Assert field appears in table with a `Computed` badge.

**Impl**: Detect `@computed` attribute on field, add badge to output.

### Step 14: Inherited Fields

**Test**: `BaseModel` with `id` field, `User extends BaseModel` with `email` field. Assert `User.md` shows both fields, with `id` annotated `Inherited from [BaseModel](./BaseModel.md)`.

**Impl**: Use `getAllFields(model)` to include inherited fields. Check `$inheritedFrom` on each field.

### Step 15: `@@meta('doc:*')` Annotations

**Test**: Model with `@@meta('doc:category', 'Identity')`, `@@meta('doc:since', '2.0')`, `@@meta('doc:deprecated', 'Use Account')`. Assert model page shows Category, Since, and a deprecation notice.

**Impl**: Extract `@@meta` attributes, filter for `doc:` prefix keys, render as metadata block.

### Step 16: `groupBy = 'category'`

**Test**: Two models with different `@@meta('doc:category', ...)` values. Pass `groupBy = 'category'`. Assert models are in subdirectories: `models/Identity/User.md`, `models/Content/Post.md`.

**Impl**: Group models by their `doc:category` meta value. Fall back to flat structure for models without a category.

### Step 17: `relationships.md` with Mermaid

**Test**: Schema with 3 models and relations. Assert `relationships.md` exists with a cross-reference table and a Mermaid `erDiagram` code block.

**Impl**: Collect all relationships across all models. Render a summary table and a Mermaid ER diagram string.

### Step 18: `include*` Flags

**Test**: Pass `includePolicies = false`. Assert model page does NOT contain an Access Policies section. Repeat for `includeRelationships`, `includeValidation`, `includeIndexes`.

**Impl**: Check boolean flags before rendering each section.

### Step 19: Snapshot Tests

**Test**: Full representative schema. Snapshot the entire output directory content.

**Impl**: No new code — this locks down the output format.

---

## AST Cheat Sheet

```typescript
import { isDataModel, isEnum, type DataModel, type DataField, type Enum } from '@zenstackhq/language/ast';
import { getAllFields } from '@zenstackhq/language/utils';

// Iterate declarations
for (const decl of model.declarations) {
    if (isDataModel(decl)) { /* decl is DataModel */ }
    if (isEnum(decl))      { /* decl is Enum */ }
}

// DataModel properties
decl.name         // string
decl.comments     // string[] — triple-slash comments with `///` prefix
decl.fields       // DataField[]
decl.attributes   // DataModelAttribute[] — model-level attributes (@@allow, @@meta, etc.)
decl.isView       // boolean
decl.baseModel    // Reference<DataModel> | undefined

// DataField properties
field.name        // string
field.comments    // string[] — triple-slash comments with `///` prefix
field.type.type   // string | undefined — built-in type name ('String', 'Int', etc.)
field.type.reference // Reference<DataModel | Enum> | undefined — reference to another model/enum
field.type.array  // boolean
field.type.optional // boolean
field.attributes  // DataFieldAttribute[] — field-level attributes (@id, @default, @meta, etc.)

// Attribute properties
attr.decl         // Reference<Attribute> — the attribute declaration
attr.args         // AttributeArg[] — the arguments
arg.name          // string | undefined — named arg
arg.value         // Expression — the value expression

// Enum properties
enumDecl.name     // string
enumDecl.comments // string[]
enumDecl.fields   // EnumField[]
enumField.name    // string
enumField.comments // string[]

// Comments: strip the `///` prefix
const description = node.comments
    .map(c => c.replace(/^\/\/\/\s?/, ''))
    .join('\n');
```

---

## Rules

1. **TypeScript only.** No `any` types. Write type guards if you need to narrow.
2. **One test → one implementation.** Follow the TDD skill strictly.
3. **Tests verify behavior through the public `generate()` interface.** Don't test internal functions directly — call `generate()` and assert on the output files.
4. **Alphabetical field sorting** in all tables.
5. **No `plugin.zmodel`** — only `///` comments and `@meta`/`@@meta`.
6. **vitest** for all tests. Use `@zenstackhq/vitest-config` base config.
7. **Check `packages/cli/test/` for test utilities** to parse ZModel strings into AST before writing your own.
