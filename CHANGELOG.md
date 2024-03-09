# Changelog

## [2.0.0-alpha.2](https://github.com/zenstackhq/zenstack/compare/v2.0.0-alpha.1...v2.0.0-alpha.2) (2024-03-09)


### Bug Fixes

* `@[@validate](https://github.com/validate)` should ignore fields that are not present ([#1104](https://github.com/zenstackhq/zenstack/issues/1104)) ([79ef57a](https://github.com/zenstackhq/zenstack/commit/79ef57a67cbdf3b015c92f607d86543a4a169bcb))
* clean up generation of logical prisma client ([#1082](https://github.com/zenstackhq/zenstack/issues/1082)) ([6e7993a](https://github.com/zenstackhq/zenstack/commit/6e7993afa8dde03ae12c44f198bcca04724dbc92))
* default auth without user context ([#1015](https://github.com/zenstackhq/zenstack/issues/1015)) ([e5b5a0f](https://github.com/zenstackhq/zenstack/commit/e5b5a0fee34e46bee5557229f6f5894629c6ad96))
* foreign key constraint ambiguity in generated delegate prisma schema ([#1060](https://github.com/zenstackhq/zenstack/issues/1060)) ([ca2a314](https://github.com/zenstackhq/zenstack/commit/ca2a314a927053703e4dbc76542499159b8bf6a8))
* more robust calculation of default location for code generation ([#1095](https://github.com/zenstackhq/zenstack/issues/1095)) ([d11d4ba](https://github.com/zenstackhq/zenstack/commit/d11d4bade318d5a17d1a5e3860292352e25cc813))
* **policy:** properly handle array-form of upsert payload ([#1101](https://github.com/zenstackhq/zenstack/issues/1101)) ([e7e1873](https://github.com/zenstackhq/zenstack/commit/e7e1873744ac2d48e118ae48b23e10723d16db44))
* **polymorphism:** relation name disambiguation ([#1107](https://github.com/zenstackhq/zenstack/issues/1107)) ([9f9d277](https://github.com/zenstackhq/zenstack/commit/9f9d27704c2eecbbbd69e841ece6b1d4d22040f6))
* **polymorphism:** support `orderBy` with base fields ([#1086](https://github.com/zenstackhq/zenstack/issues/1086)) ([2e81a08](https://github.com/zenstackhq/zenstack/commit/2e81a089a1b57ebf61d25fc49300fa22f0cda06b))
* prisma.d.ts is not properly saved ([#1090](https://github.com/zenstackhq/zenstack/issues/1090)) ([d3629be](https://github.com/zenstackhq/zenstack/commit/d3629bef459afc11c16461fb18621d2f77ac35cc))
* properly handle missing fields when evaluating `@[@validate](https://github.com/validate)` model-level rules ([#1097](https://github.com/zenstackhq/zenstack/issues/1097)) ([e8268d0](https://github.com/zenstackhq/zenstack/commit/e8268d03ae12f3ccbcf1bb1c531a2816b22f6da8))
* several issues with using `auth()` in `[@default](https://github.com/default)` ([#1088](https://github.com/zenstackhq/zenstack/issues/1088)) ([36e515e](https://github.com/zenstackhq/zenstack/commit/36e515e485c580657b9edbfc52014f3542abfb96))
* should not reject "update" when there's only field-level override but no model-level policy ([#1052](https://github.com/zenstackhq/zenstack/issues/1052)) ([912c831](https://github.com/zenstackhq/zenstack/commit/912c83176a57ae2e2397c0aab68c0299a6115025))
* **tanstack:** improve typing of mutation errors ([#1066](https://github.com/zenstackhq/zenstack/issues/1066)) ([a01065c](https://github.com/zenstackhq/zenstack/commit/a01065c0aa791d6591776b908f3e1e3c4d21424b))
* validate zod schema before update operation is executed ([#1051](https://github.com/zenstackhq/zenstack/issues/1051)) ([9db52db](https://github.com/zenstackhq/zenstack/commit/9db52dbb77650d7c99380308803b7b4b4b7ae42d))
* vue-query typing issue ([#1009](https://github.com/zenstackhq/zenstack/issues/1009)) ([b2e1635](https://github.com/zenstackhq/zenstack/commit/b2e1635cb1857afebde286a0c077c0f561d0bbec))
* zenstack cli errors while using bun/bunx during docker build ([#1011](https://github.com/zenstackhq/zenstack/issues/1011)) ([0704f9d](https://github.com/zenstackhq/zenstack/commit/0704f9db945fc922746ecd480ae833fd64415784))
* **zmodel:** check optionality consistency between relation and fk fields ([#1053](https://github.com/zenstackhq/zenstack/issues/1053)) ([583520e](https://github.com/zenstackhq/zenstack/commit/583520e5dce1d898becf3da9553c6faf08db6343))
* **zod:** add coercion call when generating schema for DateTime field ([#1068](https://github.com/zenstackhq/zenstack/issues/1068)) ([b60627c](https://github.com/zenstackhq/zenstack/commit/b60627c167706728ac232ce06366d914e3dde23f))


### Performance Improvements

* improve polymorphism code generation speed ([#1073](https://github.com/zenstackhq/zenstack/issues/1073)) ([5b103ba](https://github.com/zenstackhq/zenstack/commit/5b103badea7876b7dfc1da91c26eca3213ddd413))

## 0.5.0 (2022-12-15)

### Features

-   Serialization between client (hooks) and server now uses [superjson](https://github.com/blitz-js/superjson), [[#139](https://github.com/zenstackhq/zenstack/issues/139)]

### Fixes and improvements

-   Fixed goto definition issue in VSCode extension, [[#69](https://github.com/zenstackhq/zenstack/issues/69)]

### Breaking changes

-   Next-auth adapter and helper are moved to a separate package `@zenstackhq/next-auth`.

## 0.4.0 (2022-12-01)

### Features

-   `zenstack init` command for initializing a project, [#109](https://github.com/zenstackhq/zenstack/issues/109), [doc](https://zenstack.dev/#/quick-start?id=adding-to-an-existing-project).

-   Field constraint suport, [#94](https://github.com/zenstackhq/zenstack/issues/94), [doc](https://zenstack.dev/#/zmodel-field-constraint).

-   Support for server-side CRUD with access policy check (SSR), [#126](https://github.com/zenstackhq/zenstack/issues/126), [doc](https://zenstack.dev/#/server-side-rendering).

-   Options for disabling fetching in hooks (useful when arguments are not ready), [#57](https://github.com/zenstackhq/zenstack/issues/57), [doc](https://zenstack.dev/#/runtime-api?id=requestoptions).

-   Telemetry in CLI, [#102](https://github.com/zenstackhq/zenstack/issues/102), [doc](https://zenstack.dev/#/telemetry).

-   Iron-session based starter, [#95](https://github.com/zenstackhq/zenstack/issues/95), [link](https://github.com/zenstackhq/nextjs-iron-session-starter).

-   Barebone starter (without authentication), [link](https://github.com/zenstackhq/nextjs-barebone-starter).

-   [Website](https://zenstack.dev) is live!

### Fixes and improvements

-   Merge `@zenstackhq/internal` into `@zenstackhq/runtime` so as to have a single runtime dependency, [#70](https://github.com/zenstackhq/zenstack/issues/70).

-   More accurate log for access policy violation, [#71](https://github.com/zenstackhq/zenstack/issues/71).

-   `auth()` function's return type is now resolved to `User` model in ZModel, instead of `Any`, [#65](https://github.com/zenstackhq/zenstack/issues/65).

-   Improved ZModel type checking, [#67](https://github.com/zenstackhq/zenstack/issues/67), [#46](https://github.com/zenstackhq/zenstack/issues/46), [#99](https://github.com/zenstackhq/zenstack/issues/99).

-   Upgraded to Prisma 4.7.

### Breaking changes

-   @zenstackhq/runtime doesn't export anything now.

    Use @zenstackhq/runtime/types for type definitions shared between client and server, @zenstackhq/runtime/client for client-specific libaries (like React hooks), and @zenstackhq/runtime/server for server-specific libraries.

## 0.3.0 (2022-11-08)

### Features

-   `@password` and `@omit` attribute support

-   Configurable logging (to stdout and emitting as events)

### Fixes and improvements

-   More robust policy checks

-   Properly handles complex types like BigInt, Date, Decimal, etc.

-   Makes sure Prisma schema is regenerated for related CLI commands

-   Lower VSCode engine version requirement for the extension

-   Better overall documentation

## 0.2.0 (2022-10-29)

### Features

-   `ZModel` data modeling schema (an extension to [Prisma Schema](https://www.prisma.io/docs/concepts/components/prisma-schema))

-   `zenstack` cli for generating RESTful services, auth adapters and React hooks from `ZModel`

-   Policy engine that transforms policy rules into Prisma query conditions

-   Runtime packages

-   An initial set of tests
