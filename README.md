<div align="center">
    <a href="https://zenstack.dev">
    <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/zenstackhq/zenstack-docs/main/static/img/logo-dark.png">
    <img src="https://raw.githubusercontent.com/zenstackhq/zenstack-docs/main/static/img/logo.png" height="128">
    </picture>
    </a>
    <h1>ZenStack: Modern Data Layer for TypeScript Apps</h1>
    <a href="https://www.npmjs.com/package/@zenstackhq/cli?activeTab=versions">
        <img src="https://img.shields.io/npm/v/%40zenstackhq%2Fcli/latest">
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

# What's ZenStack

> Read full documentation at 👉🏻 https://zenstack.dev/docs.

ZenStack is a TypeScript database toolkit for developing full-stack or backend Node.js/Bun applications. It provides a unified data modeling and query solution with the following features:

- 🔧 Modern schema-first ORM that's compatible with [Prisma](https://github.com/prisma/prisma)'s schema and API
- 📊 Versatile API - high-level ORM queries + low-level [Kysely](https://kysely.dev) query builder
- 🔐 Built-in access control and data validation
- 🚀 Advanced data modeling patterns like [polymorphism](https://zenstack.dev/docs/orm/polymorphism)
- 🧩 Designed for extensibility and flexibility
- ⚙️ Automatic CRUD web APIs with adapters for popular frameworks
- 🏖️ Automatic [TanStack Query](https://github.com/TanStack/query) hooks for easy CRUD from the frontend

# What's New in V3

ZenStack V3 is a major rewrite. It replaced Prisma ORM with its own ORM engine built on top of [Kysely](https://kysely.dev) while keeping a Prisma-compatible query API. This architecture change brings the level of flexibility that we couldn't imagine in previous versions. Please check [this blog post](https://zenstack.dev/blog/next-chapter-1) for why we made this bold decision.

Even without using advanced features, ZenStack offers the following benefits as a drop-in replacement to Prisma:

1. Pure TypeScript implementation without any Rust/WASM components.
2. More TypeScript type inference, less code generation.
3. Fully-typed query-builder API as a better escape hatch compared to Prisma's [raw queries](https://www.prisma.io/docs/orm/prisma-client/using-raw-sql/raw-queries) or [typed SQL](https://www.prisma.io/docs/orm/prisma-client/using-raw-sql/typedsql).

# Try It Now

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/~/github.com/zenstackhq/v3-doc-quick-start?file=zenstack%2fschema.zmodel&file=main.ts&view=editor&showSidebar=0&hideNavigation=1&hideExplorer=1)

## Installation

### 1. Creating a new project

Use the following command to scaffold a simple TypeScript command line application with ZenStack configured:

```bash
npm create zenstack@latest my-project
```

### 2. Setting up an existing project

Or, if you have an existing project, use the CLI to initialize it:

```bash
npx @zenstackhq/cli@latest init
```

### 3. Setting up manually

Alternatively, you can set it up manually:

```bash
npm install -D @zenstackhq/cli
npm install @zenstackhq/orm
```

Then create a `zenstack` folder and a `schema.zmodel` file in it.

# Documentation

[https://zenstack.dev/docs/](https://zenstack.dev/docs/)

# Sponsors

Thank you for your generous support!

## Current Sponsors

<table>
  <tr>
   <td align="center"><a href="https://suhyl.com/"><img src="https://avatars.githubusercontent.com/u/124434734?s=200&v=4" width="100" style="border-radius:50%" alt="Suhyl"/><br />Suhyl</a></td>
   <td align="center"><a href="https://www.marblism.com/"><img src="https://avatars.githubusercontent.com/u/143199531?s=200&v=4" width="100" style="border-radius:50%" alt="Marblism"/><br />Marblism</a></td>
   <td align="center"><a href="https://www.mermaidchart.com/"><img src="https://avatars.githubusercontent.com/u/117662492?s=200&v=4" width="100" style="border-radius:50%" alt="Mermaid Chart"/><br />Mermaid Chart</a></td>
   <td align="center"><a href="https://coderabbit.ai/"><img src="https://avatars.githubusercontent.com/u/132028505?v=4" width="100" style="border-radius:50%" alt="CodeRabbit"/><br />CodeRabbit</a></td>
   <td align="center"><a href="https://github.com/j0hannr"><img src="https://avatars.githubusercontent.com/u/52762073?v=4" width="100" style="border-radius:50%" alt="Johann Rohn"/><br />Johann Rohn</a></td>
  </tr>
</table>

## Previous Sponsors

<table>
  <tr>
   <td align="center"><a href="https://github.com/baenie"><img src="https://avatars.githubusercontent.com/u/58309104?v=4" width="100" style="border-radius:50%" alt="Benjamin Zecirovic"/><br />Benjamin Zecirovic</a></td>
   <td align="center"><a href="https://github.com/umussetu"><img src="https://avatars.githubusercontent.com/u/152648499?v=4" width="100" style="border-radius:50%" alt="Ulric"/><br />Ulric</a></td>
   <td align="center"><a href="https://github.com/iamfj"><img src="https://avatars.githubusercontent.com/u/24557998?v=4" width="100" style="border-radius:50%" alt="Fabian Jocks"/><br />Fabian Jocks</a></td>
  </tr>
</table>

# Community

Join our [discord server](https://discord.gg/Ykhr738dUe) for chat and updates!
