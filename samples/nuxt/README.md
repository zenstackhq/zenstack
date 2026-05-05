# ZenStack Nuxt Blog Sample

A simple blog application built with Nuxt, ZenStack ORM, and TanStack Query Vue integration.

## Features

- Create, read, update, and delete blog posts
- User management
- Published/draft post filtering
- Optimistic updates
- Sequential transaction example using `$stepRef`/`$get`/`$filter`/`$map`
- TanStack Query Vue integration with ZenStack

## Getting Started

1. Install dependencies:
```bash
pnpm install
```

2. Initialize the database and seed data:
```bash
pnpm db:init
```

3. Start the development server:
```bash
pnpm dev
```

The app will be available at http://localhost:3302

## Project Structure

- `app/` - Nuxt app components and pages
- `server/` - Nuxt server files
  - `api/model/[...path].ts` - ZenStack API endpoint
  - `utils/db.ts` - Database client
- `zenstack/` - ZenStack schema and generated files
  - `schema.zmodel` - Database schema definition
  - `seed.ts` - Database seeding script

## Available Scripts

- `pnpm dev` - Start development server
- `pnpm build` - Build for production
- `pnpm generate` - Generate ZenStack TypeScript schema
- `pnpm db:init` - Initialize database and seed data
