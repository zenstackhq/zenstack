# Changelog

## [2.0.0-alpha.2](https://github.com/zenstackhq/zenstack/compare/v2.0.0-alpha.1...v2.0.0-alpha.2) (2024-03-04)


### Bug Fixes

* default auth without user context ([#1015](https://github.com/zenstackhq/zenstack/issues/1015)) ([e5b5a0f](https://github.com/zenstackhq/zenstack/commit/e5b5a0fee34e46bee5557229f6f5894629c6ad96))
* foreign key constraint ambiguity in generated delegate prisma schema ([#1060](https://github.com/zenstackhq/zenstack/issues/1060)) ([ca2a314](https://github.com/zenstackhq/zenstack/commit/ca2a314a927053703e4dbc76542499159b8bf6a8))


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
