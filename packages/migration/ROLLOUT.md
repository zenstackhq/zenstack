# Native Migration Engine — Rollout Plan

How to release the snapshot-based engine (`@zenstackhq/migration`) and move existing users off
the Prisma-backed one without changing the behaviour of their databases.

Written 2026-11-11 against branch `feat/native-migration-engine` (workspace at 3.10.0, Prisma
6.19.0 under the old engine). "Old engine" below means the Prisma CLI path in
`packages/cli/src/actions/migrate.ts`; "native engine" means this package.

Claims marked **(verified)** were observed by running both engines against the same SQLite
project; the reproduction is in [Appendix A](#appendix-a-reproducing-the-cutover-test). Claims
marked **(by reading)** come from the code and have not been exercised.

## Summary of decisions

1. **The engine is chosen per project, in a committed setting** — not per command. The two
   engines cannot alternate on one database or one migrations folder.
2. **Existing projects stay on the old engine until they explicitly adopt.** When the setting is
   absent, a migrations folder with Prisma history means the old engine. This lets the default
   flip for new projects without breaking anyone.
3. **Adoption is a baseline, not a rewrite.** The live schema is recorded as one already-applied
   native migration; no table is touched. The Prisma history and `_prisma_migrations` stay in
   place, read-only, so the cutover can be rolled back until the first new native migration is
   applied.
4. **The Prisma path is removed only in v4**, after two releases in which it is deprecated.

## 1. What the cutover test showed

A project with an implicit many-to-many relation was built with the old engine, then adopted.

| #   | Finding                                                                                                                                                                                                    | Status                                                        |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 1   | Both engines default to `zenstack/migrations`. After a native baseline lands there, the old `migrate deploy` fails with P3015 (no `migration.sql`) and `migrate status` reports the baseline as unapplied. | **Open — blocker** (verified)                                 |
| 2   | The old engine against a database the native engine has touched: `migrate dev` reports drift (`zenstack_migration`, `zenstack_migration_lock`) and demands a reset; `db push` wants to drop both tables.   | **Open — by design, needs a guard** (verified)                |
| 3   | `migrate deploy --native` on a database that was never baselined fails with `table "User" already exists`, after creating the tracking tables.                                                             | **Open — blocker** (verified)                                 |
| 4   | Implicit many-to-many join tables were not modelled: the baseline omitted them, a fresh database never got them, and `db push --native --accept-data-loss` dropped the live table.                         | **Fixed** (verified on all three providers; see `TODO.md` §1) |
| 5   | Author the baseline with `--create-only`, edit it, mark it applied, deploy: a no-op on the existing database, and a fresh database built from it has the same tables.                                      | Works (verified)                                              |
| 6   | Editing the baseline after it was marked applied makes `deploy` refuse with a checksum mismatch.                                                                                                           | Works as designed (verified) — dictates the step order in §4  |
| 7   | A new native migration after the baseline applies cleanly to both the dev database and the "production" copy; existing rows and the join table survive.                                                    | Works (verified)                                              |
| 8   | Rollback before any new native migration — restore the folder, drop the two tracking tables — returns the old engine to a clean `migrate status` and a working `migrate dev`.                              | Works (verified)                                              |

Findings 1 and 2 are why `--native` / `ZENSTACK_NATIVE_MIGRATE` cannot be the long-term switch:
a flag that varies per invocation lets one developer or one CI job run the wrong engine against
a shared database.

## 2. Supporting both engines

### Engine selection

- Add `zenstack.migration.engine: "prisma" | "native"` to `package.json`, beside the existing
  `schema` / `output` / `seed` keys read by `getPkgJsonConfig`.
- Resolution order: `--native` flag or `ZENSTACK_NATIVE_MIGRATE` (preview override only), then
  the setting, then detection.
- **Detection when the setting is absent:** a migrations folder containing `migration_lock.toml`
  or any `*/migration.sql` means `prisma`; otherwise `native` once the default has flipped
  (Phase 3), and `prisma` before that.

### Folders and tables

|                 | Old engine                                                                | Native engine                                   |
| --------------- | ------------------------------------------------------------------------- | ----------------------------------------------- |
| Migration files | `zenstack/migrations-prisma/` after adoption (was `zenstack/migrations/`) | `zenstack/migrations/`                          |
| History table   | `_prisma_migrations` (left untouched)                                     | `zenstack_migration`, `zenstack_migration_lock` |

The old engine requires its folder to be named `migrations` (by reading: it derives the Prisma
schema location from the parent of `--migrations`), so the archived history cannot be run in
place; rollback moves it back. The native engine already ignores `_prisma_migrations`
when introspecting (`isBookkeepingTable`).

### Guards

- Native engine, any command that touches the database: refuse when `_prisma_migrations` exists
  and `zenstack_migration` does not, and point to `migrate adopt`. Today this surfaces as
  finding 3.
- Native `generate` / `baseline`: refuse when the target folder contains Prisma history.
- Old engine: refuse when `zenstack_migration` exists, and say the project has been adopted.
  Today this surfaces as finding 2, where Prisma offers to reset the database.

### `migrate adopt`

One idempotent command that replaces the manual steps in §4:

1. Check that every Prisma migration is applied (`_prisma_migrations.finished_at` set, none
   rolled back) and that the schema has no pending changes.
2. Move the Prisma history to `zenstack/migrations-prisma/`.
3. Generate the baseline without applying it, list anything in the old `migration.sql` files
   that the snapshot does not express (see §5, "Baseline fidelity"), and stop for review unless
   `--yes` is passed.
4. Verify fidelity: compare the snapshot against the introspected live schema and report
   differences. The deep introspector in `tests/e2e/migration/support/physical-schema.ts`
   already does this comparison for the parity suite and should move into the package.
5. Mark the baseline applied and write the engine setting.

Against a database that already has the baseline recorded it does nothing. Against a fresh
database it does nothing either (there is no `_prisma_migrations`), so it is safe to leave in a
deploy pipeline for the cutover release: `migrate adopt --yes && migrate deploy`.

## 3. Release phases

| Phase                       | Who uses the native engine                    | What ships                                                                                                                                           | Exit gate                                                                                                                             |
| --------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Preview** (next minor) | New projects, opt-in by flag                  | The engine as it is, plus the Phase 1 items in §6. Banner stays.                                                                                     | Findings 1 and 3 closed; package published at the workspace version                                                                   |
| **2. Beta**                 | Existing projects, opt-in via `migrate adopt` | Engine setting, guards, `adopt`, migration guide. Banner downgraded to a one-line notice.                                                            | Adopt path green in CI on all three providers for the cal.com, formbricks and trigger.dev schemas; failed-migration state implemented |
| **3. Default**              | New projects by default; adopted projects     | Detection default flips to `native`; `zen init` and `create-zenstack` write the setting; the old engine prints a deprecation notice on every command | Telemetry shows adopt succeeding and old-engine usage falling; no open data-loss bug                                                  |
| **4. Removal** (v4)         | Everyone                                      | Prisma path and the `prisma` dependency removed; `adopt` kept for one more major, reading `_prisma_migrations` directly                              | —                                                                                                                                     |

Each phase should last at least one minor release so that feedback from the previous one can
land before the next gate.

## 4. Migrating a project (user guide)

These steps work today with the flag. Once `migrate adopt` exists it replaces local steps 2–6
and the production step 2. All of them were run end to end on SQLite (findings 5–8).

### Before starting, in every environment

- Every old migration is applied: `zen migrate status` is clean.
- The schema has no pending changes: `zen migrate dev` reports nothing to do.
- Schema changes are frozen until production is cut over.
- The database is backed up.

### Local development — one person, once

1. Confirm the preconditions above on the dev database.
2. Move the Prisma history aside:

    ```bash
    git mv zenstack/migrations zenstack/migrations-prisma
    ```

3. Author the baseline without applying it:

    ```bash
    zen migrate dev --native --create-only --name baseline
    ```

4. Edit `zenstack/migrations/<timestamp>_baseline/migration.ts` to port anything the old
   `migration.sql` files did by hand: extensions, views, triggers, partial or expression
   indexes, check constraints, seed rows. This only matters for databases created from scratch
   later (CI, new developers, preview environments). **Do it before the next step** — the
   checksum is recorded when the migration is marked applied (finding 6).
5. Mark it applied on the existing dev database. This creates the two tracking tables and one
   row; no table of yours is touched:

    ```bash
    zen migrate resolve --native --applied <timestamp>_baseline
    ```

6. Verify fidelity. Point `DATABASE_URL` at an empty database, run `zen migrate deploy --native`,
   and diff its schema against the existing one (`pg_dump --schema-only`, `mysqldump --no-data`,
   or `sqlite3 .schema`). Apart from the bookkeeping tables there should be no difference; fix
   the baseline and repeat from step 3 if there is.
7. Switch the project: set the engine (today: `ZENSTACK_NATIVE_MIGRATE=1` in `.env` and CI),
   update `package.json` scripts, commit the baseline and the moved folder together.
8. Teammates pull, then either run step 5 against their own database or rebuild it with
   `zen migrate reset --native`.

### Staging, then production — once per database

1. Ship the last old-engine release and confirm `zen migrate status` is clean. The database must
   be exactly at the state the baseline describes.
2. Mark the baseline applied, as a one-off step before the first native deploy:

    ```bash
    zen migrate resolve --native --applied <timestamp>_baseline
    ```

3. Check: `zen migrate status --native` shows the baseline applied and nothing pending.
4. Switch the pipeline from `zen migrate deploy` to `zen migrate deploy --native`. The deploy
   image needs the database driver (`pg`, `mysql2` or `better-sqlite3`), the migrations folder,
   the ZModel, and a writable schema output folder — the CLI regenerates `schema.ts` on every
   command (see §5).
5. Send the first real native migration through staging before production.

Do not put step 2 in a pipeline as it stands: run against a fresh database it would mark the
baseline applied without creating any table. That is what `migrate adopt` is for.

### Rollback

- **Before the first post-baseline migration is applied** (finding 8): move
  `zenstack/migrations-prisma` back to `zenstack/migrations`, unset the engine, and drop
  `zenstack_migration` and `zenstack_migration_lock`. Dropping them is required in development,
  where the old `migrate dev` treats them as drift; the old `migrate deploy` in production does
  not check for drift.
- **After it:** roll forward only. Returning to the old engine means re-baselining Prisma
  (`prisma migrate diff` into a new migration, then `prisma migrate resolve --applied`).

### After the cutover

Keep `zenstack/migrations-prisma/` and the `_prisma_migrations` table for at least one release
cycle, then delete both by hand. Nothing in the native engine reads them.

## 5. Other things to settle

### Baseline fidelity

The snapshot only describes what ZModel expresses and the engine models. Anything else is left
alone in an adopted database, but a database created from the baseline will lack it, and
`db push` may treat it as a stray.

- **Not modelled today (by reading `snapshot.ts`):** `@@schema` (multi-schema on PostgreSQL),
  index options (`type`, `sort`, `length`, `clustered`), `@@fulltext`, views, and columns of
  `Unsupported` type.
- **Never expressible in ZModel:** extensions, triggers, check constraints, partial indexes,
  anything hand-written into a Prisma `migration.sql`.
- **Older Prisma layouts:** constraint and index names follow Prisma's current conventions. A
  database first created by a much older Prisma can differ; the one known case — the
  many-to-many `_AB_unique` index on PostgreSQL from Prisma < 6 — is handled in `db push` and
  noted in `TODO.md`.

`migrate adopt` step 4 exists to surface all of this before the baseline is recorded.

### Engine gaps that gate Phase 2

From `TODO.md`: failed-migration state (a migration that fails midway is retried on a partially
applied database), drift detection in `migrate dev`, FK constraint names after a table rename,
index renames on MySQL when the index backs a foreign key, and `db push` detecting only
name-level changes.

### Breaking change already on this branch

`$pushSchema` is removed from the ORM client (`packages/orm/src/client/contract.ts`). It is
tagged private, but it was callable by anyone and is a natural way to create a schema in a
user's own tests, so some projects will be calling it. Either keep it as a
deprecated shim for one minor or announce the replacement (`pushSchemaToDatabase` in
`@zenstackhq/testtools`) in `BREAKINGCHANGES.md`.

### Production footprint of `deploy`

`prepareEngine` compiles the ZModel and loads `schema.ts` through jiti for every command,
including `deploy` and `status`, which only need the provider — and the provider is already in
`snapshot.json`. A snapshot-only path would let a production image carry just the migrations
folder and a driver. The programmatic `engine.deploy()` covers serverless start-up.

### Smaller items

- `ignoreChecksumMismatch` exists on the engine but has no CLI flag.
- Prisma-style `?schema=` connection URLs are not handled anywhere in the engine; check
  behaviour on a non-`public` schema before Phase 2.
- A project already on the preview engine with a many-to-many relation will see its join table
  as new on the next `migrate dev`. That is correct if the table is missing and fails with
  "already exists" if Prisma had created it; worth a release note for Phase 1.

### Release mechanics

- `@zenstackhq/migration` is at 3.8.3 while the workspace is at 3.10.0; align it before the
  first publish. `publish-all` already covers everything under `packages/`.
- Tag every `migrate` / `db push` telemetry event with the engine, and record `adopt` outcomes
  and failure reasons. The Phase 3 gate depends on these numbers.

### Documentation

A migration guide built from §4, the `zenstack-db-migration` skill, `zen init` and
`create-zenstack` templates, the CLI help text for `--native`, and the "Database migrations
still use Prisma CLI under the hood" line in the root `CLAUDE.md`.

## 6. Work items

### Phase 1 — Preview

- [x] Model implicit many-to-many join tables (finding 4)
- [ ] Native engine refuses a database with `_prisma_migrations` and no `zenstack_migration`
      (finding 3)
- [ ] Native engine refuses to write into a folder holding Prisma history (finding 1)
- [ ] Align the package version and publish
- [ ] Release note for preview users with many-to-many relations
- [ ] Decide the `$pushSchema` shim

### Phase 2 — Beta

- [ ] `zenstack.migration.engine` setting and resolution order
- [ ] Old engine refuses a database with `zenstack_migration` (finding 2)
- [ ] `migrate adopt`, including the fidelity check
- [ ] Move the physical-schema introspector into the package
- [ ] CI job: Prisma builds a database, adopt, build a fresh one natively, compare — for the
      three real-world schemas on all three providers
- [ ] Failed-migration state and a recovery path
- [ ] Multi-schema and index-option support, or an explicit refusal in `adopt`
- [ ] `--ignore-checksum-mismatch` CLI flag
- [ ] Migration guide; telemetry tagging

### Phase 3 — Default

- [ ] Flip detection default to `native`
- [ ] Templates write the engine setting
- [ ] Deprecation notice on the old engine
- [ ] Snapshot-only `deploy` / `status`

### Phase 4 — Removal (v4)

- [ ] Remove `migrate.ts` Prisma path, `--native`, `ZENSTACK_NATIVE_MIGRATE`, and the `prisma`
      dependency of the CLI
- [ ] `adopt` reads `_prisma_migrations` without Prisma

## 7. Open decisions

1. **Setting location** — `package.json` (proposed, matches existing config) or a future
   `zenstack.config.ts`.
2. **Archive folder name** — `zenstack/migrations-prisma/` (proposed) or delete the history
   outright after adoption and rely on git.
3. **Removal in v4 or later** — depends on the Phase 3 telemetry.
4. **Whether `adopt` should offer to carry old `migration.sql` text into the baseline** as raw
   SQL, instead of asking the user to port it by hand.

## Appendix A: reproducing the cutover test

Scaffold a project whose `node_modules` links the workspace packages (as
`createTestProject` in `@zenstackhq/testtools` does), with this schema and
`DATABASE_URL=file:/abs/path/dev.db`:

```zmodel
datasource db {
    provider = 'sqlite'
    url      = env('DATABASE_URL')
}

model User {
    id    String @id @default(cuid())
    email String @unique
    posts Post[]
}

model Post {
    id       String @id @default(cuid())
    title    String
    author   User   @relation(fields: [authorId], references: [id], onDelete: Cascade)
    authorId String
    tags     Tag[]

    @@index([authorId])
}

model Tag {
    id    String @id @default(cuid())
    name  String @unique
    posts Post[]
}
```

Then, with `zen` standing for `node packages/cli/dist/index.mjs`:

| Step | Command                                                                               | Shows                                          |
| ---- | ------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 1    | `zen migrate dev --name init`, then copy `dev.db` to `prod.db`                        | Prisma-built database and a "production" copy  |
| 2    | `zen migrate baseline --native --name baseline`                                       | Finding 1 set-up: both histories in one folder |
| 3    | `zen migrate status`, `zen migrate deploy`                                            | Finding 1                                      |
| 4    | With `DATABASE_URL` at `prod.db`: `zen migrate deploy --native`                       | Finding 3                                      |
| 5    | `zen migrate resolve --native --applied <baseline>`, then `deploy --native`           | Finding 5                                      |
| 6    | With `DATABASE_URL` at a new file: `zen migrate deploy --native`                      | Fresh database; finding 4                      |
| 7    | With `DATABASE_URL` at a copy of `prod.db`: `zen db push --native --accept-data-loss` | Finding 4                                      |
| 8    | Add a column, `zen migrate dev --native --name add_views`, deploy to `prod.db`        | Finding 7                                      |
| 9    | Move the native folders out, then `zen migrate dev --name x` and `zen db push`        | Finding 2                                      |

The recommended flow in §4 (findings 5, 6 and 8) is the same project with the Prisma folder
moved aside first and the baseline authored with `--create-only`.

Note for anyone rerunning this from an AI coding agent: Prisma refuses `migrate reset` in that
context without explicit user consent, so the old-engine reset path cannot be exercised there.
