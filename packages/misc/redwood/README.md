# ZenStack RedwoodJS Integration

This package provides the CLI and runtime APIs for integrating [ZenStack](https://zenstack.dev) into a [RedwoodJS](https://redwoodjs.com/) project. You can use ZenStack as a drop-in replacement to Prisma and define flexible access control policies declaratively inside the database schema. It's especially useful for building multi-tenant applications which tend to have complex authorization requirements beyond RBAC.

ZenStack is a full-stack toolkit built above Prisma ORM. It extends Prisma at the schema and the runtime level for adding the following capabilities:

-   Flexible access control
-   Data validation rules
-   Multi-file schemas
-   Custom attributes and functions in schemas

You can find a more detailed integration guide [here](https://zenstack.dev/docs/guides/redwood).

### Setting up

Run the following package setup command:

```bash
yarn rw setup package @zenstackhq/redwood
```

The setup command will:

1. Update "redwood.toml" to allow ZenStack CLI plugin.
1. Install ZenStack dependencies.
1. Copy your Prisma schema file "api/db/schema.prisma" to "api/db/schema.zmodel".
1. Add a "zenstack" section into "api/package.json" to specify the location 1f both the "schema.prisma" and "schema.zmodel" files.
1. Install a GraphQLYoga plugin in "api/src/functions/graphql.[ts|js]".
1. Eject service templates and modify the templates to use `context.db` (ZenStack-enhanced `PrismaClient`) instead of `db` for data access.

### Modeling data and access policies

ZenStack's ZModel language is a superset of Prisma schema language. You should use it to define both the data schema and access policies. [The Complete Guide](https://zenstack.dev/docs/the-complete-guide/part1/) of ZenStack is the best way to learn how to author ZModel schemas.

You should run the following command after updating "schema.zmodel":

```bash
yarn rw @zenstackhq generate
```

<!-- You can also use the

```bash
yarn rw @zenstackhq sample
```

command to browse a list of sample schemas and create from them. -->

### Development workflow

The workflow of using ZenStack is very similar to using Prisma in RedwoodJS projects. The two main differences are:

1. Generation

    You should run `yarn rw @zenstackhq generate` in place of `yarn rw prisma generate`. The ZenStack's generate command internally regenerates the Prisma schema from the ZModel schema, runs `prisma generate` automatically, and also generates other modules for supporting access policy enforcement at the runtime.

2. Database access in services

    In your service code, you should use `context.db` instead of `db` for accessing the database. The `context.db` is an enhanced Prisma client that enforces access policies.

    The "setup" command prepared a customized service code template. When you run `yarn rw g service`, the generated code will already use `context.db`.

Other Prisma-related workflows like generation migration or pushing schema to the database stay unchanged.

### Deployment

You should run the "generate" command in your deployment script before `yarn rw deploy`. For example, to deploy to Vercel, the command can be:

```bash
yarn rw @zenstackhq generate && yarn rw deploy vercel
```

### Using the `@zenstackhq` CLI plugin

The `@zenstackhq/redwood` package registers a set of custom commands to the RedwoodJS CLI under the `@zenstackhq` namespace. You can run it with:

```bash
yarn rw @zenstackhq <cmd> [options]
```

The plugin is a simple wrapper of the standard `zenstack` CLI, similar to how RedwoodJS wraps the standard `prisma` CLI. It's equivalent to running `npx zenstack ...` inside the "api" directory.

See the [CLI references](/docs/reference/cli) for the full list of commands.

### Sample application

You can find a complete multi-tenant Todo application built with RedwoodJS and ZenStack at: [https://github.com/zenstackhq/sample-todo-redwood](https://github.com/zenstackhq/sample-todo-redwood).

### Getting help

The best way to get help and updates about ZenStack is by joining our [Discord server](https://discord.gg/Ykhr738dUe).
