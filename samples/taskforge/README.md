# TaskForge

A command-line client for a **team collaboration / project-tracking** platform
(think Linear/Jira), built to demonstrate a complete **[ZenStack v3](https://zenstack.dev)**
(ORM) + **[Better-Auth](https://better-auth.com)** stack on top of SQLite.

- **34 models** across tenancy, projects/issues, collaboration, automation and billing
- Every relation flavour: 1-1, 1-many, implicit & explicit many-to-many, self-relations
- **Polymorphism** (`@@delegate`), **typed JSON** (`@json`), **computed fields** (`@computed`),
  reusable field **mixins** (`with`), and **enums**
- Better-Auth wired to the ZenStack ORM via the official adapter (setup only — no HTTP flow)

## Stack

| Concern        | Choice |
| -------------- | ------ |
| ORM / schema   | ZenStack v3 (`@zenstackhq/orm`, ZModel schema) |
| Database       | SQLite (via `better-sqlite3`) — zero external services |
| Auth           | Better-Auth + `@zenstackhq/better-auth` adapter |
| CLI            | `commander`, run with `tsx` |

## Quick start

```bash
pnpm install          # native builds (better-sqlite3, prisma) are pre-approved in package.json
pnpm zen:generate     # compile zenstack/schema.zmodel -> zenstack/schema.ts (the typed client)
pnpm db:push          # create/sync the SQLite database (zenstack/taskforge.db)
pnpm seed             # populate a demo workspace (users via Better-Auth, domain via the ORM)
pnpm cli orgs         # try the CLI
```

## CLI commands

```bash
pnpm cli orgs                                  # organizations + member/team/project counts
pnpm cli projects [orgSlug]                    # projects + open-issue count (computed field)
pnpm cli issues <projectSlug> [--status S]     # issues + comment count (computed field)
pnpm cli issue <projectSlug> <number>          # deep read: comments, polymorphic attachments, watchers
pnpm cli stats                                 # groupBy + aggregate over issues and invoices
pnpm cli add-issue <projectSlug> <title...>    # auto-numbered create inside a $transaction
pnpm cli signup <email> <name...>              # register a user through Better-Auth
pnpm cli activity [-n N]                        # recent activity-log entries
```

(`taskforge <cmd>` also works once the package is linked/installed globally.)

## Project layout

```
zenstack/
  schema.zmodel     # the source of truth — 34 models, 13 enums, 5 custom types
  schema.ts         # generated typed schema (do not edit)  — input.ts / models.ts also generated
  taskforge.db      # SQLite database (created by `zen db push`)
src/
  db.ts             # ZenStackClient: SQLite dialect + computed-field implementations
  auth.ts           # Better-Auth config, bound to the ORM via zenstackAdapter
  seed.ts           # demo data
  cli.ts            # the commander CLI
```

## Schema highlights

The domain is organized into five areas, all rooted at a multi-tenant `Organization`:

- **Tenancy** — `Organization`, `Membership` (explicit M2M user↔org with role), `Invitation`,
  `Team`, `TeamMembership` (explicit M2M).
- **Projects & planning** — `Project` (computed `openIssueCount`), `ProjectMember` (explicit M2M),
  `Issue` (self-relation sub-issues; implicit M2M `labels` and `watchers`; computed `commentCount`;
  typed-JSON `metadata`), `Label`, `Milestone`, `Sprint`.
- **Collaboration** — `Comment` (self-relation threads), `Reaction` (two optional FK targets),
  `Attachment` **polymorphic base** with `FileAttachment` / `ImageAttachment` / `LinkAttachment`
  concrete subtypes, `Document` (self-relation tree + implicit M2M collaborators, typed-JSON body).
- **Customization & automation** — `CustomField` + `CustomFieldValue` (explicit M2M), `TimeEntry`,
  `Webhook`, `Integration`, `ApiToken`, `ActivityLog`, `Notification`. Where SQLite forbids scalar
  lists, list-like config is stored as typed JSON.
- **Billing** — `BillingCustomer` (1-1 with org), `Plan`, `Subscription` (1-1 with org), `Invoice`.

A `Timestamps` mixin (`type Timestamps { createdAt … updatedAt … }`) is applied to most models with
`model X with Timestamps { … }`.

### Better-Auth integration

`src/auth.ts` configures Better-Auth with the ZenStack adapter:

```ts
export const auth = betterAuth({
    database: zenstackAdapter(db, { provider: 'sqlite' }),
    emailAndPassword: { enabled: true },
});
```

The `User`, `Session`, `Account` and `Verification` models in `schema.zmodel` are Better-Auth's
core schema. Only the configuration is provided — no routes or sign-in UI are mounted — but
`auth.api.signUpEmail(...)` is fully functional (see `pnpm cli signup`). To regenerate the auth
models into the schema from the auth config, run `pnpm auth:generate`.

## Notes on SQLite

The migration engine wraps Prisma Migrate. With the bundled Prisma 6 + ZenStack v3, SQLite supports
enums, `Json`/typed-JSON, and polymorphism. It does **not** support scalar lists (`String[]`), so
list data is modeled as relations or typed JSON.
