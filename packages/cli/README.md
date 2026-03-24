# @zenstackhq/cli

The command-line interface for ZenStack. Provides commands for initializing projects, generating TypeScript code from ZModel schemas, managing database migrations, and etc.

## Key Commands

- `zenstack init` — Initialize ZenStack in an existing project
- `zenstack generate` — Compile ZModel schema to TypeScript
- `zenstack db push` — Sync schema to the database
- `zenstack db pull` — Pull database schema changes into ZModel
- `zenstack migrate dev` — Create and apply database migrations
- `zenstack migrate deploy` — Deploy migrations to production
- `zenstack format` — Format ZModel schema files
- `zenstack proxy|studio` — Start a database proxy server for using studio

## Installation

```bash
npm install -D @zenstackhq/cli
```

## Learn More

- [ZenStack Documentation](https://zenstack.dev/docs)
