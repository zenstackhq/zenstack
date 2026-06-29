# Design Proposal: Version-Aware Shape Annotations

- **Status:** Draft / RFC
- **Scope:** ZenStack core (ZModel language + schema metadata + server API handlers)
- **Goal:** First-class, declarative, **framework-agnostic** control over the API wire shape per API version — omit fields, rename/alias fields, expose computed/dynamic fields, and version the resource type name — without forking the schema or hand-writing per-version transforms in each adapter.

[[_TOC_]]

## 1. Problem

ZenStack derives the API wire shape directly from a single `.zmodel`. For the REST (JSON:API) handler, the resource `type` is the model name and the `attributes` are the schema fields 1:1; the RPC handler is the same story. There is **no** field rename, omit-per-context, alias, or per-version hook in the handler today:

- `packages/server/src/api/rest/index.ts` — `buildSerializers()` builds one serializer per model from `schema.models`; `projection` only strips *relation* fields; `type` comes from the raw model name; `modelNameMapping` rewrites only the URL segment, not the wire `type`.
- The only field-shaping primitive that exists is `@omit` (`packages/language/res/stdlib.zmodel`), which is unconditional and lives at the ORM layer (`FieldDef.omit` → result stripping in `packages/orm/src/client/client-impl.ts`).

Consequence: you cannot evolve the shape for `v2` while keeping `v1` stable. The only escape hatches today are (a) fork the schema (duplicates access policy / migrations / auth wiring — unacceptable), or (b) hand-write a transform layer in every server adapter (not declarative, not reusable, easy to drift). This proposal makes shape-versioning a property of the **schema**, evaluated by **core**, so every adapter inherits it.

### Design tenets

1. **The `.zmodel` always describes the *latest* shape.** Older versions are *reconstructed* by annotations describing how they differ. You annotate only what changed, never every field.
2. **Versioning is an API-presentation concern, not an ORM concern.** The ORM client keeps returning the canonical (latest) row shape. Shaping happens at the API boundary (the server handlers). The ORM is never made "version-aware." (`@omit` for *security* stays where it is; version-omit is a different axis.)
3. **Framework-agnostic.** Core owns the version *axis* and the shaping *logic* (pure function of schema + active version + data). Resolving *which* version is active from a concrete request (URL segment, header, media-type parameter) is the adapter's job — core never assumes a transport.
4. **Reuse existing primitives.** `@omit` is the mechanism template (attribute → compiled `FieldDef` flag → applied at a known choke point); `@computed` already gives runtime-evaluated field values; `@map`/`modelNameMapping` is the rename precedent. The feature should look and feel like these, not like a new subsystem.

## 2. Declaring the version axis

Core needs an **ordered, closed set** of API versions so that range checks (`since`/`until`) validate and ordering is well-defined. Declare it once at schema scope:

```zmodel
// zmodel
api {
  versions = ['v1', 'v2', 'v3']   // ordered oldest → newest
}
```

This compiles into `SchemaDef` (e.g. `schema.api = { versions }`). It is the source of truth for: validating annotation arguments at compile time, ordering ranges, and letting an adapter enumerate the versions it may serve. Versions are opaque string identifiers — core only relies on their declared order, not on any `vN` numbering convention, so a project could use `'2024-01'` date-versions instead.

**The canonical version is always the newest declared version** — the last element of `versions` (here `v3`). This is forced by design tenet 1 (the `.zmodel` *is* the latest shape), so it is *derived*, never declared: there is no separate `default` field. An adapter that resolves no version (§5) falls back to this canonical version, so unversioned adapters keep working unchanged.

### 2.1 Version granularity: majors only (not minors)

The version axis should enumerate **breaking boundaries only** — what most schemes call *major* versions (`v1`, `v2`, or opaque `'2024-01'` cuts). It does **not** need a minor/patch axis, because of the design's own asymmetry:

- **Additive changes need no version at all.** A new field carries `@api.since('v2')` and is simply absent from older versions; adding it requires no new axis entry, since older versions are derived by *omission*. So the "additive minor release" that schemes like Stripe model with monthly versions is, here, a no-op on the axis — the canonical schema just grows.
- **Only breaking changes need a boundary**, and a breaking change is exactly what warrants a new major. A field rename, removal, type change, or `type`-name change is annotated relative to the major at which it took effect (`before: 'v2'`, `until: 'v3'`).

So a flat list of majors is sufficient and keeps `since`/`until`/`before` ordering unambiguous. A two-level major.minor scheme would add ordering complexity (range checks across two axes) for no expressive gain, since additive minors are already free. Versions remain **opaque ordered strings**, so a project that *wants* date-versions (`'2024-01'`, `'2024-06'`) can still use them — the axis simply shouldn't be read as carrying additive-vs-breaking semantics. (Deferred; open question §10.7.)

## 3. The annotation surface — three style options

This is the primary design decision. All three compile to the same metadata (§4) and are applied at the same choke points (§5); they differ in ergonomics.

### Style A — granular lifecycle attributes (recommended)

One attribute per concern, mirroring how `@omit`/`@map`/`@computed` already read:

```zmodel
attribute @api.since(_ version: String)                      // field appears from this version onward
attribute @api.until(_ version: String)                      // field disappears at this version (exclusive)
attribute @api.renamedFrom(_ name: String, before: String)   // exposed under `name` for versions < `before`
attribute @api.coerce(_ fn: String, in: String[])            // value transform fn (registered hook) for listed versions
attribute @@api.typeName(_ name: String, in: String[])       // model-level: resource `type` alias for listed versions
```

Examples — each maps to one real evolution:

```zmodel
model Project {
  id            Int     @id
  // Added in v2 → absent from v1 responses:
  riskScore     Float?  @api.since('v2')
  // Renamed v1 `title` → v2 `name`; schema holds the new name, v1 still sees `title`:
  name          String  @api.renamedFrom('title', before: 'v2')
  // Existed v1–v2, dropped in v3; stays in the schema until v2 is retired:
  legacyCode    String? @api.until('v3')
  // Split: v1 exposed a computed `fullName`; v2 has structured fields.
  fullName      String? @computed @api.until('v2')
  firstName     String? @api.since('v2')
  lastName      String? @api.since('v2')

  @@api.typeName('procurement_project', in: ['v1'])  // v1 called the type something else
}
```

- **Pros:** reads like existing stdlib attributes; each annotation is local to the field it concerns; trivially greppable; partial adoption (annotate only what changed). Plays directly into the `@omit`/`@computed` precedents.
- **Cons:** a field with several version concerns accumulates several attributes; the "which fields exist in version X" view is implicit (derived, not written in one place).

### Style B — one structured attribute

```zmodel
name String @api(since: 'v2', renamedFrom: { name: 'title', before: 'v2' })
```

- **Pros:** one attribute per field; all of a field's version rules in one place.
- **Cons:** structured/nested attribute args stretch the ZModel attribute grammar (`AttributeParam` types are currently scalar/enum/field-ref — see `zmodel.langium` L243-270); nested object args would need grammar work. Less consistent with the flat stdlib style.

### Style C — version "views" (profiles) at model/schema scope

Declare named per-version projections that select/rename fields, GraphQL-view style:

```zmodel
view ProjectV1 of Project for 'v1' {
  rename name -> title
  omit   riskScore
  expose fullName            // a @computed field
  typeName 'procurement_project'
}
```

- **Pros:** the *whole* shape of a version is written in one readable block — best when versions diverge heavily; explicit, not derived.
- **Cons:** new top-level grammar construct (largest language change); duplicates field references (drift risk between view and model); overkill when most changes are a field here and there. Best reserved as an *optional* layer on top of Style A for big-bang version cuts.

**Recommendation:** ship **Style A** as the core mechanism (smallest grammar delta, best fit with `@omit`/`@computed`). Consider **Style C** later as sugar for large divergences; it can compile down to the same metadata. Avoid **Style B** unless nested attribute args are wanted for other features too.

## 4. Where the metadata lives

Following the `@omit` pipeline (`@omit` → `FieldDef.omit: boolean` via `packages/sdk/src/ts-schema-generator.ts` → consumed downstream):

**Recommended — typed fields on `FieldDef` / `ModelDef`** (`packages/schema/src/schema.ts`). Add an optional, well-typed `api` sub-object so consumers don't re-parse raw attribute expressions at runtime:

```ts
// FieldDef
api?: {
  since?: string;
  until?: string;                                  // exclusive
  renamedFrom?: { name: string; before: string };
  coerce?: { fn: string; in: string[] };           // `fn` names a registered, BIDIRECTIONAL transform
};
// ModelDef
api?: { typeName?: { name: string; in: string[] } };
```

**`coerce` direction.** The canonical value is the *latest* version's type; `coerce` maps **canonical → wire** when serializing a version listed in `in`, and **wire → canonical** when accepting a write for that version. A single `fn` name therefore resolves to a *pair* in the registry — `{ encode, decode }` — not one function (a lone function cannot be auto-inverted). On read only `encode` runs; on write only `decode`. A coercion with no `decode` makes the field read-only for the versions it covers (a validation error on write), which is the correct default for irreversible transforms.

Alternatives considered:
- **Separate `SchemaDef.apiVersioning` map** keyed `[model][field]`. Pro: zero churn to `FieldDef`; clean separation. Con: a second structure to keep in sync; consumers must cross-reference. Reasonable if `FieldDef` churn is a concern.
- **Parse raw `attributes[]` at runtime** (the metadata already carries `AttributeApplication[]`). Pro: no schema-type change at all. Con: every handler re-parses expressions on a hot path; no compile-time validation surface. Use only as a stop-gap.

The compile step also validates: every referenced version exists in `api.versions`; `before`/`in` reference real versions; `until` > `since`; a `renamedFrom` alias does not collide with another field's name in any version it is active.

## 5. Where shaping is applied (the framework-agnostic core)

The shaping core is one transport-neutral idea: **derive a per-version *schema view*.** Given `(schema, activeVersion)` it produces a cached, read-only descriptor — visible field set, bidirectional wire↔canonical name map, resource `type` name, and the computed/coerce plan — that *looks like* a `ModelDef` shaped for that version. The handler then runs its **existing** pipeline against the substituted view instead of the raw `ModelDef`, rather than threading version logic into each function. The view is a pure function of `(schema, version)`; applying it to a row is a pure function of `(view, canonicalData)`.

Concretely the view drives the existing choke points:

1. **Field set per version.** For model M and version V, the visible fields are those with `since ≤ V < until` (absent annotations ⇒ present in all versions). This drives:
   - the JSON:API `projection` in `buildSerializers()` (extend the existing relation-stripping loop, [index.ts:1894](../../packages/server/src/api/rest/index.ts#L1894)) — today it adds only relation fields to the projection;
   - the ORM `select` the handler builds (`buildPartialSelect`/`buildSingleReadArgs`, [L1387](../../packages/server/src/api/rest/index.ts#L1387)/[L771](../../packages/server/src/api/rest/index.ts#L771)) so omitted-and-not-computed fields aren't even fetched. **Note the asymmetry:** today `buildPartialSelect` returns `select: undefined` (fetch all canonical fields) unless the client sends `fields[type]=`. Version-omit must therefore *introduce* a base `select` — the view's visible set — even when no sparse-fieldset was requested, then **intersect** it with any client `fields[type]`. This is a new "default select" path, not just an extension of the existing one.
2. **Rename.** When serializing, a field carrying `renamedFrom` and active in V<`before` is emitted under the alias. This must propagate to **everything that names the field**: `attributes` keys, `included` resources, relationship linkage, the **inbound query surface** (`fields[type]=`, `sort=`, `filter[...]`), and the **outbound error surface** (JSON:API `source.pointer`/`source.parameter` in validation errors must report the *wire* name the client sent, not the canonical one). All of these go through the view's single bidirectional map — `toCanonicalFieldName(view, wireName)` / `toWireFieldName(view, canonicalName)` — so param parsing, serialization, and error reporting share one mapping.
3. **Computed / dynamic attributes.** A field that is `@computed` and version-scoped is evaluated via the existing `ModelDef.computedFields` machinery, gated by the version range — this is how a removed field is re-synthesized for an older version (e.g. `fullName`). The field stays in the canonical schema (so it remains computable) but the view marks it visible only for the versions its range covers.
4. **Type coercion.** A `coerce` fn name resolves against a **registered transform table** the adapter/app supplies to the handler — the *same* registry as the §6 escape hatch, at field granularity (see §6). `encode` runs on serialize for the listed versions; `decode` runs on the inbound write path (§5a).
5. **Resource `type` name.** `@@api.typeName(... in: [V])` overrides the serializer's `type` for those versions — the one piece `modelNameMapping` cannot do today (it only rewrites the URL segment). The per-version serializer is constructed with the view's `type` string, so relationship linkage to that model picks up the aliased type automatically.

Because all five reduce to "consume a per-version view," the views — and the per-version serializers built from them — are **built once and cached** (keyed by `(model, version)`), not per request. Where the build cost or type-safety matters, the same view metadata can instead be **code-generated per `(model × version)`** by a plugin (see Option 3 in §7) — the runtime contract is identical.

### 5a. The inbound (write) path

Read shaping has a symmetric write side that must not be left implicit. For a write to version V the handler must, *before* validation and persistence:

1. **Reject fields not visible in V** — a `since`-gated field sent to an older version is an error, not a silently-ignored key (mirrors how unknown attributes are rejected today).
2. **Map wire names → canonical** via the view's bidirectional map, so a v1 client writing `title` updates the canonical `name`. This applies to the resource **`type`** too: a body whose `data.type` (or a relationship-linkage `type`) is a `@@api.typeName` alias must be reverse-mapped to the canonical model — the inbound mirror of §5.5.
3. **`decode` coerced values** wire → canonical; a coercion lacking a `decode` makes the field read-only for that version (write rejected with a clear message).
4. **Version-shape the input validation schema.** The handler validates inbound `attributes` against `createUpdatePayloadSchema` ([index.ts](../../packages/server/src/api/rest/index.ts) `processRequestBody`); that schema must be derived from the same view (renamed keys, omitted `since`/`until` fields) so validation accepts exactly the version's wire shape. Computed and read-only fields are not writable in any version.

### Active-version resolution (the adapter seam)

Core must not know how a request encodes its version. The handler gains one option:

```ts
new RestApiHandler({
  endpoint,
  resolveVersion: (request) => string,   // adapter supplies; defaults to the canonical (newest) version
})
```

The NestJS adapter maps its URI version (`/api/v2`) to this; another adapter could read an `Accept` media-type parameter or an `X-API-Version` header. Core only consumes the resolved string. This keeps the feature **framework-agnostic** while letting each transport pick its idiom. (It also lets the `endpoint`/link base — `makeLinkUrl`, L1890 — be derived per version so emitted `self`/pagination links carry the right prefix.)

### "Latest" and version-less requests

Two related conveniences are common in the wild — a moving **`latest`** alias (`/api/latest/...`, `Accept: …; version=latest`) and **omitting the version entirely** to mean "newest." (Stripe resolves an absent `Stripe-Version` to the account's pinned version; many REST APIs map an unversioned route to the current shape.) Both are **adapter policy, not a core concept** — they need *zero* new core surface because they collapse to the seam already defined:

- **Omit ⇒ canonical.** If `resolveVersion` returns `undefined`/nothing, core falls back to the canonical (newest) version (§2). So an adapter that simply doesn't parse a version is automatically serving latest — which is also the **cheapest** path: the canonical view applies **no rename, coercion, or `type` alias** (those target *older* versions only, since validation forbids `before`/`in`/`until` from pointing past the newest), so shaping is effectively a pass-through. The one thing it still does is project out any field already dropped at the latest version via `@api.until('<newest>')` — the same cheap projection the serializer does for `@omit` today (and the reason the canonical view is *near*-identity, not strictly identical to the raw `ModelDef`, which still carries those retained-for-older-versions fields).
- **Explicit `latest` ⇒ canonical.** An adapter that wants a literal `latest` token maps it to `versions[versions.length - 1]` before handing the string to core (`resolveVersion: (req) => parse(req) ?? 'latest'`, with `latest`→newest). Core sees a normal version string. To keep this robust, `latest` should be treated as a **reserved alias** the compile-time validation (§11.4) forbids as an actual `versions` entry, so it can never be ambiguous.

**The caveat worth stating:** `latest`/omission is a **moving target** — a client that pins to it is silently upgraded the day a new breaking version ships, which is the exact failure §11 exists to prevent on the *server* side but cannot prevent on the *client* side. This is why Stripe pins on first request rather than serving "latest" forever. The recommendation: expose `latest` for exploration/tooling and internal first-party clients, but document that production third-party integrations should pin an explicit version. Enforcing that (e.g. rejecting version-less requests in a versioned schema) is the adapter's call — see open question §10.5.

**Corollary — referencing something the resolved version doesn't have.** Because a version-less request *is* a canonical (v3) request, anything not in v3's view is a normal **404/400**, identical to asking for v3 explicitly: a field removed by `@api.until('v3')`, a relationship gone in v3, or the old wire `type` of a model renamed via `@@api.typeName(..., in:['v1'])` (in v3 the segment is the new name). Core never falls back to searching older versions — that would be ambiguous about which version's *shape* to respond with. So a v1 client that drops its version tag and calls a v1-only endpoint gets a 404 even though its data still exists under v1; the fix is to pin v1, not for core to guess.

Note the scope boundary this exposes. *Selecting* the version from a version-less request is **routing/negotiation — the adapter's job, out of scope** (§9). But the *existence check against the resolved version* is **not** routing: it is the handler validating the request against that version's view, and only the shaping core can do it — the web framework cannot know `procurement_project` is a v1-only alias. It is the same in-handler dispatch that already 404s unknown models today ([`getModelInfo`](../../packages/server/src/api/rest/index.ts) → `makeUnsupportedModelError`), merely made version-aware. So the 404 stays in scope; the version pick that led to it does not. The one improvement worth building on the in-scope side: since the core can resolve *every* version's view, it can detect "this name exists in some other version" and emit an **actionable error** — `type 'procurement_project' is not part of v3 (latest); it existed in v1 — pin version v1` — the read-side analog of §11's drift messages, rather than a bare 404.

## 6. The hard cases (and how this handles them)

| Change | Mechanism | Notes |
|---|---|---|
| **Add a field** | `@api.since('vN')` | Absent from older versions automatically. The common case; zero risk. |
| **Rename a field** | `@api.renamedFrom('old', before: 'vN')` | Hardest case: requires body **and** query-param mapping (`fields`/`sort`/`filter`). Solved by routing all field-name handling through the shaping core's bidirectional name map (§5.2). |
| **Change type/format** | `@api.coerce('fn', in: ['v1'])` | Value transform. `fn` names an `{ encode, decode }` pair in the transform registry (below); `encode` on read, `decode` on write. `decode` omitted ⇒ field is read-only for those versions. |
| **Remove a field** | `@api.until('vN')` — **keep it in the schema** until the last version exposing it retires | Mirrors expand/contract: the column/field stays until no served version needs it, then it (and its annotation) are deleted. A truly gone value can be re-synthesized with `@computed @api.until(...)` if derivable, else it's a product decision. |
| **Rename the resource type** | `@@api.typeName('old', in: ['v1'])` | Closes the gap `modelNameMapping` leaves (wire `type` vs URL segment). |

### Programmatic escape hatch — one transform registry

`coerce` (field-level) and complex multi-field reshaping (resource-level) are **the same mechanism at two granularities**, so there is *one* registry, not two:

```ts
new RestApiHandler({
  endpoint,
  resolveVersion,
  transforms: {
    // field-level: referenced by name from @api.coerce('priceToCents', in: ['v1'])
    priceToCents: { encode: (v) => Math.round(v * 100), decode: (c) => c / 100 },
    // resource-level: arbitrary reshaping a version needs, applied after annotation-driven shaping
    resources: {
      v1: { Project: { encode: (canonical) => wire, decode: (wire) => canonical } },
    },
  },
})
```

Field-level entries back `@api.coerce` (the 95% declarative case); resource-level entries handle multi-field reshaping or conditional logic the annotations can't express (the 5%), and are the bridge for adapters that want to stay fully in code. Both halves use the same `{ encode, decode }` shape so the read/write symmetry of §5/§5a holds uniformly.

## 7. Architectural options (end-to-end), with trade-offs

These are the *implementation strategies* for §5; they are not mutually exclusive.

### Option 1 — Annotation-driven, server-layer runtime shaping (recommended baseline)
Annotations → typed metadata → shaping core invoked by the REST handler at request time; ORM untouched.
- **Pros:** correct layering (ORM canonical, API versioned); single source of truth in the schema; incremental on existing hooks (`buildSerializers`, `buildPartialSelect`, `serializeItems`); the shaping core is transport-neutral so a future surface can reuse it; supports many versions simultaneously; smallest conceptual surface.
- **Cons:** runtime shaping cost (mitigated by per-version serializer caching); the query-param name-mapping work is real; computed/coerce need an evaluation path.

### Option 2 — Extend the ORM `@omit` path to be version-aware
Make the ORM result-stripping itself depend on an "active version."
- **Pros:** reuses the exact `@omit` choke point.
- **Cons:** pushes an API concept into the ORM (the ORM has no business knowing API versions); rename/compute/type-name don't fit the ORM result model; breaks the clean layering tenet. **Rejected** as a primary mechanism.

### Option 3 — Build-time codegen of per-version serializers/mappers (performance/type-safety complement)
A plugin generates a serializer (and field-name maps) per `(model × version)` from the same annotations.
- **Pros:** near-zero per-request cost; type-safe generated artifacts; runtime stays trivial.
- **Cons:** codegen complexity; regen on schema change; dynamic (`@computed`, `coerce`) still need runtime hooks. **Best as an optimization layered on Option 1**, sharing its metadata.

### Option 4 — Pure programmatic transform pipeline (no annotations)
Core exposes only the per-version transform registration API; users write transforms in code.
- **Pros:** maximal flexibility; no grammar changes.
- **Cons:** not declarative (defeats the stated goal); logic scattered outside the schema; essentially what an app can already hand-roll. **Keep only as the §6 escape hatch**, not the main feature.

**Recommendation:** **Option 1** as the core feature, with **Option 3** available for performance/type-safety and **Option 4** as the escape hatch. Annotation **Style A** (§3). Metadata as **typed `FieldDef.api`** (§4).

## 8. Layered implementation plan

Mapping to the real source tree (paths from the current `main`):

1. **Grammar + stdlib** — declare the `@api.*` / `@@api.typeName` attributes and the `api { versions }` block. `packages/language/src/zmodel.langium` (L243-270 attribute rules; add the schema-level `api` declaration), `packages/language/res/stdlib.zmodel` (alongside `@omit` L407, `@computed` L704).
2. **Compile to metadata** — extract args into typed `FieldDef.api` / `ModelDef.api` and `SchemaDef.api`. `packages/sdk/src/ts-schema-generator.ts` (mirror the `@omit` handling ~L652), `packages/schema/src/schema.ts` (extend `FieldDef`/`ModelDef`/`SchemaDef`). Add the compile-time validations (§4).
3. **Shaping core** — a new transport-neutral module: given `(schema, version)`, produce the visible-field set, the bidirectional field-name map, the `type` name, and the computed/coerce plan. No dependency on any server framework.
4. **REST handler integration (read)** — thread `resolveVersion` + the per-version view through `buildSerializers` (L1894), `buildPartialSelect` (L1387), `buildSingleReadArgs` (L771), `serializeItems` (L1996), and `makeLinkUrl` (L1890). Cache serializers per `(model, version)`.
5. **REST handler integration (write, §5a)** — version-shape the inbound validation schema (`processRequestBody`), reject not-visible fields, map wire→canonical names, and run `decode` coercions.
6. **Docs + examples** — the three hard-case recipes (rename, type change, remove) as copy-paste ZModel.

Each step is independently testable; steps 1–3 land the language + metadata with no behavior change until the REST handler opts in at step 4. The shaping core (step 3) is deliberately transport-neutral so the RPC handler — or a future surface — can adopt it later without rework (§9).

## 9. Compatibility and non-goals

- **Additive-only stays the default guidance.** These annotations are for the cases you *must* break; most evolution should still be additive (no annotation needed). The feature lowers the cost of the rare breaking change; it does not encourage churn.
- **The canonical schema is always latest.** Removing a field from the `.zmodel` removes it from *all* versions; to retire a field you first `@api.until(...)` it, then delete it once the last version using it is dropped — the same expand/contract lifecycle the schema already implies for the DB.
- **The RPC handler is deferred (but the design doesn't preclude it).** This proposal ships shaping for the REST/JSON:API handler only. RPC is intentionally out of the *initial* scope because its query surface is materially harder: REST exposes flat, easily-mapped params (`fields[type]`, `sort`, `filter[...]`), whereas RPC accepts arbitrarily **nested** Prisma-style `where`/`orderBy`/`select`/`include` trees, so bidirectional field-rename would mean recursively rewriting names through nested boolean/relation structures — a much larger surface than rename on REST. The shaping core (§5, step 3) is deliberately transport-neutral, so RPC can adopt it later without rework; only the query-tree name-walking is RPC-specific. Field omission, `since`/`until`, and `typeName` would port directly; rename/coerce are the parts that need the extra tree-walking.
- **Not in scope:** request *routing* by version and **content/media-type negotiation** (`Accept: …; version=2`, `X-API-Version`) — both are adapter/framework concerns that merely produce the resolved version string `resolveVersion` consumes (§5); core never inspects the transport. Also out of scope: persistence/migration versioning (orthogonal — the DB has one current schema), and GraphQL (separate surface; the shaping core could be reused later).
- **Security `@omit` is unchanged and orthogonal** — it stays an unconditional ORM-level strip; version-omit is a presentation axis layered above it.

## 10. Open questions

1. Should `api.versions` ordering support **ranges/aliases** (e.g. "`v1` means everything before `v2`") or stay an explicit closed list? (Closed list proposed.)
2. Where should the **`coerce`/transform function registry** live — passed per-handler (framework supplies), or registered on the client/schema so it is adapter-independent? (Leaning per-handler for framework-agnosticism, but a schema-registered option keeps it declarative.)
3. Do we need **per-version relationship reshaping** (a relationship present in one version, gone in another)? `@api.since/until` on relation fields should cover it via projection, but `included` traversal needs verification.
4. Is **Style C (views)** worth building up front for projects expecting large version diffs, or strictly a later sugar?
5. Should the default, when no `resolveVersion` is supplied, be the canonical (newest) version or a hard error in a versioned schema? (Proposed: default to canonical, so unversioned adapters keep working unchanged.)
6. What is the snapshot format for the drift check (§11.1) — a purpose-built JSON shape descriptor, or per-version OpenAPI specs as the committed baseline? OpenAPI reuses mature diff tooling but is weaker on JSON:API relationships/`included`; a custom descriptor is precise but bespoke.
7. **Major-only versions, or majors *and* minors?** See §2.1. Proposed: the version axis enumerates only **breaking boundaries** (majors); additive changes need no new entry and no annotation. A minor/additive axis (Stripe's monthly-vs-major split) is deferred unless a concrete need appears.

## 11. Tooling and guardrails

The proposal's central risk is that the `.zmodel` *is* the latest shape, so a dev editing it for a new version can silently mutate a **frozen** version's contract. Three failure modes:

- **Forgetting `@api.since` on a new field** → it leaks into older versions (additive, usually benign, but unintended).
- **Forgetting `@api.renamedFrom` on a rename** → the old field name vanishes from older versions → **breaks them**.
- **Forgetting `@api.until` on a removal** (deleting the field outright) → it disappears from older versions → **breaks them**.

The defining constraint: **no purely-local check can detect this.** Knowing whether a change altered v1 requires comparing against a *recorded baseline* of what v1 was. Every robust guardrail therefore reduces to "snapshot a frozen version, then diff." The approaches below are ordered by recommendation — the first is the enforcement floor; the rest layer on ergonomics or reuse.

### 11.1 Per-version contract snapshots + CI diff — *primary, recommended*

The shaping core (§5) can resolve the full wire shape for any version. Have it emit a canonical descriptor per **frozen** version — `api-contract/v1.json`, `v2.json`, … (resolved field set, wire names, types, resource-`type` names, relationship shape) — committed to the repo. A `zenstack api check` command regenerates the descriptors from the current schema + annotations and diffs against the committed baselines. Any drift in a *released* version fails CI with a precise, actionable message:

> `Project.title` no longer present in **v1** — add `@api.until('v2')` or `@api.renamedFrom('title', before:'v2')`, or cut a new version.

Accepting a deliberate change is an explicit `zenstack api check --update` (you only touch a frozen contract on purpose).

- **Catches:** all three failure modes deterministically — including the additive *leak* (a new field appearing in v1), which the dev then resolves with `@api.since` or by consciously accepting it.
- **Pros:** the only mechanism that *guarantees* no silent drift; the diff itself tells the dev exactly what to annotate; reuses machinery the proposal already builds; the snapshot is a generated artifact, so it preserves the "annotate only what changed" tenet (no per-field freeze stamps cluttering the schema).
- **Cons / effort:** must generate and maintain the snapshot artifacts plus the `check` / `--update` CLI; snapshot updates must be treated as review-worthy (that's the point). Moderate, mostly reuse.

### 11.2 Per-version OpenAPI specs + breaking-change linter — *pragmatic variant of 11.1*

ZenStack already generates an OpenAPI spec. Generate one **per version**, commit them as the baselines, and run an existing breaking-change linter (`oasdiff`, `openapi-diff`) in CI instead of a bespoke differ.

- **Pros:** far less custom code; inherits a mature, well-tested breaking-change ruleset; the per-version specs are independently useful (client generation, docs).
- **Cons:** OpenAPI is weaker at expressing JSON:API specifics (relationships, `included`, sparse-fieldset interactions), so drift in those areas can slip past a generic OAS differ; spec generation must itself be version-aware (it consumes the same shaping core).
- **Effort:** low-to-moderate; a strong 80/20 if you'd rather not own a custom differ.

### 11.3 Language-server diagnostics + quick-fixes — *best DX, higher effort*

With a snapshot baseline (11.1) loaded, the Langium language server flags the drift **in-editor** the moment a field is renamed or deleted, and offers a code action:

> "This removes `title` from **v1** — [Quick fix] add `@api.renamedFrom('title', before:'v2')`."

- **Pros:** turns the guardrail from a CI gate into an at-keystroke nudge — the ideal "ensure the dev adds the v1 annotation *while* writing the v2 change" experience; the quick-fix writes the correct annotation for them.
- **Cons / effort:** real Langium work; the server must load the frozen-version baseline, so it depends on 11.1 existing. Best added *after* the CI floor is in place.

### 11.4 Intra-schema compile-time validations — *foundational, cheap (already partly in §4)*

Pure local checks that need no baseline: every version referenced in `@api.*` exists in `api { versions }`; `until > since`; `before`/`in`/`until` never point *past* the newest declared version (the invariant the canonical-view pass-through in §5 relies on); a `renamedFrom` alias doesn't collide with a live field name in any version it is active; a field removed at `until` isn't referenced by a later `since`; and the reserved token `latest` is rejected as an actual `versions` entry (so the adapter alias in §5 is never ambiguous).

- **Role:** catches *malformed* annotations, not *missing* ones — necessary but not sufficient on its own. Ships with the compiler regardless; it is the substrate the other tiers assume.

### 11.5 Retiring a version — the contract step, not just the routing step

Adding versions is incremental (§9); **removing** the oldest version is the under-considered half of the lifecycle, and it is more than dropping it from `api.versions`. When `v1` is retired, four things must be cleaned up together, and skipping any of them leaves dead weight or a latent bug:

1. **Now-dead annotations.** Any `@api.until('v2')` field exists *only* to keep it out of v2+; once v1 is gone, `until('v2')` is satisfied by no served version. An `@api.since('v2')` becomes unconditional (the field is now in every surviving version) and the annotation can drop. A `@api.renamedFrom('title', before:'v2')` is dead once no version `< v2` is served. `@@api.typeName(..., in: ['v1'])` drops with v1.
2. **Fields kept alive solely for the retired version.** A field carried only by `@api.until('v2')` (and not otherwise in the canonical shape) is now deletable from the `.zmodel` — and, if it was a real column, becomes a normal expand/**contract** DB migration. This is the moment the expand/contract cycle §9 describes actually *contracts*. A `@computed @api.until(...)` re-synthesizer can likewise be deleted.
3. **The frozen contract snapshot.** Delete `api-contract/v1.json` (§11.1) / the per-version OpenAPI spec (§11.2). The drift check must treat *removal of a baseline* as a deliberate, reviewable act (the same `--update` gate), so a snapshot can't be dropped silently.
4. **Transform-registry entries** scoped to the retired version (§6 `resources: { v1: … }`, and any `coerce` fn no longer referenced by a surviving annotation).

**Tooling assist.** Because the metadata is typed (§4) and the shaping core can resolve every version's view, a `zenstack api retire <version>` command can do the bookkeeping deterministically: it knows which annotations reference only `<version>`, which fields are visible *only* in `<version>`, and which snapshot/registry entries are scoped to it — so it can produce the exact diff (delete these annotations, this field is now droppable, remove this snapshot) rather than leaving it to manual grep. The compile-time validations (§11.4) then catch any dangling reference left behind. **Guard:** the one thing the tool must *not* auto-do is drop a DB column — that stays an explicit migration the dev runs, since data loss is involved; the tool flags it as a follow-up.

### 11.6 Representing versions in the generated OpenAPI

ZenStack already generates an OpenAPI spec; §11.2 reuses that generation **per version** as a drift baseline. The same per-version generation is also the **consumer-facing** answer to "how do versions (and `latest`/omission) appear in the spec" — a facet the rest of the proposal leaves open.

**One document per version, not one spec with a version parameter.** Because this feature exists precisely *because shapes diverge*, two versions of the same operation cannot share one schema cleanly. So generate `openapi/v1.json`, `v2.json`, `v3.json` — each `info.version: vN` with that version's resolved component schemas (the shaping core already produces the per-version view). `latest.json` is the canonical version's spec, published as a copy/alias of the newest. This doubles as the §11.2 baseline set, so it is one generator, two uses.

**The version-addressing representation is idiom-dependent** — and OpenAPI expresses each idiom differently:

| Resolution idiom | OpenAPI representation | `latest` / omission |
|---|---|---|
| **URL path** (`/api/v3/...`) | templated server variable `servers: [{ url: '/api/{version}', variables: { version: { enum: [...,'latest'], default: 'latest' } } }]` | the server-variable **`default`** *is* the omission behavior; `latest` is an enum member |
| **Header / query** (`X-API-Version`) | a reusable `parameter` (`in: header`/`query`) with `schema.enum` of versions + `default`, `required: false` | `required: false` ⇒ omission allowed; `default` documents what it resolves to; `latest` in the enum |
| **Media-type** (`Accept: …; version=2`) | distinct media types as separate `content` keys (`application/vnd.api.v1+json`) — OpenAPI has no first-class media-type *parameter* | weakest fit; reinforces the per-version-document choice |

**The seam:** the generator can't infer the idiom, because the transport is the adapter's choice and invisible to core (§9). So the OpenAPI plugin needs the **consumer-facing analog of `resolveVersion`** — a small config (`versioning: { style: 'path' | 'header' | 'query' | 'mediaType', param?: string }`) telling it *how* versions are addressed, so it emits the matching `servers`/`parameters`/`content` shape. Same transport-agnosticism, same shape of solution as the runtime seam. Absent that config, the generator can still emit correct per-version *schemas*; only the addressing wrapper (servers/parameters) needs the idiom.

### Recommendation

Ship **11.1** as the enforcement floor (the only thing that guarantees no silent drift), optionally realized via **11.2** if you'd rather lean on OpenAPI tooling than a custom differ. Fold in **11.4** with the compiler from day one. Add **11.3** later for ergonomics, once a baseline exists. Pair the floor with **11.5**'s `retire` command so the contract cleans up as deliberately as it grows. If you adopt the per-version OpenAPI generation (**11.2** / **11.6**), it serves double duty as both the drift baseline and the consumer-facing version documentation. Net effect: a dev working on v2 **cannot** land a change that alters v1 without either annotating the difference or explicitly accepting a new baseline — exactly the guarantee the proposal needs to be safe in practice.

## 12. Prior art and comparison

This design is **not novel in shape** — its core (the schema describes the *latest* representation; older versions are reconstructed by transforms applied at the API boundary at request time) is the model [Stripe](https://stripe.com/blog/api-versioning) has run in production since 2011. What is comparatively novel is the *combination*: making the common evolutions **declarative annotations on the schema** (compiled to per-version views) with an imperative transform registry only as the escape hatch, plus a **compile-time + CI drift guardrail** (§11). The prior art below is grouped by which facet of the design it validates.

| Prior art | Canonical-latest + backward transform | Declarative | Resolution seam | Drift/breaking-change tooling |
|---|:--:|:--:|:--:|:--:|
| **Stripe** version changes | ✅ (the reference) | ❌ imperative modules | header → OAuth app → account-pinned | ❌ human "API review" only |
| **Cadwyn** (FastAPI), **gates** (Ruby), **PhoenixApiVersions** (Elixir) | ✅ | ❌ imperative modules | varies | ❌ |
| **PostgREST** schema/view-per-version | ➖ (views, not transforms) | ✅ (SQL views) | content negotiation (`Accept-Profile`) | ❌ (bolt on `oasdiff`) |
| **GraphQL** (`@deprecated`, evolve-don't-version) | ❌ (no versions) | ✅ directive | n/a | ✅ Inspector / Apollo GraphOS |
| **Prisma** `@map`, `$extends` | ❌ (no API versioning) | ✅ | n/a | ❌ |
| **.NET Asp.Versioning**, **DRF** | ❌ (resolution only) | ➖ attributes | URL / header / media-type / query | ➖ advertises supported/deprecated |
| **OpenAPI diff** (oasdiff, openapi-diff) | n/a | n/a | n/a | ✅ (this is the §11.2 tool) |

### The transform-at-request-time model — validates §1, §5, §7-Option 1

- **[Stripe](https://stripe.com/blog/api-versioning)** is the canonical precedent and maps almost 1:1 to this design. Every response shape is an "API resource" class written **only for the current version**; each backward-incompatible change is a *version change module* bundling docs, a transformation, and the eligible resource types; at request time Stripe formats at the latest version then "walks back through time" applying modules in reverse until the caller's target version is reached. The target version is resolved from the `Stripe-Version` header → authorized OAuth app version → the account's first-request-pinned version — i.e. exactly our `resolveVersion` seam (§5), and confirming that **version resolution is a transport concern distinct from the shaping core**. Two divergences worth noting: (a) Stripe's modules are **imperative Ruby**, where we make the 95% case declarative annotations; (b) Stripe's guard against breaking a frozen version is a **human "lightweight API review,"** *not* an automated detector — so our §11.1 snapshot+diff is actually **more rigorous than the reference implementation's own process**.
- The pattern has multiple independent reimplementations, which de-risks it: **[Cadwyn](https://github.com/zmievsa/cadwyn)** ("production-ready Stripe-like API versioning in FastAPI" — maintain only the newest version, older ones generated from version-change modules), **[gates](https://github.com/phillbaker/gates)** (Ruby; *cite as a pattern reference — ~toy scale*), and **[PhoenixApiVersions](https://hexdocs.pm/phoenix_api_versions/)** (Elixir; `transform_request_body_params/3` + `transform_response/3` change modules stacked as adjacent layers — note it does the inbound/outbound symmetry we describe in §5a). All three are imperative-module designs; **none compiles declarative schema annotations to per-version views, and none ships a drift guardrail** — the two places this design goes further.

### View/schema-per-version — validates Style C (§3) and the "per-version view" framing (§5)

- **[PostgREST](https://docs.postgrest.org/en/v12/explanations/schema_isolation.html)** derives a REST API straight from a Postgres schema and officially recommends exposing **views/functions** (not tables) as "a natural way to do API versioning" — change internals, keep a stable view. Multiple schemas (`db-schemas`) can coexist and are selected per request via **content negotiation** (`Accept-Profile` for reads, `Content-Profile` for writes), the W3C "Content Negotiation by Profile" mechanism. This is the database-native analog of our **Style C views** (§3) and of the "derive a per-version *schema view*" framing (§5), and independent evidence that content negotiation is the natural resolution idiom (§9 non-goals). (A community "schema-per-version with `extends: v1`" proposal, [issue #2166](https://github.com/PostgREST/postgrest/issues/2166), remains unaccepted — so even PostgREST hasn't formalized incremental versioning.)

### Resolution-only frameworks — validate the `resolveVersion` seam + content negotiation as adapter concerns (§5, §9)

- **[.NET Asp.Versioning](https://github.com/dotnet/aspnet-api-versioning)** (formerly `Microsoft.AspNetCore.Mvc.Versioning`, renamed at v6) offers four composable version *readers* — query string, header, **media-type** (`MediaTypeApiVersionReader`), and URL segment — and advertises `api-supported-versions`/`api-deprecated-versions`. Crucially it **only resolves and routes**; it does **not** reshape the response body — developers hand-author versioned controllers/DTOs.
- **[Django REST Framework](https://www.django-rest-framework.org/api-guide/versioning/)** has five schemes (URL-path, namespace, accept-header, query-param, hostname); it sets `request.version` and explicitly says "**how you vary the API behavior is up to you**" — the canonical example branches in `get_serializer_class()`. Go's `kataras/versioning` and Ruby's stale `versionist` are likewise resolution/routing only.
- **Takeaway:** the entire mainstream ecosystem treats version *resolution* (incl. content/media-type negotiation) as the framework's job and leaves *shape transformation* to hand-written per-version code. This design keeps the same resolution seam but **replaces the hand-written per-version code with declarative annotations + a shared shaping core** — precisely the gap these frameworks leave open.

### Schema primitives we already echo — validates §1 tenet 4 ("reuse existing primitives")

- **[Prisma](https://www.prisma.io/docs/orm/prisma-schema/data-model/database-mapping)** has **no API versioning** (it is a query layer, not an API server), but two of its primitives are direct precedents: `@map`/`@@map` "decouple model and field names from … the underlying database" (the rename precedent, albeit DB-side, mirrored at the wire by our `renamedFrom` + `@@api.typeName`), and **client extensions** `$extends` — the `result` component adds type-safe **computed fields evaluated on access** (precedent for our version-gated `@computed`, §5.3) and the `query` component intercepts/transforms queries and results (precedent for the transform registry, §6).

### The philosophical alternative — GraphQL's "evolve, don't version" (§9 additive guidance)

- **[GraphQL](https://graphql.org/learn/best-practices/)** "takes a strong opinion on avoiding versioning," relying on additive evolution plus the **`@deprecated`** directive rather than version axes — because clients request only the fields they need, additions are non-breaking by construction. This is the same default we recommend in §9 ("additive-only stays the default guidance"); our annotations are explicitly for the residual cases where you *must* break. **Hasura** follows GraphQL here (versioning *is* `@deprecated`; field renames are pure GraphQL-layer aliases via `custom_name`/`custom_root_fields`).

### Tooling we can directly adopt or learn from for §11 (drift detection)

This is where prior art is most actionable — §11's "snapshot a frozen contract, diff in CI" is a solved problem in adjacent ecosystems:

- **§11.2 (OpenAPI route) is essentially off-the-shelf.** **[oasdiff](https://github.com/oasdiff/oasdiff)** is an actively-maintained (Go, Apache-2.0, releases through mid-2026) spec-diff tool with hundreds of breaking-change checks across three severities (ERR/WARN/INFO) and a [GitHub Action](https://github.com/oasdiff/oasdiff-action) that fails the PR on breaking changes — exactly the §11.2 CI gate. **[OpenAPITools/openapi-diff](https://github.com/OpenAPITools/openapi-diff)** (Java, `--fail-on-incompatible`) is a live alternative. ⚠️ **[Optic](https://github.com/opticdev/optic) is archived (read-only as of Jan 2026, post-Atlassian acquisition) — do not adopt it for new work.**
- **GraphQL's tooling suggests two refinements to §11.1.** **[GraphQL Inspector](https://the-guild.dev/graphql/inspector/)** classifies every change as breaking / dangerous / safe and lets an explicit `approved-breaking-change` label override the CI failure — a nicer ergonomic than our binary `--update` (a "dangerous" middle tier + label-to-accept is worth copying). **[Apollo GraphOS schema checks](https://www.apollographql.com/docs/graphos/platform/schema-management/checks)** go further: they are **operation-usage-aware** — a technically-breaking change is only flagged if *recorded client traffic actually used* the affected element. If ZenStack ever has request telemetry, §11.1 could likewise downgrade "drift in a field no client reads" from error to warning.
- **Contract-testing tools are complementary, not substitutes.** [Pact](https://docs.pact.io/) (consumer-driven contracts) and [Spectral](https://stoplight.io/open-source/spectral) (spec linting) operate on consumer expectations / spec style respectively; they don't replace the per-version *baseline* diff, but either could run alongside it as an extra CI gate.

**Synthesis.** Stripe (and its reimplementations) **validate the runtime model**; PostgREST validates the **view-per-version** framing; the resolution frameworks validate the **`resolveVersion` seam**; Prisma supplies the **primitive precedents**; GraphQL supplies the **additive-first default**. The design's distinct contribution is sitting at the intersection — **declarative schema annotations → per-version views, with an imperative escape hatch and an automated drift guardrail** — a combination no single prior art provides. For §11 specifically, adopt **oasdiff** if going the OpenAPI route (§11.2), and borrow GraphQL Inspector's *dangerous/approve-label* ergonomics and Apollo's *usage-aware* downgrade as future refinements of the bespoke differ (§11.1).

## 13. Appendix — sources

Verified during research (June 2026); grouped by §12 facet. ⚠️ flags a caveat.

- **Stripe (runtime model):** [engineering blog](https://stripe.com/blog/api-versioning) (the mechanics), [API versioning](https://docs.stripe.com/api/versioning), [upgrades](https://docs.stripe.com/upgrades), [Brandur — why no auto-upgrade](https://brandur.org/api-upgrades). ⚠️ Stripe expects to *eventually* retire old versions — "never deprecates" is community framing, not a guarantee.
- **Stripe-pattern reimplementations:** [Cadwyn](https://github.com/zmievsa/cadwyn) (FastAPI), [PhoenixApiVersions](https://hexdocs.pm/phoenix_api_versions/) (Elixir), [gates](https://github.com/phillbaker/gates) (Ruby ⚠️ toy-scale — pattern reference only).
- **View-per-version:** PostgREST [schema isolation](https://docs.postgrest.org/en/v12/explanations/schema_isolation.html), [schemas/Profile headers](https://docs.postgrest.org/en/v13/references/api/schemas.html), [issue #2166](https://github.com/PostgREST/postgrest/issues/2166) (⚠️ unaccepted proposal).
- **Resolution-only frameworks:** [.NET Asp.Versioning](https://github.com/dotnet/aspnet-api-versioning) ([version readers](https://github.com/dotnet/aspnet-api-versioning/wiki/API-Version-Reader)), [Django REST Framework](https://www.django-rest-framework.org/api-guide/versioning/).
- **Prisma primitives:** [`@map`/`@@map`](https://www.prisma.io/docs/orm/prisma-schema/data-model/database-mapping), client extensions [`result`](https://www.prisma.io/docs/orm/prisma-client/client-extensions/result) / [`query`](https://www.prisma.io/docs/orm/prisma-client/client-extensions/query).
- **GraphQL / Hasura:** [GraphQL best practices](https://graphql.org/learn/best-practices/), [`@deprecated` spec](https://spec.graphql.org/draft/), [Hasura versioning](https://hasura.io/docs/3.0/graphql-api/versioning/).
- **Drift tooling (§11):** [oasdiff](https://github.com/oasdiff/oasdiff) + [Action](https://github.com/oasdiff/oasdiff-action), [OpenAPITools/openapi-diff](https://github.com/OpenAPITools/openapi-diff), [GraphQL Inspector](https://the-guild.dev/graphql/inspector/), [Apollo GraphOS checks](https://www.apollographql.com/docs/graphos/platform/schema-management/checks), [Pact](https://docs.pact.io/), [Spectral](https://stoplight.io/open-source/spectral). ⚠️ [Optic](https://github.com/opticdev/optic) archived Jan 2026 — do not adopt.
