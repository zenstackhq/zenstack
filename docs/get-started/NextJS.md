# Getting started for Next.js

## Create a new project from a starter

The easiest way to start using ZenStack is by creating a new Next.js project from a preconfigured starter template.

Here we demonstrate the process with a simple Blog starter using [Next-Auth](https://next-auth.js.org/) for user authentication.

1. Make sure you have Node.js 16 or above and NPM 8 or above installed

2. Create a new Next.js project from ZenStack starter

```bash
npx create-next-app [project name] --use-npm -e https://github.com/zenstackhq/nextjs-auth-starter

cd [project name]
```

3. Run ZenStack generator to generate data services, auth adapter, and the client library

```bash
npm run generate
```

4. Initialize your local db and creates the first migration
   The starter is preconfigured with a local sqlite database. Run the following command to populate its schema and generates a migration history:

```bash
npm run db:migrate -- -n init
```

5. Start the app

```bash
npm run dev
```

If everything worked correctly, you should have a blog site where you can signup, author drafts and publish them. Congratulations! In case anything broke, [reach out to us](#reach-out-to-us-for-issues-feedback-and-ideas) and we'll help.

You can also try signing up multiple accounts and verify that drafts created by different users are isolated.

Checkout [the starter's documentation](https://github.com/zenstackhq/nextjs-auth-starter#readme) for more details.

## Add to an existing project

1. Install the CLI and runtime

```bash
npm i -D zenstack

npm i @zenstackhq/runtime @zenstackhq/internal
```

2. Install [VSCode extension](https://marketplace.visualstudio.com/items?itemName=zenstack.zenstack) for authoring the model file

3. Create a "zenstack" folder at your project root, and add a "schema.zmodel" file in it

4. Configure database connection in "schema.model"

5. Add models and define access policies as needed by your requirements, and then generate code

```bash
npx zenstack generate
```

5. Mount data-access API to endpoint
   Create file `pages/api/zenstack/[...path].ts`, with content:

```ts
import { NextApiRequest, NextApiResponse } from 'next';
import {
    type RequestHandlerOptions,
    requestHandler,
} from '@zenstackhq/runtime/server';
import { authOptions } from '@api/auth/[...nextauth]';
import { unstable_getServerSession } from 'next-auth';
import service from '@zenstackhq/runtime';

const options: RequestHandlerOptions = {
    async getServerUser(req: NextApiRequest, res: NextApiResponse) {
        // return User object for current session, the concrete logic depends on how you authenticate users and maintain sessions
    },
};
export default requestHandler(service, options);
```

6. Initialize your local db and creates the first migration

```bash
npm run db:migrate -- -n init
```

7. Start building your app by using the generated React hooks
   E.g.:

```ts
import { usePost } from '@zenstackhq/runtime/hooks';

...

const { get } = usePost();
const posts = get({ where: { public: true } });

return <>{posts.map(post => (<Post post={post} />))}</>
```
