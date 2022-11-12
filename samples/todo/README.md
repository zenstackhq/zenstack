# A Collaborative Todo Sample

This project is a collaborative todo app built with [Next.js](https://nextjs.org), [Next-Auth](nextauth.org), and [ZenStack](https://github.com/zenstackhq/zenstack).

In this fictitious app, users can be invited to workspaces where they can collaborate on todos. Public todo lists are visible to all members in the workspace.

See a live deployment at: https://zenstack-todo.vercel.app/.

## Features:

-   User signup/signin
-   Creating workspaces and inviting members
-   Data isolation and permission control

## Running the sample:

1. Install dependencies

```bash
npm install
```

2. Generate server and client-side code from model

```bash
npm run generate
```

3. Synchronize database schma

```bash
npm run db:push
```

4. Start dev server

```bash
npm run dev
```
