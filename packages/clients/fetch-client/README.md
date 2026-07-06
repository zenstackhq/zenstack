# @zenstackhq/fetch-client

A lightweight, type-safe fetch-based client for consuming ZenStack's RPC-style auto CRUD API. Provides the same model and operation surface as the server-side `ZenStackClient`, but issues HTTP requests instead of running queries locally.

## Installation

```bash
npm install @zenstackhq/fetch-client
```

## Usage

```typescript
import { createClient } from '@zenstackhq/fetch-client';
import { schema } from './schema';

const client = createClient(schema, {
    endpoint: 'https://example.com/api/model',
});

const users = await client.user.findMany({ where: { active: true } });
const post = await client.post.create({ data: { title: 'Hello' } });

const [user, newPost] = await client.$transaction([
    { model: 'User', op: 'create', args: { data: { email: 'alice@example.com' } } },
    { model: 'Post', op: 'create', args: { data: { title: 'Hello' } } },
]);
```

## Learn More

- [ZenStack Documentation](https://zenstack.dev/docs/service/client-sdk/fetch-client)
