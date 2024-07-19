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
    <a href="https://www.npmjs.com/package/zenstack">
        <img src="https://img.shields.io/npm/dm/zenstack">
    </a>
    <img src="https://github.com/zenstackhq/zenstack/actions/workflows/build-test.yml/badge.svg">
    <a href="https://twitter.com/zenstackhq">
        <img src="https://img.shields.io/twitter/url?style=social&url=https%3A%2F%2Fgithub.com%2Fzenstackhq%2Fzenstack">
    </a>
    <a href="https://discord.gg/Ykhr738dUe">
        <img src="https://img.shields.io/discord/1035538056146595961">
    </a>
    <a href="https://github.com/zenstackhq/zenstack/blob/main/LICENSE">
        <img src="https://img.shields.io/badge/license-MIT-green">
    </a>
</div>

## What it is

ZenStack is a Node.js/TypeScript toolkit that simplifies the development of a web app's backend. It enhances [Prisma ORM](https://prisma.io) with a flexible Authorization layer and auto-generated, type-safe APIs/hooks, unlocking its full potential for full-stack development.

Our goal is to let you save time writing boilerplate code and focus on building real features!

## How it works

> Read full documentation at 👉🏻 [zenstack.dev](https://zenstack.dev). Join [Discord](https://discord.gg/Ykhr738dUe) for feedback and questions.

ZenStack incrementally extends Prisma's power with the following four layers:

### 1. ZModel - an extended Prisma schema language

ZenStack introduces a data modeling language called "ZModel" - a superset of Prisma schema language. It extended Prisma schema with custom attributes and functions and, based on that, implemented a flexible access control layer around Prisma.

```ts
// base.zmodel
abstract model Base {
    id String @id
    author User @relation(fields: [authorId], references: [id])
    authorId String

    // 🔐 allow full CRUD by author
    @@allow('all', author == auth())
}
```

```ts
// schema.zmodel
import "base"
model Post extends Base {
    title String
    published Boolean @default(false)

    // 🔐 allow logged-in users to read published posts
    @@allow('read', auth() != null && published)
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
-   [Community chat](https://discord.gg/Ykhr738dUe)
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
-   🙋🏻 [Request for a plugin](https://discord.gg/Ykhr738dUe)

### Framework adapters

-   [Next.js](https://zenstack.dev/docs/reference/server-adapters/next) (including support for the new "app directory" in Next.js 13)
-   [Nuxt](https://zenstack.dev/docs/reference/server-adapters/nuxt)
-   [SvelteKit](https://zenstack.dev/docs/reference/server-adapters/sveltekit)
-   [Fastify](https://zenstack.dev/docs/reference/server-adapters/fastify)
-   [ExpressJS](https://zenstack.dev/docs/reference/server-adapters/express)
-   [NestJS](https://zenstack.dev/docs/reference/server-adapters/nestjs)
-   🙋🏻 [Request for an adapter](https://discord.gg/Ykhr738dUe)

### Prisma schema extensions

-   [Custom attributes and functions](https://zenstack.dev/docs/reference/zmodel-language#custom-attributes-and-functions)
-   [Multi-file schema and model inheritance](https://zenstack.dev/docs/guides/multiple-schema)
-   [Polymorphic Relations](https://zenstack.dev/docs/guides/polymorphism)
-   Strong-typed JSON field (coming soon)
-   🙋🏻 [Request for an extension](https://discord.gg/Ykhr738dUe)

## Examples

### Schema Samples

The [sample repo](https://github.com/zenstackhq/authz-modeling-samples) includes the following patterns:

-   ACL
-   RBAC
-   ABAC
-   Multi-Tenancy

You can use [this blog post](https://zenstack.dev/blog/model-authz) as an introduction.

### Multi-Tenant Todo App

Check out the [Multi-tenant Todo App](https://zenstack-todo.vercel.app/) for a running example. You can find different implementations below:

-   [Next.js 13 + NextAuth + SWR](https://github.com/zenstackhq/sample-todo-nextjs)
-   [Next.js 13 + NextAuth + TanStack Query](https://github.com/zenstackhq/sample-todo-nextjs-tanstack)
-   [Next.js 13 + NextAuth + tRPC](https://github.com/zenstackhq/sample-todo-trpc)
-   [Nuxt V3 + TanStack Query](https://github.com/zenstackhq/sample-todo-nuxt)
-   [SvelteKit + TanStack Query](https://github.com/zenstackhq/sample-todo-sveltekit)
-   [RedwoodJS](https://github.com/zenstackhq/sample-todo-redwood)

### Blog App

-   [Next.js 13 + Pages Route + SWR](https://github.com/zenstackhq/docs-tutorial-nextjs)
-   [Next.js 13 + App Route + ReactQuery](https://github.com/zenstackhq/docs-tutorial-nextjs-app-dir)
-   [Next.js 13 + App Route + tRPC](https://github.com/zenstackhq/sample-blog-nextjs-app-trpc)
-   [Nuxt V3 + TanStack Query](https://github.com/zenstackhq/docs-tutorial-nuxt)
-   [SvelteKit](https://github.com/zenstackhq/docs-tutorial-sveltekit)
-   [Remix](https://github.com/zenstackhq/docs-tutorial-remix)
-   [NestJS Backend API](https://github.com/zenstackhq/docs-tutorial-nestjs)
-   [Express Backend API](https://github.com/zenstackhq/docs-tutorial-express)
-   [Clerk Integration](https://github.com/zenstackhq/docs-tutorial-clerk)

## Community

Join our [discord server](https://discord.gg/Ykhr738dUe) for chat and updates!

## Contributing

If you like ZenStack, join us to make it a better tool! Please use the [Contributing Guide](CONTRIBUTING.md) for details on how to get started, and don't hesitate to join [Discord](https://discord.gg/Ykhr738dUe) to share your thoughts.

Please also consider [sponsoring our work](https://github.com/sponsors/zenstackhq) to speed up the development. Your contribution will be 100% used as a bounty reward to encourage community members to help fix bugs, add features, and improve documentation.

## Sponsors

Thank you for your generous support!

### Current Sponsors

<table>
  <tr>
   <td align="center"><a href="https://www.marblism.com/"><img src="https://avatars.githubusercontent.com/u/143199531?s=200&v=4" width="100" style="border-radius:50%" alt="Marblism"/><br />Marblism</a></td>
   <td align="center"><a href="https://www.mermaidchart.com/"><img src="https://avatars.githubusercontent.com/u/117662492?s=200&v=4" width="100" style="border-radius:50%" alt="Mermaid Chart"/><br />Mermaid Chart</a></td>
   <td align="center"><a href="https://coderabbit.ai/"><img src="https://avatars.githubusercontent.com/u/132028505?v=4" width="100" style="border-radius:50%" alt="CodeRabbit"/><br />CodeRabbit</a></td>
   <td align="center"><a href="https://github.com/j0hannr"><img src="https://avatars.githubusercontent.com/u/52762073?v=4" width="100" style="border-radius:50%" alt="Johann Rohn"/><br />Johann Rohn</a></td>
   <td align="center"><a href="https://github.com/baenie"><img src="https://avatars.githubusercontent.com/u/58309104?v=4" width="100" style="border-radius:50%" alt="Benjamin Zecirovic"/><br />Benjamin Zecirovic</a></td>
  </tr>
</table>

### Previous Sponsors

<table>
  <tr>
   <td align="center"><a href="https://github.com/umussetu"><img src="https://avatars.githubusercontent.com/u/152648499?v=4" width="100" style="border-radius:50%" alt="Ulric"/><br />Ulric</a></td>
   <td align="center"><a href="https://github.com/iamfj"><img src="https://avatars.githubusercontent.com/u/24557998?v=4" width="100" style="border-radius:50%" alt="Fabian Jocks"/><br />Fabian Jocks</a></td>
  </tr>
</table>

## Contributors

Thanks to all the contributors who have helped make ZenStack better!

#### Source

<a href="https://github.com/zenstackhq/zenstack/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=zenstackhq/zenstack" />
</a>

#### Docs

<a href="https://github.com/zenstackhq/zenstack-docs/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=zenstackhq/zenstack-docs" />
</a>

## License

[MIT](LICENSE)
