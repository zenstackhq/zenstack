# ZenStack RedwoodJS Integration

This package provides the CLI and runtime APIs for integrating [ZenStack](https://zenstack.dev) into a [RedwoodJS](https://redwoodjs.com/) project. You can use ZenStack as a drop-in replacement to Prisma and define flexible access control policies declaratively inside the database schema. It's especially useful for building multi-tenant applications which tend to have complex authorization requirements beyond RBAC.

ZenStack is a full-stack toolkit built above Prisma ORM. It extends Prisma at the schema and the runtime level for adding the following capabilities:

-   Flexible access control
-   Data validation rules
-   Multi-file schemas
-   Custom attributes and functions in schemas

Visit [homepage](https://zenstack.dev) for more details.

## Setting up

This package leverages RedwoodJS's experimental feature to register a custom CLI command to `yarn redwood`. To enable it, add the following to `redwood.toml`:

```toml
[experimental.cli]
  autoInstall = true
  [[experimental.cli.plugins]]
    package = "@zenstackhq/redwood"
```

Then you can run `yarn rw @zenstackhq setup` to install ZenStack into your Redwood project. The setup command will:

1. Install ZenStack dependencies.
2. Copy your Prisma schema file "api/db/schema.prisma" to "api/db/schema.zmodel".
3. Add a "zenstack" section into "api/package.json" to specify the location of both the "schema.prisma" and "schema.zmodel" files.
4. Install a GraphQLYoga plugin in "api/src/functions/graphql.[ts|js]".
5. Eject service templates and modify the templates to use `context.db` (ZenStack-enhanced `PrismaClient`) instead of `db` for data access.

## Modeling data and access policies

ZenStack's ZModel language is a superset of Prisma schema language. You should use it to define both the data schema and access policies. The regular Prisma schema file will be regenerated from the ZModel file when you run

```bash
yarn rw @zenstackhq generate
```

[The Complete Guide](https://zenstack.dev/docs/the-complete-guide/part1/) of ZenStack is the best way to learn how to author ZModel schemas. You can also use the

```bash
yarn rw @zenstackhq sample
```

command to browse a list of sample schemas and create from them.

## Development workflow

The workflow of using ZenStack is very similar to using Prisma in RedwoodJS projects. The two main differences are:

1. Generation

    You should run `yarn rw @zenstackhq generate` in place of `yarn rw prisma generate`. The ZenStack's generate command internally regenerates the Prisma schema from the ZModel schema, runs `prisma generate` automatically, and also generates other modules for supporting access policy enforcement at the runtime.

2. Database access in services

    In your service code, you should use `context.db` instead of `db` for accessing the database. The `context.db` is an enhanced Prisma client that enforces access policies.

    The "setup" command prepared a customized service code template. When you run `yarn rw g service`, the generated code will already use `context.db`.

Other Prisma-related workflows like generation migration or pushing schema to the database stay unchanged.

## Deployment

You should run the "generate" command in your deployment script before `yarn rw deploy`. For example, to deploy to Vercel, the command can be:

```bash
yarn rw @zenstackhq generate && yarn rw deploy vercel
```

## Sample application

You can find a complete multi-tenant Todo application built with RedwoodJS and ZenStack at: [https://github.com/zenstackhq/sample-todo-redwood](https://github.com/zenstackhq/sample-todo-redwood).

## Getting help

The best way to getting help and updates about ZenStack is by joining our [Discord server](https://discord.gg/Ykhr738dUe).
