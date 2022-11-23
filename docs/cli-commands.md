## CLI commands

### `init`

Set up ZenStack for an existing Next.js + Typescript project.

```bash
npx zenstack init [dir]
```

### `generate`

Generates RESTful CRUD API and React hooks from your model.

```bash
npx zenstack generate [options]
```

_Options_:

```
    --schema <file> schema file (with extension .zmodel) (default: "./zenstack/schema.zmodel")
```

### `migrate`

Update the database schema with migrations.

**Sub-commands**:

#### `migrate dev`

Create a migration from changes in Prisma schema, apply it to the database, trigger generation of database client. This command wraps `prisma migrate` command.

```bash
npx zenstack migrate dev [options]
```

_Options_:

```
    --schema <file> schema file (with extension .zmodel) (default: "./zenstack/schema.zmodel")
```

#### `migrate reset`

Reset your database and apply all migrations.

```bash
npx zenstack migrate reset [options]
```

_Options_:

```
    --schema <file> schema file (with extension .zmodel) (default: "./zenstack/schema.zmodel")
```

#### `migrate deploy`

Apply pending migrations to the database in production/staging.

```bash
npx zenstack migrate deploy [options]
```

_Options_:

```
    --schema <file> schema file (with extension .zmodel) (default: "./zenstack/schema.zmodel")
```

#### `migrate status`

Check the status of migrations in the production/staging database.

```bash
npx zenstack migrate status [options]
```

_Options_:

```
    --schema <file> schema file (with extension .zmodel) (default: "./zenstack/schema.zmodel")
```

### `db`

Manage your database schema and lifecycle during development. This command wraps `prisma db` command.

**Sub-commands**:

#### `db push`

Push the state from model to the database during prototyping.

```bash
npx zenstack db push [options]
```

_Options_:

```
    --schema <file> schema file (with extension .zmodel) (default: "./zenstack/schema.zmodel")
    --accept-data-loss  Ignore data loss warnings
```

### `studio`

Browse your data with Prisma Studio. This command wraps `prisma studio` command.

```bash
npx zenstack studio [options]
```

_Options_:

```
    --schema <file>         schema file (with extension .zmodel) (default: "./zenstack/schema.zmodel")
    -p --port <port>        Port to start Studio in
    -b --browser <browser>  Browser to open Studio in
    -n --hostname           Hostname to bind the Express server to
```
