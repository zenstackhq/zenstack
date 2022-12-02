# Integrating authentication

This documentation explains how to integrate ZenStack with popular authentication frameworks.

## NextAuth

[NextAuth](https://next-auth.js.org/) is a comprehensive framework for implementating authentication. It offers a pluggable mechanism for configuring how user data is persisted. You can find a full example using ZenStack with NextAuth [here](https://github.com/zenstackhq/zenstack/tree/main/samples/todo ':target=blank').

ZenStack provides an extension package `@zenstackhq/next-auth` for integrating with NextAuth, which includes:

### Adapter

Adapter is a NextAuth mechanism for hooking in custom persistence of auth related entities, like User, Account, etc. The ZenStack adapter can be configured to NextAuth as follows:

```ts
// pages/api/auth/[...nextauth].ts

import service from '@zenstackhq/runtime/server';
import { Adapter } from '@zenstackhq/next-auth';
import NextAuth, { type NextAuthOptions } from 'next-auth';

export const authOptions: NextAuthOptions = {
    // install ZenStack adapter
    adapter: Adapter(service),
    ...
};

export default NextAuth(authOptions);
```

### `authorize` helper

If you use [`CredentialsProvider`](https://next-auth.js.org/providers/credentials ':target=blank'), i.e. email/password based auth, you can also use the `authorize` helper to implement how credentials are verified against the database:

```ts
// pages/api/auth/[...nextauth].ts

import service from '@zenstackhq/runtime/server';
import { authorize } from '@zenstackhq/next-auth';
import NextAuth, { type NextAuthOptions } from 'next-auth';

export const authOptions: NextAuthOptions = {
    ...
    providers: [
        CredentialsProvider({
            credentials: {
                email: {
                    label: 'Email Address',
                    type: 'email',
                },
                password: {
                    label: 'Password',
                    type: 'password',
                },
            },

            // use ZenStack's default implementation to verify credentials
            authorize: authorize(service),
        }),
    ]};

export default NextAuth(authOptions);
```

### Configuring ZenStack services

ZenStack's CRUD services need to be configured with a `getServerUser` callback for fetching current login user from the backend. This can be easily done when using Next-Auth's `unstable_getServerSession` API:

```ts
// pages/api/zenstack/[...path].ts

...
import service, {
    type RequestHandlerOptions,
    requestHandler,
} from '@zenstackhq/runtime/server';
import { authOptions } from '../auth/[...nextauth]';
import { unstable_getServerSession } from 'next-auth';

const options: RequestHandlerOptions = {
    async getServerUser(req: NextApiRequest, res: NextApiResponse) {
        const session = await unstable_getServerSession(req, res, authOptions);
        return session?.user;
    },
};
export default requestHandler(service, options);

```

_NOTE_ Although the name `unstable_getServerSession` looks suspicious, it's officially recommended by Next-Auth and is production-ready.

### Data model requirement

NextAuth is agnostic about the type of underlying database, but it requires certain table structures, depending on how you configure it. Your ZModel definitions should reflect these requirements. A sample `User` model is shown here (to be used with `CredentialsProvider`):

```zmodel
model User {
    id String @id @default(cuid())
    email String @unique @email
    emailVerified DateTime?
    password String @password @omit
    name String?
    image String? @url

    // open to signup
    @@allow('create', true)

    // full access by oneself
    @@allow('all', auth() == this)
}
```

You can find the detailed database model requirements [here](https://next-auth.js.org/adapters/models ':target=blank').

## Iron-session

[Iron-session](https://www.npmjs.com/package/iron-session ':target=blank') is a lightweighted authentication toolkit.

### Authentication endpoints

Iron-session requires you to implement auth related API endpoints by yourself. Usually you need to at least have these three endpoints: **api/auth/login**, **/api/auth/logout**, and **/api/auth/user**. The following code shows how to use ZenStack backend service to implement them.

-   **/api/auth/login**

```ts
...
import service from '@zenstackhq/runtime/server';
import * as bcrypt from 'bcryptjs';

const loginRoute: NextApiHandler = async (req, res) => {
    const { email, password } = req.body;

    const user = await service.db.user.findUnique({ where: { email } });
    if (!user || !bcrypt.compareSync(password, user.password)) {
        res.status(401).json({
            message: 'invalid email and password combination',
        });
        return;
    }

    delete (user as any).password;
    req.session.user = user;
    await req.session.save();

    res.json(user);
};

export default withIronSessionApiRoute(loginRoute, sessionOptions);
```

-   **/api/auth/logout**

```ts
...

const logoutRoute: NextApiHandler = async (req, res) => {
    req.session.destroy();
    res.json({});
};

export default withIronSessionApiRoute(logoutRoute, sessionOptions);

```

-   **/api/auth/user**

```ts
...
import service from '@zenstackhq/runtime/server';

const userRoute: NextApiHandler<AuthResponseType> = async (req, res) => {
    if (req.session?.user) {
        // fetch user from db for fresh data
        const user = await service.db.user.findUnique({
            where: { email: req.session.user.email },
        });
        if (!user) {
            res.status(401).json({ message: 'invalid login status' });
            return;
        }

        delete (user as any).password;
        res.json(user);
    } else {
        res.status(401).json({ message: 'invalid login status' });
    }
};

export default withIronSessionApiRoute(userRoute, sessionOptions);
```

### Configuring ZenStack services

ZenStack's CRUD services need to be configured with a `getServerUser` callback for fetching current login user from the backend. This can be easily done when using iron-session:

```ts
// pages/api/zenstack/[...path].ts

...
import service, {
    requestHandler,
    type RequestHandlerOptions,
} from '@zenstackhq/runtime/server';

const options: RequestHandlerOptions = {
    async getServerUser(req: NextApiRequest, res: NextApiResponse) {
        const user = req.session?.user;
        if (!user) {
            return undefined;
        }

        const dbUser = await service.db.user.findUnique({
            where: { email: user.email },
        });

        return dbUser ?? undefined;
    },
};

export default withIronSessionApiRoute(
    requestHandler(service, options),
    sessionOptions
);
```

## Custom-built authentication

[TBD]
