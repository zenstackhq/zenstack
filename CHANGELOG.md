# 0.4.0 (2022-12-01)

### Features

-   `zenstack init` command for initializing a project, #109, [doc](https://zenstack.dev/#/quick-start?id=adding-to-an-existing-project).

-   Field constraint suport, #94, [doc](https://zenstack.dev/#/zmodel-field-constraint).

-   Support for server-side CRUD with access policy check (SSR), #126, [doc](https://zenstack.dev/#/server-side-rendering).

-   Options for disabling fetching in hooks (useful when arguments are not ready), #57, [doc](https://zenstack.dev/#/runtime-api?id=requestoptions).

-   Telemetry in CLI, #102, [doc](https://zenstack.dev/#/telemetry).

-   Iron-session based starter, #95, [link](https://github.com/zenstackhq/nextjs-iron-session-starter).

-   Barebone starter (without authentication), [link](https://github.com/zenstackhq/nextjs-barebone-starter).

### Fixes and improvements

-   Merge `@zenstackhq/internal` into `@zenstackhq/runtime` so as to have a single runtime dependency, #70.

-   More accurate log for access policy violation, #71.

-   `auth()` function's return type is now resolved to `User` model in ZModel, instead of `Any`, #65.

-   Improved ZModel type checking, #67, #46, #99.

-   Upgraded to Prisma 4.7.

### Breaking changes

-   @zenstackhq/runtime doesn't export anything now.

    Use @zenstackhq/runtime/types for type definitions shared between client and server, @zenstackhq/runtime/client for client-specific libaries (like React hooks), and @zenstackhq/runtime/server for server-specific libraries.
