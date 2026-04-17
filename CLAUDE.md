# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Build System

- `pnpm build` - Build all packages using Turbo
- `pnpm watch` - Watch mode for all packages
- `pnpm lint` - Run ESLint across all packages
- `pnpm test` - Run tests for all packages

### Package Management

- Uses `pnpm` with workspaces
- Package manager is pinned to `pnpm@10.12.1`
- Packages are located in `packages/`, `samples/`, and `tests/`

### Testing

- E2E tests are in `tests/e2e/` directory
- Regression tests for GitHub issues go in `tests/regression/test/` as `issue-{number}.test.ts`

### ZenStack CLI Commands

- `npx zenstack init` - Initialize ZenStack in a project
- `npx zenstack generate` - Compile ZModel schema to TypeScript
- `npx zenstack db push` - Sync schema to database (uses Prisma)
- `npx zenstack migrate dev` - Create and apply migrations
- `npx zenstack migrate deploy` - Deploy migrations to production

## Architecture Overview

### Core Components

- **@zenstackhq/orm** - ORM engine built above Kysely
- **@zenstackhq/cli** - Command line interface and project management
- **@zenstackhq/language** - ZModel language specification and parser (uses Langium)
- **@zenstackhq/sdk** - Code generation utilities and schema processing

### Key Architecture Patterns

- **Monorepo Structure**: Uses pnpm workspaces with Turbo for build orchestration
- **Language-First Design**: ZModel DSL compiles to TypeScript, not runtime code generation
- **Kysely-Based ORM**: V3 uses Kysely as query builder instead of Prisma runtime dependency
- **Plugin Architecture**: Runtime plugins for query interception and entity mutation hooks

### ZModel to TypeScript Flow

1. ZModel schema (`schema.zmodel`) defines database structure and policies
2. `zenstack generate` compiles ZModel to TypeScript schema (`schema.ts`)
3. Schema is used to instantiate `ZenStackClient` with type-safe CRUD operations
4. Client provides both high-level ORM API and low-level Kysely query builder

### Package Dependencies

- **ORM**: Depends on Kysely, Zod, and various utility libraries
- **CLI**: Depends on language package, Commander.js, and Prisma (for migrations)
- **Language**: Uses Langium for grammar parsing and AST generation
- **Database Support**: SQLite (better-sqlite3) and PostgreSQL (pg) only

### Testing Strategy

- ORM package has comprehensive client API tests and policy tests
- CLI has action-specific tests for commands
- E2E tests validate real-world schema compatibility (cal.com, formbricks, trigger.dev)
- Type coverage tests ensure TypeScript inference works correctly

## Key Differences from Prisma

- No runtime dependency on @prisma/client
- Pure TypeScript implementation without Rust/WASM
- Built-in access control and validation (coming soon)
- Kysely query builder as escape hatch instead of raw SQL
- Schema-first approach with ZModel DSL extension of Prisma schema language

## Pull Requests

- Always target the `dev` branch (not `main`) when creating PRs

## Git Workflow

- Never commit or push changes unless explicitly asked to do so

## Development Notes

- Always run `zenstack generate` after modifying ZModel schemas
- Database migrations still use Prisma CLI under the hood
- Plugin system allows interception at ORM, Kysely, and entity mutation levels
- Computed fields are evaluated at database level for performance
- The "ide/vscode" package by-design has a different version from the rest of the packages as VSCode doesn't allow pre-release versions in its marketplace.
