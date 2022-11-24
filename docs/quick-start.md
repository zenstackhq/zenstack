# Quick start

Please check out the corresponding guide for [creating a new project](#creating-a-new-project) or [adding to an existing project](#adding-to-an-existing-project).

## Creating a new project

Follow these steps to create a new project from a preconfigured template:

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

If everything worked, you should see a simple blog app like this:
![starter screen shot](_media/starter-shot.png 'Starter project screenshot')

No worries if a blogger app doesn't suit you. The created project contains a starter model at `/zenstack/schema.zmodel`. You can modify it and build up your application's own model following [this guide](modeling-your-app.md).

It's good idea to install the [VSCode extension](https://marketplace.visualstudio.com/items?itemName=zenstack.zenstack ':target=_blank') so you get syntax highlighting and error checking when authoring model files.

## Adding to an existing project

To add ZenStack to an existing Next.js + Typescript project, follow the steps below:

1. Install zenstack cli

```bash
npm install --save-dev zenstack
```

2. Initialize the project

```bash
npx zenstack init
```

You should find a `/zenstack/schema.model` file created, containing a simple blogger model in it. No worries if a blogger app doesn't suit you. You can modify it and build up your application's own model following [this guide](modeling-your-app.md).
