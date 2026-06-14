import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { zenstackAdapter } from '@zenstackhq/better-auth';
import { db } from './db';

/**
 * Better-Auth configuration.
 *
 * This wires Better-Auth's data layer to the ZenStack ORM client via
 * `@zenstackhq/better-auth`'s adapter — the `User`, `Session`, `Account` and
 * `Verification` models in `schema.zmodel` are Better-Auth's core schema.
 *
 * Only the *setup* is provided here, as requested: no HTTP routes, framework
 * handlers, or sign-in/sign-up flow are mounted. `auth.api.*` is fully usable
 * (see `taskforge auth:signup` in the CLI for a demonstration), but there is no
 * server exposing it.
 *
 * The Better-Auth CLI can read this file to (re)generate the auth models into
 * the ZModel schema:  `pnpm auth:generate`.
 */
const options = {
    appName: 'TaskForge',
    // CLI usage never serves HTTP; a placeholder base URL silences the warning.
    baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
    secret: process.env.BETTER_AUTH_SECRET ?? 'taskforge-dev-secret-0123456789abcdef',
    database: zenstackAdapter(db, {
        provider: 'sqlite',
    }),
    emailAndPassword: {
        enabled: true,
    },
    plugins: [],
} satisfies BetterAuthOptions;

export const auth = betterAuth(options);

export type Auth = typeof auth;
