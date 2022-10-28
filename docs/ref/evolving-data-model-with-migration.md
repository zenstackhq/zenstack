# Evolving Data Model with Migration

When using ZenStack, your schema.zmodel file represents the current status of your app's data model and your database's schema. When you make changes to schema.zmodel, however, your data model drifts away from database schema. At your app's deployment time, such drift needs to be "fixed", and so that your database schema stays synchronized with your data model. This processing of "fixing" is called migration.

Here we summarize a few common scenarios and show how you should work on migration.

## For a newly created schema.zmodel

When you're just starting out a ZenStack project, you have an empty migration history. After creating schema.zmodel, adding a development datasource and adding some models, run the following command to bootstrap your migration history and synchronize your development database schema:

```bash
npx zenstack migrate dev -n init
```

After it's run, you should find a folder named `migrations` created under `zenstack` folder, inside of which you can find a .sql file containing script that initializes your database. Please note that when you run "migration dev", the generated migration script is automatically run agains your datasource specified in schema.zmodel.

Make sure you commit the `migrations` folder into source control.

## After updating an existing schema.zmodel

After making update to schema.zmodel, run the "migrate dev" command to generate an incremental migration record:

```bash
npx zenstack migrate dev -n [short-name-for-the-change]
```

If any database schema change is needed based on the previous version of data model, a new .sql file will be generated under `zenstack/migrations` folder. Your development database's schema is automatically synchronized after running the command.

Make sure you review that the generated .sql script reflects your intention before committing it to source control.

## Pushing model changes to database without creating migration

This is helpful when you're prototyping locally and don't want to create migration records. Simply run:

```bash
npx zenstack db push
```

, and your database schema will be synced with schema.zmodel. After prototyping, reset your local database and generate migration records:

```bash
npx zenstack migrate reset

npx zenstack migrate dev -n [name]
```

### During deployment

When deploying your app to an official environment (a shared dev environment, staging, or production), **DO NOT** run `migrate dev` command in CI scripts. Instead, run `migrate deploy`.

```bash
npx zenstack migrate deploy
```

The `migrate deploy` command does not generate new migration records. It simply detects records that are created after the previous deployment and execute them in order. As a result, your database schema is synchronized with data model.

If you've always been taking the "migrate dev" and "migrate deploy" loop during development, your migration should run smoothly. However manually changing db schema, manually changing/deleting migration records can result in failure during migration. Please refer to this documentation for [troubleshooting migration issues in production](https://www.prisma.io/docs/guides/database/production-troubleshooting).

## Summary

ZenStack is built over Prisma and it internally delegates all ORM tasks to Prisma. The migration workflow is exactly the same as Prisma's workflow, with the only exception that the source of input is schema.zmodel, and a Prisma schema is generated on the fly. The set of migration commands that ZModel CLI offers, like "migrate dev" and "migrate deploy", are simple wrappers around Prisma commands.

Prisma has [excellent documentation](https://www.prisma.io/docs/concepts/components/prisma-migrate) about migration. Make sure you look into those for a more thorough understanding.
