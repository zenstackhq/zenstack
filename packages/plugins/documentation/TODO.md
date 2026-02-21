# Documentation Plugin — Implementation Checklist

## Phase 1 — MVP

### Scaffolding
- [ ] `package.json` (name, exports, dependencies on `@zenstackhq/language`, `@zenstackhq/sdk`)
- [ ] `tsconfig.json`
- [ ] `tsup.config.ts` (dual CJS/ESM, dts)
- [ ] `vitest.config.ts` (extend `@zenstackhq/vitest-config`)
- [ ] Add to `pnpm-workspace.yaml`
- [ ] Add to `turbo.json` build pipeline

### Plugin Entry Point
- [ ] `src/index.ts` — default export `CliPlugin` with `name`, `statusText`, `generate()`
- [ ] Parse and validate `pluginOptions` (`output`, `title`)
- [ ] Resolve output directory, create if missing

### Types
- [ ] `src/types.ts` — `ModelDoc`, `FieldDoc`, `EnumDoc`, `EnumValueDoc`, `RelationshipDoc`

### Extractors
- [ ] `src/extractors/model.ts` — extract name, `///` comments, `@@meta` values from `DataModel`
- [ ] `src/extractors/field.ts` — extract name, type, optionality, default, `///` comments, `@meta` values, attributes from `DataField`
- [ ] `src/extractors/enum.ts` — extract name, `///` comments, values from `Enum` / `EnumField`
- [ ] `src/extractors/relationship.ts` — extract relation fields, related model, cardinality, inverse field

### Renderers
- [ ] `src/renderers/index-page.ts` — title, model list (alpha-sorted, linked), enum list (alpha-sorted, linked)
- [ ] `src/renderers/model-page.ts` — heading, description, fields table (alpha-sorted), relationships table
- [ ] `src/renderers/enum-page.ts` — heading, description, values table

### Generator
- [ ] `src/generator.ts` — orchestrate: extract all models/enums → render index + per-model + per-enum pages → write files

### Tests
- [ ] `test/extractors/model.test.ts` — model name, comments, meta extraction
- [ ] `test/extractors/field.test.ts` — field name, type, optionality, default, comments, attributes
- [ ] `test/extractors/enum.test.ts` — enum name, values, comments
- [ ] `test/extractors/relationship.test.ts` — one-to-one, one-to-many, many-to-many, self-referential
- [ ] `test/renderers/model-page.test.ts` — fields table output, relationships section, alphabetical order
- [ ] `test/renderers/enum-page.test.ts` — values table output
- [ ] `test/generator.test.ts` — end-to-end: schema in → file tree out, correct file names and structure

---

## Phase 2 — Rich Content

### Extractors
- [ ] `src/extractors/policy.ts` — extract `@@allow` / `@@deny` rules (operation, condition expression, effect)
- [ ] `src/extractors/validation.ts` — extract validation attributes (`@email`, `@length`, `@regex`, `@gt`, `@gte`, `@lt`, `@lte`, `@url`, `@datetime`, `@startsWith`, `@endsWith`, `@contains`)
- [ ] `src/extractors/index.ts` — extract `@@index`, `@@unique`, `@@id` (composite) constraints
- [ ] `src/extractors/field.ts` — detect `@computed` fields, extract expression
- [ ] `src/extractors/field.ts` — detect inherited fields, track source model

### Renderers
- [ ] `src/renderers/model-page.ts` — access policies table section
- [ ] `src/renderers/model-page.ts` — validation rules table section
- [ ] `src/renderers/model-page.ts` — indexes table section
- [ ] `src/renderers/model-page.ts` — `Computed` badge on computed fields
- [ ] `src/renderers/model-page.ts` — `Inherited from [Parent](...)` annotation on inherited fields
- [ ] `src/renderers/model-page.ts` — render `@@meta('doc:category')`, `doc:since`, `doc:deprecated`, `doc:example` metadata
- [ ] `src/renderers/relationships.ts` — cross-reference table + Mermaid ER diagram

### Configuration
- [ ] `includeRelationships` option (default `true`)
- [ ] `includePolicies` option (default `true`)
- [ ] `includeValidation` option (default `true`)
- [ ] `includeIndexes` option (default `true`)
- [ ] `groupBy` option (`'none'` | `'category'`) — subdirectory grouping via `@@meta('doc:category')`

### Tests
- [ ] `test/extractors/policy.test.ts` — allow/deny rules, multiple operations, complex conditions
- [ ] `test/extractors/validation.test.ts` — each validation attribute type
- [ ] `test/extractors/index.test.ts` — single, composite, unique indexes
- [ ] `test/renderers/model-page.test.ts` — policies section, validation section, indexes section
- [ ] `test/renderers/model-page.test.ts` — computed field badge, inherited field annotation
- [ ] `test/renderers/relationships.test.ts` — Mermaid diagram output correctness
- [ ] `test/generator.test.ts` — `groupBy = 'category'` produces correct subdirectory structure
- [ ] `test/generator.test.ts` — `include*` flags omit corresponding sections
- [ ] Snapshot tests for representative schemas (basic, policies, inheritance/mixins)

---

## Phase 3 — Polish

- [ ] `includeInternalModels` option — include `@@ignore`-marked models
- [ ] Edge cases: models with no fields, enums with no values, views, self-referential relations
- [ ] CI integration example in README
