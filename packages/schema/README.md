# ZenStack VS Code Extension

> This extension only supports ZenStack v2. For the latest ZenStack v3, please use the [ZenStack V3 Language Tools](https://marketplace.visualstudio.com/items?itemName=zenstack.zenstack-v3) extension instead.

[ZenStack](https://zenstack.dev) is a toolkit that simplifies the development of a web app's backend. It enhances [Prisma ORM](https://prisma.io) with flexible Authorization and auto-generated, type-safe APIs/hooks, simplifying full-stack development.

This VS Code extension provides code editing helpers for authoring ZenStack's schema files (.zmodel files).

## Features

-   Syntax highlighting of `*.zmodel` files

    -   In case the schema file is not recognized automatically, add the following to your settings.json file:

    ```json
    "files.associations": {
        "*.zmodel": "zmodel"
    },
    ```

-   Auto formatting

    -   To automatically format on save, add the following to your settings.json file:

        ```json
        "editor.formatOnSave": true
        ```

    -   To enable formatting in combination with prettier, add the following to your settings.json file:
        ```json
        "[zmodel]": {
        "editor.defaultFormatter": "zenstack.zenstack"
        },
        ```

-   Inline error reporting
-   Go-to definition
-   Hover documentation
-   Code section folding

## Links

-   [Home](https://zenstack.dev)
-   [Documentation](https://zenstack.dev/docs)
-   [Community chat](https://discord.gg/Ykhr738dUe)
-   [Twitter](https://twitter.com/zenstackhq)
-   [Blog](https://dev.to/zenstack)

## Community

Join our [discord server](https://discord.gg/Ykhr738dUe) for chat and updates!

## License

[MIT](https://github.com/zenstackhq/zenstack/blob/main/LICENSE)
