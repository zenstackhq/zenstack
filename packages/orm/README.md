# @zenstackhq/orm

The core ZenStack ORM engine, built on top of [Kysely](https://kysely.dev/). Provides a type-safe database client (`ZenStackClient`) with a high-level, [Prisma](https://prisma.io/)-compatible CRUD API and direct access to the underlying Kysely query builder for advanced queries.

## Key Features

- **Type-safe CRUD operations** generated from your ZModel schema
- **Plugin system** for query interception and entity mutation hooks
- **Multi-dialect support** — SQLite (better-sqlite3), PostgreSQL (pg), and MySQL (mysql2)
- **Computed fields** evaluated at the database level
- **Custom procedures** for encapsulating complex queries and mutations

## Installation

```bash
npm install @zenstackhq/orm
```

## Usage

```typescript
import { ZenStackClient } from '@zenstackhq/orm';
import schema from './schema';

const client = new ZenStackClient(schema, {
    /* dialect config */
});

const user = await client.user.findFirst({ where: { email: 'alice@example.com' } });
```

## Learn More

- [ZenStack Documentation](https://zenstack.dev/docs)
