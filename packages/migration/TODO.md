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
- [ ] Primary key change on **pg/mysql** (still `unsupported`)
- [ ] Foreign key add/drop on existing columns; `onDelete`/`onUpdate` change (still `unsupported`)
- [ ] Enum value **removal / reorder** (still `unsupported` — pg can't drop enum values in place)
- [ ] MySQL enum value changes (inline-enum column MODIFY; currently `unsupported`)
- [ ] `db push` alter detection — `diffForPush` uses name-only introspection, so `db push`
      still misses type/nullability/default changes (needs richer introspection). Prisma's
      `db push` handles these. `migrate dev`/`deploy` do handle them.

Already automated: add/drop table, column, index, relation; **rename** table/column (via the
resolver — better than Prisma's drop+create).

## 2. Migration integrity & safety mechanics

We rely on Kysely's migrator (name-only tracking). Missing vs Prisma's `_prisma_migrations`:

- [ ] Checksums — detect edits to already-applied `migration.ts` (Prisma refuses)
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

- [ ] `migrate dev` data-loss warnings — `drop-column`/`drop-table` are generated silently;
      Prisma prints "you are about to drop … all data will be lost". (`db push` already has
      data-loss detection via `diffForPush` — reuse it.)
- [ ] Detect "add required column to a non-empty table" — currently emits `.notNull()` and fails
      at apply time; Prisma warns it needs a default

## 4. CLI command parity

- [ ] `migrate diff` (from/to schema|db|migrations|empty → SQL or summary) — previews, CI checks, squashing
- [ ] Tie `db pull` to the engine so a pulled schema round-trips to a no-op baseline (emit the
      `map:` annotations for non-convention constraint/index names — the "residual" case)
- [ ] `resolve --rolled-back` (currently `--applied` only; roll-forward model by design — decide/doc)
- [ ] First-class squash/consolidate flow (we have `baseline`, not squash)

## 5. Provider coverage & misc

- [ ] MySQL is second-class — type/naming code exists but is untested (e2e migration suite covers
      sqlite + postgres only). Add MySQL coverage.
- [ ] Down migrations — not planned (parity with Prisma; roll-forward by design)

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
