# ZenStack Better-Auth Adapter

This package provides a database adapter for [better-auth](https://better-auth.com). It allows you to use ZenStack ORM as the database backend for better-auth.

## Installation

```bash
npm install @zenstackhq/better-auth@next
```

## Configuration

```ts
import { zenstackAdapter } from '@zenstackhq/better-auth';

// ZenStack ORM client
import { db } from './db';

const auth = new BetterAuth({
    database: zenstackAdapter(db, {
        provider: 'postgresql', // or 'sqlite'
    }),
    // other better-auth options...
});
```

## Schema generation

You can use the `auth` CLI (formerly `@better-auth/cli`) to populate better-auth's data models into your ZModel schema.

```bash
npx auth generate
```
