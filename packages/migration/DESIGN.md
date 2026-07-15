# ZenStack Native Migration Engine — Design Notes

ZenStack v3 has so far delegated migrations to the Prisma CLI. We've been building a **native migration engine** (`@zenstackhq/migration`) that authors and applies migrations directly from your ZModel schema — no Prisma dependency, no Rust/WASM binaries, pure TypeScript on top of Kysely. It's currently opt-in via `--native` (or `ZENSTACK_NATIVE_MIGRATE=1`). Here's how it works and why we built it this way.

## The core idea: snapshot diffing, no shadow database

Every generated migration folder contains two files:

- `snapshot.json` — a stable, physical description of the schema *after* the migration (tables, columns, indexes, FKs, enums)
- `migration.ts` — a TypeScript `migrate(db)` function that performs the change

To author a new migration, the engine diffs the latest recorded snapshot against your current schema. That's it. **Prisma needs a shadow database** for `migrate dev` — it replays your whole migration history into a temp DB to figure out the current state. We never need one, because the state is recorded declaratively alongside each migration. (Drizzle-kit made the same call, and we think it's the right one — diffing is deterministic, works offline, and doesn't need DB permissions to create databases.)

## Migrations are TypeScript, not SQL

A generated migration looks like this:

```ts
export async function migrate(db: Kysely<any>): Promise<void> {
    await db.schema.alterTable('User').addColumn('age', 'integer').execute();
    // edit freely — add data backfills right here
    await db.updateTable('User').set({ age: 0 }).execute();
}
```

Why TS instead of `.sql` files (which both Prisma and Drizzle generate)?

- **Schema changes and data migrations live in one place.** Backfilling a new column, transforming values before a type change, seeding — all in the same file, type-checked, with the full Kysely query builder available.
- **It's editable with confidence.** The file is plain code; your editor and `tsc` catch mistakes. Raw SQL is still one `` sql`...` `` away when you need it.
- **Checksummed history keeps it honest.** Each applied migration's SHA-256 is recorded in the `zenstack_migration` table; `migrate deploy` refuses to run if an already-applied migration was edited after the fact (same guarantee as Prisma's `_prisma_migrations`).

## One diff, two backends

The differ produces a typed list of `SchemaChange` objects (`create-table`, `alter-column`, `recreate-enum`, `rebuild-table`, …). That single IR feeds two consumers:

- **codegen** — renders `migration.ts` text for `migrate dev`/`deploy`
- **applier** — executes the changes directly against a live connection for `db push` (state-based prototyping sync, with data-loss detection and consent)

So the diffing logic is written once and behaves identically in both flows.

## Rename detection — data preserved

When a table or column disappears and another appears, that's ambiguous: rename, or drop + create? The engine surfaces exactly these ambiguous pairs to a **rename resolver** (the CLI prompts you interactively; CI defaults to drop + create). A confirmed rename becomes a real `RENAME`, preserving data — and the diff then reconciles the renamed table's contents, so a rename combined with other changes still works.

**Prisma cannot do this** — a renamed model is always drop + create, and your data is gone. Drizzle prompts similarly to us.

## Providers get their native idiom, not lowest-common-denominator SQL

Postgres, MySQL, and SQLite are all first-class, and the differ lowers the *same logical change* into whatever each engine can actually do. Enum value changes are a nice case study:

- **Postgres**: appended values use `ALTER TYPE … ADD VALUE`. Removal/reorder is harder — pg can't drop enum values in place — so we recreate the type Prisma-style: create `Role_new`, cast every using column over (`USING col::text::"Role_new"`, dropping/restoring defaults around the cast), swap names, drop the old type.
- **MySQL**: enums are inline in the column type, so the change lowers to a `MODIFY COLUMN … enum('A','B')` per using column, restating defaults/nullability.
- **SQLite**: enums are plain text — a value change is a no-op. And since SQLite barely supports `ALTER`, any in-place change there becomes a safe **table rebuild** (create temp table, copy data, swap), which handles column, PK, and FK changes uniformly.

Same story elsewhere: primary-key moves are an automated drop + re-add of the deterministically-named constraint on pg/mysql (Drizzle leaves the drop as a manual step here), and MySQL's quirks (no granular `ALTER COLUMN`, ignored inline `REFERENCES`, FK-backing indexes) are handled explicitly.

When a change genuinely can't be automated, it degrades gracefully: the generated migration contains a `// TODO: unsupported…` comment describing exactly what to hand-author, and the CLI warns — it never silently drops your intent.

## Prisma-compatible physical output — adoption is a baseline, not a rewrite

The engine emits the same physical schema Prisma would: identical default type mappings, constraint/index naming conventions, and the 63/64-char identifier truncation (verified against Prisma v7). Combined with `migrate baseline` / `resolve --applied`, you can point it at an existing Prisma-managed database and adopt it without recreating anything.

## Quick comparison

**vs Prisma Migrate**
- No shadow database; no Rust engine — pure TS
- Data-preserving renames (Prisma: drop + create)
- TS migrations with a query builder (Prisma: SQL files)
- Same: checksummed history, roll-forward-only philosophy, fails loudly if data violates a narrowing change (e.g. removed enum value still in rows)

**vs Drizzle Kit**
- Same snapshot-diffing foundation and interactive rename prompts
- TS migrations instead of SQL text files
- More automation on hard alters (pg enum removal, PK moves) instead of leaving manual steps
- Schema source is ZModel (with access policies, validation, polymorphism) rather than TS table definitions

## What's still cooking

Being transparent about the gaps vs Prisma before this becomes the default: failed-migration state tracking (mid-failure recovery), drift detection in `migrate dev`, data-loss warnings when generating (push already has them), `migrate diff`, and a guided `migrate adopt` for one-command cutover from Prisma-managed databases. Down migrations are intentionally not planned (roll-forward by design, same as Prisma).

Feedback very welcome — especially if you try `--native` on a real project.
