# Building your app

The code generated from your model covers everything you need to implement CRUD, frontend and backend. This section illustrates the steps of using them when building your app.

## Mounting backend services

First you should mount the generated server-side code as a Next.js API endpoint. Here's an example:

```ts
// pages/api/zenstack/[...path].ts

import { authOptions } from '@api/auth/[...nextauth]';
import service from '@zenstackhq/runtime';
import {
    requestHandler,
    type RequestHandlerOptions,
} from '@zenstackhq/runtime/server';
import { NextApiRequest, NextApiResponse } from 'next';
import { unstable_getServerSession } from 'next-auth';

const options: RequestHandlerOptions = {
    // a callback for getting the current login user
    async getServerUser(req: NextApiRequest, res: NextApiResponse) {
        // here we use NextAuth is used as an example, and you can change it to
        // suit the authentication solution you use
        const session = await unstable_getServerSession(req, res, authOptions);
        return session?.user;
    },
};
export default requestHandler(service, options);
```

Please note that the services need to be configured with a callback `getServerUser` for getting the current login user. The example above uses NextAuth to do it, but you can also hand-code it based on the authentication approach you use, as long as it returns a user object that represents the current session's user.

_TBD_ In the future we'll provide more samples for showing how to integrate with other libraries, like IronSession.

Make sure the services are mounted at route `/api/zenstack/` with a catch all parameter named `path`, as this is required by the generate React hooks.

## <small>_optional_</small> Integrating with NextAuth

If you use NextAuth for authentication, ZenStack also generates an adapter which you can use to configure NextAuth for persistence of user, session, etc.

```ts
// pages/api/auth/[...nextauth].ts

import service from '@zenstackhq/runtime';
import {
    authorize,
    NextAuthAdapter as Adapter,
} from '@zenstackhq/runtime/auth';
import NextAuth, { type NextAuthOptions } from 'next-auth';

export const authOptions: NextAuthOptions = {
    // use ZenStack adapter for persistence
    adapter: Adapter(service),

    providers: [
        CredentialsProvider({
            credentials: { ... },
            // use the generated "authorize" helper for credential based authentication
            authorize: authorize(service),
        }),
    ]

    ...
};

export default NextAuth(authOptions);
```

_TBD_ In the future we'll provide more samples for showing how to integrate with other libraries, like IronSession.

## Using React hooks

React hooks are generated for CRUD'ing each data model you defined. They save your time writing explicit HTTP requests to call the generated services. Internally the hooks use [SWR](https://swr.vercel.app/) for data fetching, so you'll also enjoy its built-in features, like caching, revalidation on interval, etc.

_NOTE_ The generated service code is injected with the access policies you defined in the model, so it's already secure, regardless called directly or via hooks. A read operation only returns data that's supposed to be visible to the current user, and a write operation is rejected if the policies verdict so.

### Read

Call `find` and `get` hooks for listing entities or loading a specific one. If your entity has relations, you can request related entities to be loaded together.

```ts
const { find } = usePost();
// lists unpublished posts with their author's data
const posts = find({
    where: { published: false },
    include: { author: true },
    orderBy: { updatedAt: 'desc' },
});
```

```ts
const { get } = usePost();
// fetches a post with its author's data
const post = get(id, {
    include: { author: true },
});
```

### Create

Call the async `create` method to create a new model entity. Note that if the model has relations, you can create related entities in a nested write. See example below:

```ts
const { create } = usePost();
// creating a new post for current user with a nested comment
const post = await create({
    data: {
        title: 'My New Post',
        author: {
            connect: { id: session.user.id },
        },
        comments: {
            create: [{ content: 'First comment' }],
        },
    },
});
```

### Update

Similar to `create`, the update hook also allows nested write.

```ts
const { update } = usePost();
// updating a post's content and create a new comment
const post = await update(id, {
    data: {
        const: 'My post content',
        comments: {
            create: [{ content: 'A new comment' }],
        },
    },
});
```

### Delete

```ts
const { del } = usePost();
const post = await del(id);
```

## Server-side coding

Since doing CRUD with hooks is already secure, in many cases, you can implement your business logic right in the frontend code.

In case you need to do server-side coding, either through implementing an API endpoint or by using `getServerSideProps` for SSR, you can directly access the database client generated by Prisma:

```ts
import service from '@zenstackhq/runtime';

export const getServerSideProps: GetServerSideProps = async () => {
    const posts = await service.db.post.findMany({
        where: { published: true },
        include: { author: true },
    });
    return {
        props: { posts },
    };
};
```

The Typescript types of data models, filters, sorting, etc., are all shared between the frontend and the backend.

_Note_ Server-side database access is **NOT PROTECTED** by access policies. This is by-design so as to provide a way of bypassing the policies. Please make sure you implement authorization properly.

_TBD_ In the future we'll provide a utility for explicitly validating access policies in backend code, so that you can reuse your policy definitions in the model.
