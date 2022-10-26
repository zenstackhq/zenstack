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

### With Next.js

The easiest way to start using ZenStack is by creating a new Next.js project from a preconfigured starter template.

Here we demonstrate the process with a simple Blog starter using [Next-Auth](https://next-auth.js.org/) for user authentication.

1. Make sure you have Node.js 16 or above and NPM 8 or above installed

2. Create a new Next.js project from ZenStack starter

```bash
npx create-next-app [project name] --use-npm -e https://github.com/zenstackhq/nextjs-auth-starter

cd [project name]
```

3. Run ZenStack generator to generate data services, auth adapter, and the client library

```bash
npm run generate
```

4. Initialize your local db and creates the first migration
   The starter is preconfigured with a local sqlite database. Run the following command to populate its schema and generates a migration history:

```bash
npm run db:migrate -- -n init
```

5. Start the app

```bash
npm run dev
```

If everything worked correctly, you should have a blog site where you can signup, author drafts and publish them.

You can also try signing up multiple accounts and verify that drafts created by different users are isolated.

Checkout [the starter's documentation](https://github.com/zenstackhq/nextjs-auth-starter#readme) for more details.

### With Nuxt.js

![](https://img.shields.io/badge/-Coming%20Soon-lightgray)

### With SvelteKit

![](https://img.shields.io/badge/-Coming%20Soon-lightgray)

## How does it work?

ZenStack has four essential responsibilities:

1. Mapping data model to db schema and program types (ORM)
1. Integrating with authentication
1. Generating CRUD APIs and enforcing data access policy checks
1. Providing type-safe client CRUD library

We'll briefly go through each of them in this section.

### ORM

### Authentication

### Data access policy checking

### Type-safe client library

## Developing with the generated code

### Client-side

### Server-side usage

## Development workflow

## Database considerations

## What's next?

## Reach out to us for issues, feedback and ideas!

[Discussions](../discussions) [Issues](../issues) [Discord]() [Twitter]()
