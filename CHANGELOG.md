# Changelog

## [2.0.0-alpha.2](https://github.com/zenstackhq/zenstack/compare/Monorepo-v2.0.0-alpha.1...Monorepo-v2.0.0-alpha.2) (2024-02-21)


### Features

* **codeql.yml:** add CodeQL workflow for security analysis on push, pull request, ([5fc4572](https://github.com/zenstackhq/zenstack/commit/5fc45726103c9ee89313c336571856ee2f08d6a6))
* **release:** add release manifest and main config files for version 2.0.0-alpha.1 ([24b6c26](https://github.com/zenstackhq/zenstack/commit/24b6c26720d5a0f9cd6d64431288473cd9ee5a97))
* **release:** define package names and components in release main config file ([24b6c26](https://github.com/zenstackhq/zenstack/commit/24b6c26720d5a0f9cd6d64431288473cd9ee5a97))
* **release:** set up configuration for automated versioning and release process ([24b6c26](https://github.com/zenstackhq/zenstack/commit/24b6c26720d5a0f9cd6d64431288473cd9ee5a97))
* **security-defender-for-devops.yml:** add GitHub Actions workflow for Microsoft Defender For DevOps security checks ([545f668](https://github.com/zenstackhq/zenstack/commit/545f6688a5e85171255dfc75148a0b39ef450cb2))
* **security-dependency-review.yml:** add security dependency review workflow to scan and block PRs with known-vulnerable packages ([2b43adc](https://github.com/zenstackhq/zenstack/commit/2b43adc9fcfa5e7dd2e915c2ea9cc8efe6d7ba2b))
* **security-ossar.yml:** add GitHub workflow for security scanning using OSSAR ([2d8452d](https://github.com/zenstackhq/zenstack/commit/2d8452de270c6bde0f55a386500b8f61fb112847))
* **security-ossar.yml:** integrate open source static analysis tools with GitHub code scanning ([2d8452d](https://github.com/zenstackhq/zenstack/commit/2d8452de270c6bde0f55a386500b8f61fb112847))
* **security-ossar.yml:** schedule security scans on main, develop, and release branches ([2d8452d](https://github.com/zenstackhq/zenstack/commit/2d8452de270c6bde0f55a386500b8f61fb112847))
* **security-scorecard.yml:** add GitHub Actions workflow for security scorecard ([30e5a02](https://github.com/zenstackhq/zenstack/commit/30e5a02c7b84d93d23a0e00416b3382b56963c2c))
* **workflows:** add actions/checkout and actions/setup-node for release job setup ([520b469](https://github.com/zenstackhq/zenstack/commit/520b4698d8bcb3615a837b0a3efb85ff9f363696))
* **workflows:** add management-changelog.yml file for release workflow ([520b469](https://github.com/zenstackhq/zenstack/commit/520b4698d8bcb3615a837b0a3efb85ff9f363696))
* **workflows:** add pnpm installation and publishing steps in release job ([520b469](https://github.com/zenstackhq/zenstack/commit/520b4698d8bcb3615a837b0a3efb85ff9f363696))
* **workflows:** add release-please-action for automated releases in release job ([520b469](https://github.com/zenstackhq/zenstack/commit/520b4698d8bcb3615a837b0a3efb85ff9f363696))
* **workflows:** add steps to harden runner for runtime security in release job ([520b469](https://github.com/zenstackhq/zenstack/commit/520b4698d8bcb3615a837b0a3efb85ff9f363696))
* **workflows:** configure release workflow to trigger on push to main, dev, and release branches ([520b469](https://github.com/zenstackhq/zenstack/commit/520b4698d8bcb3615a837b0a3efb85ff9f363696))
* **workflows:** set permissions for contents to read and write in release job ([520b469](https://github.com/zenstackhq/zenstack/commit/520b4698d8bcb3615a837b0a3efb85ff9f363696))


### Bug Fixes

* merge errors in github workflow files and formatting issues ([6867e79](https://github.com/zenstackhq/zenstack/commit/6867e795d7a683da1db601bbf2de2c77d0d05ed3))
* merge errors in github workflow files and formatting issues ([#1022](https://github.com/zenstackhq/zenstack/issues/1022)) ([252151c](https://github.com/zenstackhq/zenstack/commit/252151c47aa670c1e9fc3b1a51e74b6a26c21f6a))
* **workflows:** correct paths for config-file and manifest-file in release-please-action configuration ([b9b784c](https://github.com/zenstackhq/zenstack/commit/b9b784c2ba53ca51abfb5d0ea3b5e543cd7f7c9e))


### Miscellaneous Chores

* release 2.0.0-alpha.2 ([f40d7e3](https://github.com/zenstackhq/zenstack/commit/f40d7e3718d4210137a2e131d28b5491d065b914))

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
