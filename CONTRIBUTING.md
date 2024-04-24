# Contributing to ZenStack

I want to think you first for considering contributing to ZenStack 🙏🏻. It's people like you who make ZenStack a better toolkit that benefits more and more developers! This document will help you get started, and please join our [Discord](https://discord.gg/Ykhr738dUe) if you have any questions.

## Prerequisites

-   [Node.js](https://nodejs.org/): v18 or above
-   [pnpm](https://pnpm.io/): latest version

## Get started

1. Make a fork of the repository

    Make sure all branches are included.

1. Clone your fork

1. Switch to the "dev" branch

    ```bash
    git checkout dev
    ```

1. Install dependencies

    ```bash
    pnpm install
    ```

1. Build the project

    ZenStack uses [pnpm workspace](https://pnpm.io/workspaces) to manage packages in the monorepo. To build the project, run the following command in the root directory:

    ```bash
    pnpm build
    ```

1. Scaffold the project used for testing

    ```bash
    pnpm test-scaffold
    ```

    You only need to run this command once.

1. Run tests

    ```bash
    pnpm test
    ```

## Development workflow

ZenStack adopts a very simple development workflow:

1.  Changes should be made in branches created off the "dev" branch.

1.  After coding and testing, create a PR to merge the changes into the "dev" branch.

1.  After code review is done, the PR is squashed and merged into the "dev" branch.

1.  Periodically, the "dev" branch is merged back to the "main" branch to create a new release.

## Project structure

ZenStack is a monorepo consisting of multiple NPM packages managed by [pnpm workspace](https://pnpm.io/workspaces). The packages reside in the "packages" folder:

### `language`

The ZModel language's definition, including its syntax definition and parser/linker implementation. The compiler is implemented with the [Langium](https://github.com/langium/langium) toolkit.

### `schema`

The `zenstack` CLI and ZModel VSCode extension implementation. The package also contains several built-in plugins: `@core/prisma`, `@core/enhancer`, and `core/zod`.

### `runtime`

Runtime enhancements to PrismaClient, including infrastructure for creating transparent proxies and concrete implementations of various proxies.

### `server`

The `server` package contains two main parts:

1. Framework-agnostic API handlers: defining input/output format and API routes in a framework-independent way. Currently supports "rpc" and "rest" styles.

1. Framework-specific adapters: translating framework-dependent request and response formats.

### `sdk`

Contains utilities for building ZenStack plugins.

### `plugins`

Plugins for generating different artifacts from the ZModel schema.

## Testing changed packages locally

You can use one of the two ways to test changed packages locally:

-   Copy built packages to overwrite the installed ones

    After making changes, run `pnpm build` and then copy the generated artifacts from the `dist` folder to the `node_modules` folder of your test project to overwrite the installed code.

-   Publish packages to a local registry

    You can run a local NPM registry (like [Verdaccio](https://verdaccio.org/)) and publish the changed packages to it. There's a preconfigured `pnpm publish-preview` command that publishes all locally built packages to a local Verdaccio registry (http://localhost:4873).

    The easiest way to install Verdaccio locally is to use [Docker](https://verdaccio.org/docs/docker/).
