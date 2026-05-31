# @zenstackhq/plugin-soft-delete

A ZenStack runtime plugin that implements **soft delete** by intercepting Kysely queries. Instead of physically removing rows, delete operations mark them with a timestamp, and reads automatically exclude the marked rows.

## How It Works

The plugin works off a single `@deletedAt` marker field on each model that should support soft deletion:

- **Deletes become updates** — a `delete`/`deleteMany` against a soft-delete model is rewritten to set the `@deletedAt` field to the current timestamp instead of issuing a `DELETE`.
- **Reads are filtered** — `find*` queries (and joined relations) automatically add a `<deletedAt> IS NULL` condition, so soft-deleted rows are invisible.
- **Updates skip tombstones** — `update`/`updateMany` won't touch rows that are already soft-deleted.

Models without a `@deletedAt` field are left completely untouched.

## Installation

```bash
npm install @zenstackhq/plugin-soft-delete
```

## Usage

### 1. Declare the plugin in your ZModel schema

This makes the `@deletedAt` attribute available in your schema.

```zmodel
plugin softDelete {
    provider = '@zenstackhq/plugin-soft-delete'
}
```

### 2. Mark a nullable `DateTime` field with `@deletedAt`

A model can have at most one `@deletedAt` field, and it must be optional (so that "not deleted" is represented by `null`).

```zmodel
model User {
    id        Int       @id @default(autoincrement())
    email     String    @unique
    posts     Post[]
    deletedAt DateTime? @deletedAt
}

model Post {
    id        Int       @id @default(autoincrement())
    title     String
    author    User      @relation(fields: [authorId], references: [id])
    authorId  Int
    deletedAt DateTime? @deletedAt
}
```

### 3. Install the plugin on your client at runtime

```ts
import { ZenStackClient } from '@zenstackhq/orm';
import { SoftDeletePlugin } from '@zenstackhq/plugin-soft-delete';
import { schema } from './schema';

const db = new ZenStackClient(schema, { ... }).$use(new SoftDeletePlugin());

const user = await db.user.create({ data: { email: 'a@example.com' } });

// rewritten to set `deletedAt`, the row is kept in the database
await db.user.delete({ where: { id: user.id } });

// returns `null` — soft-deleted rows are hidden from reads
await db.user.findUnique({ where: { id: user.id } });
```

## Caveats

- **Soft deletes do not cascade.** Children of a soft-deleted parent are left untouched — managing them is up to you. (Note that a *hard* delete on a model without `@deletedAt` still triggers database-level `onDelete: Cascade` as usual.)
- **Multi-table / joined deletes can't be rewritten.** A joined or multi-table `DELETE` that targets a soft-delete model is rejected rather than silently hard-deleting rows. Use a single-table delete instead.
- **Unique constraints and tombstones.** Because soft-deleted rows physically remain, a plain `@unique` field will reject reusing a value held by a tombstone. The common mitigation is a partial unique index scoped to live rows (e.g. `... WHERE "deletedAt" IS NULL` on PostgreSQL/SQLite, or a functional index over a `CASE` expression on MySQL).

## Learn More

- [ZenStack Documentation](https://zenstack.dev)
