# Runtime API

## `@zenstackhq/runtime/types`

This module contains types generated from ZModel data models. These types are shared by both the client-side and the server-side code.

The generated types include (for each data model defined):

-   Entity type
-   Data structure for creating/updating entities
-   Data structure for selecting entities - including filtering and sorting

Take `User` model as an example, here're some of the most commonly used types:

-   `User`

    The entity type which directly corresponds to the data mdoel.

-   `UserFindUniqueArgs`

    Argument type for finding a unique `User`.

-   `UserFindManyArgs`

    Argument type for finding a list of `User`s.

-   `UserCreateArgs`

    Argument for creating a new `User`.

-   `UserUpdateArgs`

    Argument for updating an existing `User`.

## `@zenstackhq/runtime/client`

This module contains API for client-side programming, including the generated React hooks and auxiliary types, like options and error types.

_NOTE_ You should not import this module into server-side code, like getServerSideProps, or API endpoint.

A `useXXX` API is generated fo each data model for getting the React hooks. The following code uses `User` model as an example.

```ts
const { get, find, create, update, del } = useUser();
```

### `RequestOptions`

Options controlling hooks' fetch behavior.

```ts
type RequestOptions<T> = {
    // indicates if fetch should be disabled
    disabled?: boolean;

    // provides initial data, which is immediately available
    // before fresh data is fetched (usually used with SSR)
    initialData?: T;
};
```

### `HooksError`

Error thrown for failure of `create`, `update` and `delete` hooks.

```ts
export type HooksError = {
    status: number;
    info: {
        code: ServerErrorCode;
        message: string;
    };
};
```

#### `ServerErrorCode`

| Code                           | Description                                                                                   |
| ------------------------------ | --------------------------------------------------------------------------------------------- |
| ENTITY_NOT_FOUND               | The specified entity cannot be found                                                          |
| INVALID_REQUEST_PARAMS         | The request parameter is invalid, either containing invalid fields or missing required fields |
| DENIED_BY_POLICY               | The request is rejected by policy checks                                                      |
| UNIQUE_CONSTRAINT_VIOLATION    | Violation of database unique constraints                                                      |
| REFERENCE_CONSTRAINT_VIOLATION | Violation of database reference constraint (aka. foreign key constraints)                     |
| READ_BACK_AFTER_WRITE_DENIED   | A write operation succeeded but the result cannot be read back due to policy control          |

### `get`

```ts
function get(id: string | undefined, args?: UserFindFirstArgs, options?: RequestOptions): SWRResponse<User>;
```

### `find`

```ts
function find(args?: UserFindManyArgs, options?: RequestOptions): SWRResponse<User[]>;
```

### `create`

```ts
function create(args?: UserCreateArgs): Promise<User | undefined>;
```

### `update`

```ts
function update(id: string, args?: UserUpdateArgs): Promise<User | undefined>;
```

### `del`

```ts
function del(id: string, args?: UserDeleteArgs): Promise<User | undefined>;
```

## `@zenstackhq/runtime/server`

This module contains API for server-side programming. The following declarations are exported:

### `service`

The default export of this module is a `service` object which encapsulates most of the server-side APIs.

#### Server-side CRUD

The `service` object contains members for each of the data models, each containing server-side CRUD APIs. These APIs can be used for doing CRUD operations without HTTP request overhead, while still fully protected by access policies.

The server-side CRUD APIs have similar signature with client-side hooks, except that they take an extra `queryContext` parameter for passing in the current login user. They're usually used for implementing SSR or custom API endpoints.

-   get

    ```ts
    async get(
        context: QueryContext,
        id: string,
        args?: UserFindFirstArgs
    ): Promise<User | undefined>;
    ```

-   find

    ```ts
    async find(
        context: QueryContext,
        args?: UserFindManyArgs
    ): Promise<User[]>;
    ```

-   create

    ```ts
    async create(
        context: QueryContext,
        args?: UserCreateArgs
    ): Promise<User>;
    ```

-   update

    ```ts
    async update(
        context: QueryContext,
        id: string,
        args?: UserUpdateArgs
    ): Promise<User>;
    ```

-   del
    ```ts
    async del(
        context: QueryContext,
        id: string,
        args?: UserDeleteArgs
    ): Promise<User>;
    ```

#### Direct database access

The `service.db` object contains a member field for each data model defined, which you can use to conduct database operations for that model.

_NOTE_ These database operations are **NOT** protected by access policies.

Take `User` model for example:

```ts
import service from '@zenstackhq/runtime/server';

// find all users
const users = service.db.user.find();

// update a user
await service.db.user.update({
    where: { id: userId },
    data: { email: newEmail },
});
```

The server-side database access API uses the [same set of typing](#zenstackhqruntimetypes) as the client side. The `service.db` object is a Prisma Client, and you can find all API documentations [here](https://www.prisma.io/docs/reference/api-reference/prisma-client-reference ':target=blank').

### `requestHandler`

Function for handling API endpoint requests. Used for installing the generated CRUD services onto an API route:

```ts
// pages/api/zenstack/[...path].ts

import service from '@zenstackhq/runtime';
import {
    requestHandler,
    type RequestHandlerOptions,
} from '@zenstackhq/runtime/server';
import { NextApiRequest, NextApiResponse } from 'next';

const options: RequestHandlerOptions = {
    // a callback for getting the current login user
    async getServerUser(req: NextApiRequest, res: NextApiResponse) {
        ...
    },
};
export default requestHandler(service, options);
```

The `getServerUser` callback method is used for getting the current login user on the server side. Its implementation depends on how you authenticate users.
