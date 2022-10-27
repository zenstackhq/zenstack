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

Thanks to the increasing power of frameworks, it's becoming more and more practical to build a complex web app all within one unified framework. However, you'll still need to spend significantly amout of engergy to design and build up the backend part of your app.

Things that make you stressful include:

-   What kind of API to use? RESTful or GraphQL?
-   How to model your data and map the model to both source code and database (ORM)?
-   How to implement common CRUD operations? Manually construct it or use a generator?
-   How to evolve your data model?
-   How to authenticate users and authorize their requests?

ZenStack aims to simplify these tasks by providing an intuitive data modeling language to define data types and access policies, integrated with user authentication. It maps your data model to a relational database schema, generates RESTful services as well as a client-side library, allowing flexible and painless CRUD operations.

Typescript types are generated for data models, CRUD input, filters, etc., so that you get great coding experiences in IDE and have much fewer chances to make mistakes.

![Diagram here]

Since CRUD APIs are automatically generated with access policies injected, you can implement most of your business logic in your front-end code safely. Read operations never return data that's not supposed to be visible for the current user, and writes will be rejected if unauthorized. The data-access client library also supports nested writes, which allows you to make a batch of creates/updates atomically, eliminating the needs for explicitly using a transaction.

ZenStack is both heavily inspired and built above [Prisma ORM](https://www.prisma.io/), which is in our oppinion the best ORM toolkit in the market. Familarity with Prisma should make it very easy to pick up ZenStack, but it's not prerequisite since the modeling language is intuitive and the development workflow is straightforward.

## Getting started

### [For Next.js](docs/get-started/NextJS.md)

### For Nuxt.js <img src="https://img.shields.io/badge/-Coming%20Soon-lightgray" height="12" align="top">

### For SvelteKit <img src="https://img.shields.io/badge/-Coming%20Soon-lightgray" height="12" align="top">

## How does it work?

ZenStack has four essential responsibilities:

1. Modeling data and maps the model to db schema and program types
1. Integrating with authentication
1. Generating CRUD APIs and enforcing data access policy checks
1. Providing type-safe client CRUD library

Let's briefly go through each of them in this section.

### Data modeling

ZenStack uses a schema language called `ZModel` to define data types and their relationship. The `zenstack` CLI takes a schema file as input and generates database client client code automatically. Such client code allows you program against database in server-side code in a fully typed way, without writing any SQL. It also provides commands for synchronizing data model with database schema, as well generating "migration reords" when your data model evolves.

Please checkout [Data Modeling Cheatsheet](/docs/get-started/data-modeling-cheatsheet) on how to carry out common tasks.

Internally, ZenStack completely relies on Prisma for ORM tasks. The ZModel language is a superset of Prisma's schema language. When `zenstack generate` is run, a Prisma schema named 'schema.prisma' is generated beside your ZModel schema file. You don't need to commit schema.prisma to source control. The recommended practice is to run `zenstack generate` during deployment, so Prisma schema is regenerated on the fly.

### Authentication

ZenStack is not an authentication library, but it gets involved in two ways.

Firstly, if you use any authentication method that involves persisting user's identity, you'll model user's shape in ZModel. Some auth library, like NextAuth, requires user entity to include certain fields, and your model should reflect this. Credential-based authentication requires validating user-provided credentials, and you should implement this using database client generated by ZenStack.

To simplify the task, ZenStack automatically generates an adapter for NextAuth when it detects that `next-auth` npm package is installed. Please refer to [the starter code](https://github.com/zenstackhq/nextjs-auth-starter/blob/main/pages/api/auth/%5B...nextauth%5D.ts) for how to use it. We'll keep adding integrations/samples for other auth libraries in the future.

Secondly, authentication is almost always connected to authorization. ZModel allows you to reference the current login user via `auth()` function in access policy expressions. Like,

```prisma
model Post {
    owner User @relation(fields: [ownerId], references: [id])
    ...

    @@deny('all', auth() == null)
    @@allow('update', auth() == owner)
```

The value returned by `auth()` is provided by your auth solution, via the `getServerUser` hook function you provide when mounting ZenStack APIs. Check [this code](https://github.com/zenstackhq/nextjs-auth-starter/blob/main/pages/api/zenstack/%5B...path%5D.ts) for an example.

### Data access policy

The main value that ZenStack adds over a traditional ORM is the built-in data access policy engine. This allows most business logic to be safely implemented in front-end code. Since ZenStack delegates database access to Prisma, it enforces access policies through analyzing queries sent to Prisma and injecting guarding conditions. For example, a policy saying "a post can only be seen by its owner if it's not published", expressed in ZModel as:

````
@@deny('all', auth() != owner && !published)
```.

When client code sends a query to list all `Post`s, ZenStack's generated code intercepts it and injects a `where` clause before passing it through to Prisma (conceptually):
```js
{
    where: {
        AND: [
            { ...userProvidedFilter },
            {
                // injected by ZenStack, "user" object is fetched from context
                NOT: {
                    AND: [
                        { owner: { not: { id: user.id } } },
                        { NOT: { published: true } }
                    ]
                }
            }
        ]
    }
}
````

Similar procedures are applied to write operations, as well as more complex queries that involve nested reads and writes.

To ensure good performance, ZenStack generates conditions statically so it doesn't need to introspect ZModel at runtime.

### Type-safe client library

## Programming with the generated code

### Client-side

### Server-side

## Development workflow

## Database considerations

## What's next?

## Reach out to us for issues, feedback and ideas!

[Discussions](../discussions) [Issues](../issues) [Discord]() [Twitter]()
