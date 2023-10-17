<div align="center">
    <a href="https://zenstack.dev">
    <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/zenstackhq/zenstack-docs/main/static/img/logo-dark.png">
    <img src="https://raw.githubusercontent.com/zenstackhq/zenstack-docs/main/static/img/logo.png" height="128">
    </picture>
    </a>
    <h1>ZenStack</h1>
    <a href="https://www.npmjs.com/package/zenstack">
        <img src="https://img.shields.io/npm/v/zenstack">
    </a>
    <img src="https://github.com/zenstackhq/zenstack/actions/workflows/build-test.yml/badge.svg">
    <a href="https://twitter.com/zenstackhq">
        <img src="https://img.shields.io/twitter/url?style=social&url=https%3A%2F%2Fgithub.com%2Fzenstackhq%2Fzenstack">
    </a>
    <a href="https://go.zenstack.dev/chat">
        <img src="https://img.shields.io/discord/1035538056146595961">
    </a>
    <a href="https://github.com/zenstackhq/zenstack/blob/main/LICENSE">
        <img src="https://img.shields.io/badge/license-MIT-green">
    </a>
</div>

## What it is

ZenStack is a Node.js/TypeScript toolkit that simplifies the development of a web app's backend. It supercharges [Prisma ORM](https://prisma.io) with a powerful access control layer and unleashes its full potential for full-stack development.

Our goal is to let you save time writing boilerplate code and focus on building real features!

## How it works

> Read full documentation at 👉🏻 [zenstack.dev](https://zenstack.dev).

ZenStack incrementally extends Prisma's power with the following four layers:

### 1. ZModel - an extended Prisma schema language

ZenStack introduces a data modeling language called "ZModel" - a superset of Prisma schema language. It extended Prisma schema with custom attributes and functions and, based on that, implemented a flexible access control layer around Prisma.

```prisma
// schema.zmodel

model Post {
    id String @id
    title String
    published Boolean @default(false)
    author User @relation(fields: [authorId], references: [id])
    authorId String

    // 🔐 allow logged-in users to read published posts
    @@allow('read', auth() != null && published)

    // 🔐 allow full CRUD by author
    @@allow('all', author == auth())
}
```

The `zenstack` CLI transpiles the ZModel into a standard Prisma schema, which you can use with the regular Prisma workflows.

### 2. Runtime enhancements to Prisma client

At runtime, transparent proxies are created around Prisma clients for intercepting queries and mutations to enforce access policies.

```ts
import { enhance } from '@zenstackhq/runtime';

// a regular Prisma client
const prisma = new PrismaClient();

async function getPosts(userId: string) {
    // create an enhanced Prisma client that has access control enabled
    const enhanced = enhance(prisma, { user: userId });

    // only posts that're visible to the user will be returned
    return enhanced.post.findMany();
}
```

### 3. Automatic RESTful APIs through server adapters

Server adapter packages help you wrap an access-control-enabled Prisma client into backend CRUD APIs that can be safely called from the frontend. Here's an example for Next.js:

```ts
// pages/api/model/[...path].ts

import { requestHandler } from '@zenstackhq/next';
import { enhance } from '@zenstackhq/runtime';
import { getSessionUser } from '@lib/auth';
import { prisma } from '@lib/db';

// Mount Prisma-style APIs: "/api/model/post/findMany", "/api/model/post/create", etc.
// Can be configured to provide standard RESTful APIs (using JSON:API) instead.
export default requestHandler({
    getPrisma: (req, res) => enhance(prisma, { user: getSessionUser(req, res) }),
});
```

### 4. Generated client libraries (hooks) for data access

Plugins can generate strong-typed client libraries that talk to the aforementioned APIs. Here's an example for React:

```tsx
// components/MyPosts.tsx

import { useFindManyPost } from '@lib/hooks';

const MyPosts = () => {
    // list all posts that're visible to the current user, together with their authors
    const { data: posts } = useFindManyPost({
        include: { author: true },
        orderBy: { createdAt: 'desc' },
    });

    return (
        <ul>
            {posts?.map((post) => (
                <li key={post.id}>
                    {post.title} by {post.author.name}
                </li>
            ))}
        </ul>
    );
};
```

## Architecture

The following diagram gives a high-level architecture overview of ZenStack.

![Architecture](https://zenstack.dev/img/architecture-light.png)

## Links

-   [Home](https://zenstack.dev)
-   [Documentation](https://zenstack.dev/docs)
-   [Community chat](https://go.zenstack.dev/chat)
-   [Twitter](https://twitter.com/zenstackhq)
-   [Blog](https://zenstack.dev/blog)

## Features

-   Access control and data validation rules right inside your Prisma schema
-   Auto-generated OpenAPI (RESTful) specifications, services, and client libraries
-   End-to-end type safety
-   Extensible: custom attributes, functions, and a plugin system
-   A framework-agnostic core with framework-specific adapters
-   Uncompromised performance

### Plugins

-   Prisma schema generator
-   Zod schema generator
-   [SWR](https://github.com/vercel/swr) and [TanStack Query](https://github.com/TanStack/query) hooks generator
-   OpenAPI specification generator
-   [tRPC](https://trpc.io) router generator
-   🙋🏻 [Request for a plugin](https://go.zenstack.dev/chat)

### Framework adapters

-   [Next.js](https://zenstack.dev/docs/reference/server-adapters/next) (including support for the new "app directory" in Next.js 13)
-   [SvelteKit](https://zenstack.dev/docs/reference/server-adapters/sveltekit)
-   [Fastify](https://zenstack.dev/docs/reference/server-adapters/fastify)
-   [ExpressJS](https://zenstack.dev/docs/reference/server-adapters/express)
-   Nuxt.js (Future)
-   🙋🏻 [Request for an adapter](https://go.zenstack.dev/chat)

### Prisma schema extensions

-   [Custom attributes and functions](https://zenstack.dev/docs/reference/zmodel-language#custom-attributes-and-functions)
-   [Multi-file schema and model inheritance](https://zenstack.dev/docs/guides/multiple-schema)
-   Strong-typed JSON field (coming soon)
-   Polymorphism (future)
-   🙋🏻 [Request for an extension](https://go.zenstack.dev/chat)

## Examples

Check out the [Collaborative Todo App](https://zenstack-todo.vercel.app/) for a running example. You can find different implementations below:

-   [Next.js + SWR hooks](https://github.com/zenstackhq/sample-todo-nextjs)
-   [Next.js + TanStack Query](https://github.com/zenstackhq/sample-todo-nextjs-tanstack)
-   [Next.js + tRPC](https://github.com/zenstackhq/sample-todo-trpc)
-   [SvelteKit + TanStack Query](https://github.com/zenstackhq/sample-todo-sveltekit)

## Community

Join our [discord server](https://discord.gg/Ykhr738dUe) for chat and updates!

## Contributing

If you like ZenStack, join us to make it a better tool! Please use the [Contributing Guide](CONTRIBUTING.md) for details on how to get started, and don't hesitate to join [Discord](https://discord.gg/Ykhr738dUe) to share your thoughts.

## License

[MIT](LICENSE)
