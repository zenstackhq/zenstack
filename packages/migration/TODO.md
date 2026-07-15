# Native Migration Engine — Gaps vs Prisma Migrate

Tracking what the native migration engine (`@zenstackhq/migration`) still lacks compared to
`prisma migrate`. Grounded in the current code as of the initial engine implementation.

Ordered by impact. Checkboxes are open items.

## 1. Schema-change coverage (highest impact) — mostly done

`diff.ts` now emits `alter-column` for in-place changes (via attribute-level diffing) with
`ALTER` on pg/mysql and a table rebuild on SQLite. Applied via `migrate dev` / `deploy`.

- [x] `alter-column` type change (`ALTER COLUMN … TYPE` on pg/mysql; SQLite table rebuild)
- [x] Nullability change (SET / DROP NOT NULL)
- [x] Default change (SET / DROP DEFAULT)
- [x] Native type (`@db.*`) change on an existing column (a type change → `alter-column`)
- [x] Enum value **append** (pg `ALTER TYPE … ADD VALUE IF NOT EXISTS`)
- [x] Replace the `columnsEqual` JSON-compare with attribute-level diffing (`alterColumnChanges`)
- [x] Primary key change on **SQLite** (handled by the table rebuild)
- [x] Foreign key add/drop on existing columns; `onDelete`/`onUpdate` change (drop + re-add on
      pg/mysql, rebuild on sqlite)
- [x] Primary key change on **pg/mysql** — composite `@@id` and single-`@id` moves (drop + re-add
      the constraint by its deterministic name; better than Drizzle, which leaves the DROP a
      manual step). Adding/removing a PK entirely is still `unsupported`.
- [x] Enum value **removal / reorder** — pg can't drop enum values in place, so the type is
      recreated Prisma-style (`recreate-enum`): create `<name>_new`, cast every using column
      over (`USING col::text::new`, dropping/restoring column defaults around the cast), swap
      names, drop the old type. Fails at apply time if a removed value is still in the data
      (same as Prisma). SQLite enum value changes are now a no-op (enums are plain text there)
      instead of `unsupported`.
- [x] MySQL enum value changes — lowered to `alter-column` (`MODIFY COLUMN` restating the new
      inline `enum(...)`) per using column, emitted after the table loop so names are
      post-rename; fails at apply time under strict mode if a removed value is still in row data
- [ ] `db push` alter detection — `diffForPush` uses name-only introspection, so `db push`
      still misses type/nullability/default changes (needs richer introspection). Prisma's
      `db push` handles these. `migrate dev`/`deploy` do handle them.

Already automated: add/drop table, column, index, relation; **rename** table/column (via the
resolver — better than Prisma's drop+create).

## 2. Migration integrity & safety mechanics

We rely on Kysely's migrator (name-only tracking). Missing vs Prisma's `_prisma_migrations`:

- [x] Checksums — a `checksum` column on `zenstack_migration` stores the SHA-256 of each
      applied `migration.ts`; `deploy` refuses (returns an error, applies nothing) if an
      already-applied migration was edited, and backfills checksums for legacy rows
- [ ] Failed-migration state — Kysely only records on success, so a mid-failure migration is
      retried on the next run (possibly on a partially-applied DB). Prisma records
      `finished_at = NULL` and blocks until resolved. Needs failed-state tracking + a
      `resolve --rolled-back` / recovery path
- [ ] Drift detection in `migrate dev` (DB no longer matches recorded history → warn / offer reset)
- [ ] Shadow-database validation (optional — verify the full history replays cleanly from scratch;
      not needed for diffing since snapshots are our recorded state)
- [ ] `migration_lock.toml` equivalent (provider guard — refuse if the provider changed)
- [ ] Stronger locking on pg (advisory lock vs the current `zenstack_migration_lock` table lock)

## 3. Data-safety UX

- [x] `migrate dev` data-loss warnings — warnings computed from the snapshot diff (drop
      table/column, sqlite rebuild drops, enum value removals), filtered data-aware against the
      live DB (fail-safe: kept on probe errors), gated by a `confirmDataLoss` hook — interactive
      y/N in `migrate dev`, abort in non-TTY, printed-only with `--create-only`.
- [ ] Detect "add required column to a non-empty table" — currently emits `.notNull()` and fails
      at apply time; Prisma warns it needs a default

## 4. CLI command parity

- [ ] `migrate diff` (from/to schema|db|migrations|empty → SQL or summary) — previews, CI checks, squashing
- [ ] Tie `db pull` to the engine so a pulled schema round-trips to a no-op baseline (emit the
      `map:` annotations for non-convention constraint/index names — the "residual" case)
- [ ] `resolve --rolled-back` (currently `--applied` only; roll-forward model by design — decide/doc)
- [ ] First-class squash/consolidate flow (we have `baseline`, not squash)

## 5. Provider coverage & misc

- [x] MySQL is first-class — the full migration suite runs on `TEST_DB_PROVIDER=mysql`
      (only the pg-specific enum tests are skipped). Engine handles MySQL's DDL
      differences: `MODIFY COLUMN` for alters, `DROP INDEX … ON table`, `DROP PRIMARY KEY`,
      explicit FK add/drop (MySQL ignores inline references and blocks dropping FK columns),
      and FK-backing-index handling in `db push`.
- [ ] Down migrations — not planned (parity with Prisma; roll-forward by design)

## 6. Rollout / activation

- [ ] Revisit the `--native` switch (and `ZENSTACK_NATIVE_MIGRATE` env var) used to activate the
      new engine. Decide the long-term story: keep it opt-in, flip the default with a
      `--legacy`/`--prisma` escape hatch, or drop the Prisma path once at parity.

  **Key constraint — it is not just a flag.** The native engine records history in its own
  `zenstack_migration` table and cannot read Prisma's `_prisma_migrations` / `prisma/migrations/*.sql`.
  Switching an existing project therefore requires a one-time **baselining cutover per database**
  (`baseline` / `resolve --applied`) so the engine doesn't think the schema is empty and try to
  recreate everything. Because the tracking table is per-DB, dev/staging/prod each need it — so a
  naive default-flip would break existing projects.

  Sub-tasks to make the cutover smooth:
  - [ ] A guided `migrate adopt` (or `baseline --from-prisma`) that detects an existing
        `_prisma_migrations`, verifies the live DB matches the current schema (drift check), and
        baselines automatically — one command per environment instead of manual steps.
  - [ ] Docs + a clear error when the engine is pointed at a Prisma-managed DB with no
        `zenstack_migration` table (tell the user to `adopt`/`baseline`, don't silently recreate).
  - [ ] Decide whether to keep the old `prisma/migrations` history around (read-only) or discard it
        after adoption.

## Where we already match or beat Prisma

- Rename detection (data-preserving `RENAME`) — Prisma can't do this automatically
- Snapshot-based diffing — no shadow DB needed to author a migration
- `baseline` + `resolve --applied` for adopting an existing (e.g. Prisma-built) database
- TypeScript migrations with Kysely *and* the ORM client available
- Prisma-compatible physical output (names / types / 63-64 char truncation) — verified vs Prisma v7
- Delegate (polymorphic) model support

## Suggested order

1. `alter-column` (type / nullable / default / native-type) + enum value changes — Section 1
2. Failed-migration state + checksums — Section 2
3. `migrate dev` data-loss warnings — Section 3
4. FK/PK alterations + MySQL test coverage
