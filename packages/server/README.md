# @zenstackhq/server

Automatic CRUD API handlers and server adapters for ZenStack. Exposes your ZenStack ORM as RESTful or RPC-style API endpoints with built-in OpenAPI spec generation.

## Supported Frameworks

- **Express**
- **Fastify**
- **Next.js**
- **Nuxt**
- **SvelteKit**
- **Hono**
- **Elysia**
- **TanStack Start**

## API Styles

- **REST** — Resource-oriented endpoints with [JSON:API](https://jsonapi.org/) support
- **RPC** — Procedure-call style endpoints

## Installation

```bash
npm install @zenstackhq/server
```

## Usage (Express example)

```typescript
import express from 'express';
import { ZenStackMiddleware } from '@zenstackhq/server/express';
import { RPCApiHandler } from '@zenstackhq/server/api';

const app = express();
app.use('/api/model', ZenStackMiddleware({...}));
```

## Learn More

- [ZenStack Documentation](https://zenstack.dev/docs)
