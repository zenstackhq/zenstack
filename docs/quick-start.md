# Quick start

Please check out the corresponding guide for [creating a new project](#creating-a-new-project) or [adding to an existing project](#adding-to-an-existing-project).

## Creating a new project

You can choose from these preconfigured starter to create a new project:

-   [Using Next-Auth for authentication](#with-next-auth)
-   [Using iron-session for authentication](#with-iron-session)
-   [Without integrating with authentication](#without-integrating-authentication)

### With Next-Auth

Follow these steps to create a new project from a preconfigured template using [Next-Auth](https://next-auth.js.org/ ':target=blank') for authentication:

1. Clone from starter template

```bash
npx create-next-app --use-npm -e https://github.com/zenstackhq/nextjs-auth-starter
```

2. Install dependencies

```bash
npm install
```

3. Generate CRUD services and hooks code from the starter model

```bash
npm run generate
```

4. push database schema to the local sqlite db

```bash
npm run db:push
```

5. start dev server

```
npm run dev
```

### With iron-session

Follow these steps to create a new project from a preconfigured template using [iron-session](https://www.npmjs.com/package/iron-session ':target=blank') for authentication:

1. Clone from starter template

```bash
npx create-next-app --use-npm -e https://github.com/zenstackhq/nextjs-iron-session-starter
```

2. Install dependencies

```bash
npm install
```

3. Generate CRUD services and hooks code from the starter model

```bash
npm run generate
```

4. push database schema to the local sqlite db

```bash
npm run db:push
```

5. start dev server

```
npm run dev
```

### Without integrating authentication

If you would rather not use a template preconfigured with authentication, you can use the barebone starter instead. You can add an authentication solution later or hand-code it by yourself.

1. Clone from starter template

```bash
npx create-next-app --use-npm -e https://github.com/zenstackhq/nextjs-barebone-starter
```

2. Install dependencies

```bash
npm install
```

3. Generate CRUD services and hooks code from the starter model

```bash
npm run generate
```

4. push database schema to the local sqlite db

```bash
npm run db:push
```

5. start dev server

```
npm run dev
```

### Check result

If everything worked, you should see a simple blog app like this:
![starter screen shot](_media/starter-shot.png 'Starter project screenshot')

No worries if a blogger app doesn't suit you. The created project contains a starter model at `/zenstack/schema.zmodel`. You can modify it and build up your application's own model following [this guide](modeling-your-app.md).

## Adding to an existing project

To add ZenStack to an existing Next.js + Typescript project, run command below:

```bash
npx zenstack init
```

You should find a `/zenstack/schema.model` file created, containing a simple blogger model in it. No worries if a blogger app doesn't suit you. You can modify it and build up your application's own model following [this guide](modeling-your-app.md).

## Installing VSCode extension

It's good idea to install the [VSCode extension](https://marketplace.visualstudio.com/items?itemName=zenstack.zenstack ':target=_blank') so you get syntax highlighting and error checking when authoring model files.
