# Integrating authentication

This documentation explains how to integrate ZenStack with popular authentication frameworks.

## NextAuth

[NextAuth](https://next-auth.js.org/) is a comprehensive framework for implementating authentication. It offers a pluggable mechanism for configuring how user data is persisted. You can find a full example using ZenStack with NextAuth [here](https://github.com/zenstackhq/zenstack/tree/main/samples/todo ':target=blank').

When `zenstack generate` runs, it generates an adapter for NextAuth if it finds the `next-auth` npm package is installed. The generated adapter can be configured to NextAuth as follows:

```ts
// pages/api/auth/[...nextauth].ts

import service from '@zenstackhq/runtime/server';
import { NextAuthAdapter as Adapter } from '@zenstackhq/runtime/server/auth';
import NextAuth, { type NextAuthOptions } from 'next-auth';

export const authOptions: NextAuthOptions = {
    // install ZenStack adapter
    adapter: Adapter(service),
    ...
};

export default NextAuth(authOptions);
```

If you use [`CredentialsProvider`](https://next-auth.js.org/providers/credentials ':target=blank'), i.e. username/password based auth, you can also use the generated `authorize` function to implement how username/password is verified against the database:

```ts
// pages/api/auth/[...nextauth].ts

import service from '@zenstackhq/runtime/server';
import { authorize } from '@zenstackhq/runtime/server/auth';
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

## IronSession

[TBD]

## Custom-built authentication

[TBD]
