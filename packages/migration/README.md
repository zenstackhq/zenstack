# @zenstackhq/migration

ZenStack's native database schema migration engine.

It diffs stable JSON snapshots of a compiled ZenStack schema to author migrations, and
runs them with [Kysely](https://kysely.dev)'s migrator. Each migration is a folder:

```
migrations/
  20260101000000_init/
    snapshot.json         # stable schema snapshot after this migration
    migration.ts          # exports `migrate(db)` (+ optional before/afterMigrate)
    schema-before.d.ts     # Kysely typing of the schema before this migration
    schema-after.d.ts      # Kysely typing of the schema after this migration
```

- `migrate(db)` performs the schema (DDL) changes.
- `beforeMigrate(db)` / `afterMigrate(db)` are optional data-transformation hooks, typed
  against the schema *before* / *after* the migration respectively.

Migrations are forward-only (no down migrations); recovery is done by rolling forward.
