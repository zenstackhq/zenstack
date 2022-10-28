<div align="center">
    <picture>
        <source media="(prefers-color-scheme: dark)"  srcset="https://user-images.githubusercontent.com/104139426/197796502-1bcb8052-a7b1-42de-bfc8-a14e045ac1c3.png">
        <img src="https://user-images.githubusercontent.com/104139426/197796006-52d8d334-413b-4eda-8094-4024c0eaf9b3.png" height="128">
    </picture>
    <h1>ZenStack</h1>
    <a href="https://www.npmjs.com/package/zenstack"><img src="https://img.shields.io/npm/v/zenstack"></a>
    <a href="https://github.com/zenstackhq/zenstack/blob/dev/LICENSE"><img src="https://img.shields.io/badge/license-MIT-green"></a>
</div>

## What is ZenStack?

ZenStack is a toolkit for simplifying full-stack development with Node.js web frameworks like [Next.js](https://nextjs.org/), [Nuxt.js](https://nuxtjs.org/) <img src="https://img.shields.io/badge/-Coming%20Soon-lightgray" height="12" align="top"> and [SvelteKit](https://kit.svelte.dev/) <img src="https://img.shields.io/badge/-Coming%20Soon-lightgray" height="12" align="top">, using Typescript language.

Thanks to the increasing power of frameworks, it's becoming more and more practical to build a complex web app all within one unified framework. However, you'll still need to spend significantly amout of engergy to design and build up the server-side part of your app.

Things that make you stressful include:

-   What kind of API to use? RESTful or GraphQL?
-   How to model your data and map the model to both source code and database (ORM)?
-   How to implement common CRUD operations? Manually construct it or use a generator?
-   How to evolve your data model?
-   How to authenticate users and authorize their requests?

ZenStack aims to simplify these tasks by providing:

-   An intuitive data modeling language for defining data types, relationships and access policies

```prisma
model User {
    id String @id @default(cuid())
    email String @unique

    // one-to-many relation to Post
    posts Post[]
}

model Post {
    id String @id @default(cuid())
    title String
    content String
    published Boolean @default(false)

    // one-to-many relation from User
    author User? @relation(fields: [authorId], references: [id])
    authorId String?

    // must signin to CRUD any post
    @@deny('all', auth() == null)

    // allow CRUD by author
    @@allow('all', author == auth())
}
```

-   Auto-generated CRUD services and strongly typed front-end library

```jsx
// React example

const { find } = usePost();
const posts = get({ where: { public: true } });
// only posts owned by current login user are returned
return (
    <>
        {posts?.map((post) => (
            <Post key={post.id} post={post} />
        ))}
    </>
);
```

Since CRUD APIs are automatically generated with access policies injected, you can implement most of your business logic in your front-end code safely. Read operations never return data that's not supposed to be visible to the current user, and writes will be rejected if unauthorized. The generated front-end library also supports nested writes, which allows you to make a batch of creates/updates atomically, eliminating the needs for explicitly using a transaction.

ZenStack is both heavily inspired and built above [Prisma ORM](https://www.prisma.io/), which is in our oppinion the best ORM toolkit in the market. Familarity with Prisma should make it very easy to pick up ZenStack, but it's not prerequisite since the modeling language is intuitive and the development workflow is straightforward.

## Getting started

### [For Next.js](docs/get-started/next-js.md)

### For Nuxt.js <img src="https://img.shields.io/badge/-Coming%20Soon-lightgray" height="12" align="top">

### For SvelteKit <img src="https://img.shields.io/badge/-Coming%20Soon-lightgray" height="12" align="top">

## How does it work?

ZenStack has four essential responsibilities:

1. Modeling data and maps the model to db schema and program types
1. Integrating with authentication
1. Generating CRUD APIs and enforcing data access policies
1. Providing type-safe client CRUD library

Let's briefly go through each of them in this section.

### Data modeling

ZenStack uses a schema language called `ZModel` to define data types and their relationship. The `zenstack` CLI takes a schema file as input and generates database client client code automatically. Such client code allows you program against database in server-side code in a fully typed way, without writing any SQL. It also provides commands for synchronizing data model with database schema, as well generating "migration reords" when your data model evolves.

Internally, ZenStack completely relies on Prisma for ORM tasks. The ZModel language is a superset of Prisma's schema language. When `zenstack generate` is run, a Prisma schema named 'schema.prisma' is generated beside your ZModel schema file. You don't need to commit schema.prisma to source control. The recommended practice is to run `zenstack generate` during deployment, so Prisma schema is regenerated on the fly.

### Authentication

ZenStack is not an authentication library, but it gets involved in two ways.

Firstly, if you use any authentication method that involves persisting user's identity, you'll model user's shape in ZModel. Some auth library, like [NextAuth](https://next-auth.js.org/), requires user entity to include certain fields, and your model should fulfill such requirements. Credential-based authentication requires validating user-provided credentials, and you should implement this using the database client generated by ZenStack.

To simplify the task, ZenStack automatically generates an adapter for NextAuth when it detects that `next-auth` npm package is installed. Please refer to [the starter code](https://github.com/zenstackhq/nextjs-auth-starter/blob/main/pages/api/auth/%5B...nextauth%5D.ts) for how to use it. We'll keep adding integrations/samples for other auth libraries in the future.

Secondly, authentication is almost always connected to authorization. ZModel allows you to reference the current login user via `auth()` function in access policy expressions. Like,

```prisma
model Post {
    author User @relation(fields: [authorId], references: [id])
    ...

    @@deny('all', auth() == null)
    @@allow('all', auth() == author)
```

The value returned by `auth()` is provided by your auth solution, via the `getServerUser` hook function you provide when mounting ZenStack APIs. Check [this code](https://github.com/zenstackhq/nextjs-auth-starter/blob/main/pages/api/zenstack/%5B...path%5D.ts) for an example.

### Data access policy

The main value that ZenStack adds over a traditional ORM is the built-in data access policy engine. This allows most business logic to be safely implemented in front-end code. Since ZenStack delegates database access to Prisma, it enforces access policies through analyzing queries sent to Prisma and injecting guarding conditions. Suppose we have a policy saying "a post can only be accessed by its author if it's not published", expressed in ZModel as:

```
@@deny('all', auth() != author && !published)
```

When client code sends a query to list all `Post`s, ZenStack's generated code intercepts it and injects int the `where` clause before passing it through to Prisma (conceptually):

```js
{
    where: {
        AND: [
            { ...userProvidedFilter },
            {
                // injected by ZenStack, "user" object is fetched from context
                NOT: {
                    AND: [
                        { author: { not: { id: user.id } } },
                        { published: { not: true } },
                    ],
                },
            },
        ];
    }
}
```

Similar procedures are applied to write operations, as well as more complex queries that involve nested reads and writes. To ensure good performance, ZenStack generates conditions statically so it doesn't need to introspect ZModel at runtime. The engine also makes best effort to push down policy constaints to the database to avoid fetching data unnecessarily.

Please **beware** that policy checking is only applied when data access is done using the generated React hooks or equivalently the RESTful API. If you use `service.db` to access database directly from server-side code, policies are bypassed and you have to do all necessary checking by yourself. We've planned to add helper functions for "injecting" the policy checking on the server side in the future.

### Type-safe client library

Thanks to Prisma's power, ZenStack generates accurate Typescript types for your data models:

-   The model itself
-   Argument types for listing models, including filtering, sorting, pagination, and nested reads for related models
-   Argument for creating and updating models, including nested writes for related models

The cool thing is that, the generated types are shared between client-side and server-side code, so no matter which side of code you're writing, you can always enjoy the pleasant IDE intellisense and typescript compiler's error checking.

## Programming with the generated code

### Client-side

#### For Next.js

The generated CRUD services should be mounted at `/api/zenstack`. React hooks are generated for calling these services without explicitly writing Http requests.

The following hooks methods are generated:

-   find: listing entities with filtering, ordering, pagination and nested relations

```ts
const { find } = usePost();
// lists unpublished posts with their author's data
const posts = find({
    where: { published: false },
    include: { author: true },
    orderBy: { updatedAt: 'desc' },
});
```

-   get: fetching a single entity by Id, with nested relations

```ts
const { get } = usePost();
// fetches a post with its author's data
const post = get(id, {
    include: { author: true },
});
```

-   create: creating a new entity, with support for nested creation of related models

```ts
const { create } = usePost();
// creating a new post for current user with a nested comment
const post = await create({
    data: {
        title: 'My New Post',
        author: {
            connect: { id: session.user.id },
        },
        comments: {
            create: [{ content: 'First comment' }],
        },
    },
});
```

-   update: updating an entity, with support for nested creation/update of related models

```ts
const { update } = usePost();
// updating a post's content and create a new comment
const post = await update(id, {
    data: {
        const: 'My post content',
        comments: {
            create: [{ content: 'A new comment' }],
        },
    },
});
```

-   del: deleting an entity

```js
const { del } = usePost();
const post = await del(id);
```

Internally ZenStack generated code uses [SWR](https://swr.vercel.app/) to do data fetching, so that you can enjoy its caching, polling and automatic revalidation features.

### Server-side

If you need to do server side coding, either through implementing an API endpoint or by using `getServerSideProps` for SSR, you can directly access the database client generated by Prisma:

```ts
import service from '@zenstackhq/runtime';

export const getServerSideProps: GetServerSideProps = async () => {
    const posts = await service.db.post.findMany({
        where: { published: true },
        include: { author: true },
    });
    return {
        props: { posts },
    };
};
```

**Please note** that server-side database access is not protected by the access policies. This is by-design so as to provide a way of bypassing the policies. Please make sure you implement authorization properly.

## What's next?

### [Learning the ZModel language](/docs/get-started/learning-the-zmodel-language)

### [Learning the zenstack cli](/docs/get-started/learning-the-zenstack-cli)

### [Evolving data model with migration](/docs/ref/evolving-data-model-with-migration)

### [Database hosting considerations](/docs/ref/database-hosting-considerations)

## Reach out to us for issues, feedback and ideas!

[Discussions](../discussions) [Issues](../issues) [Discord]() [Twitter]()
