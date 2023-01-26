<div align="center">
    <img src="https://user-images.githubusercontent.com/104139426/214809937-4ed30485-a683-4fea-b737-928c48e86fd7.png" style="max-width: 512px; width: 100%; height: auto; margin-bottom: 1rem;"
    >
    <div></div>
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

ZenStack is a toolkit that simplifies the development of a web app's backend. It supercharges [Prisma ORM](https://prisma.io) with a powerful access control layer and unleashes its full potential for web development.

Our goal is to let you save time writing boilerplate code and focus on building real features!

## How it works

ZenStack extended Prisma schema language for supporting custom attributes and functions and, based on that, implemented a flexible access control layer around Prisma.

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

At runtime, transparent proxies are created around Prisma clients for intercepting queries and mutations to enforce access policies. Moreover, framework integration packages help you wrap an access-control-enabled Prisma client into backend APIs that can be safely called from the frontend.

```ts
// pages/api/model/[...path].ts

import { requestHandler } from '@zenstackhq/next';
import { withPolicy } from '@zenstackhq/runtime';
import { getSessionUser } from '@lib/auth';
import { prisma } from '@lib/db';

export default requestHandler({
    getPrisma: (req, res) => withPolicy(prisma, { user: getSessionUser(req, res) }),
});
```

Plugins can generate strong-typed client libraries that talk to the APIs:

```tsx
import { usePost } from '@lib/hooks';

const MyPosts = () => {
    // Post CRUD hooks
    const { findMany } = usePost();

    // list all posts that're visible to the current user, together with their authors
    const { data: posts } = findMany({
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

## Links

-   [Home](https://zenstack.dev)
-   [Documentation](https://zenstack.dev/docs)
-   [Community chat](https://go.zenstack.dev/chat)
-   [Twitter](https://twitter.com/zenstackhq)
-   [Blog](https://dev.to/zenstack)

## Features

-   Access control and data validation rules right inside your Prisma schema
-   Auto-generated RESTful API and client library
-   End-to-end type safety
-   Extensible: custom attributes, functions, and a plugin system
-   Framework agnostic
-   Uncompromised performance

## Examples

Check out the [Collaborative Todo App](https://zenstack-todo.vercel.app/) for a running example. You can find the source code below:

-   [Next.js + React hooks implementation](https://github.com/zenstackhq/sample-todo-nextjs)
-   [Next.js + tRPC implementation](https://github.com/zenstackhq/sample-todo-trpc)

## Community

Join our [discord server](https://go.zenstack.dev/chat) for chat and updates!

## License

[MIT](LICENSE)
