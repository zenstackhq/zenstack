# Types

Module `@zenstackhq/runtime/types` contains type definitions of entities, filters, sorting, etc., generated from ZModel data models. The types can be used in both the front-end and the backend code.

Suppose a `User` model is defined in ZModel:

```zmodel
model User {
    id String @id @default(cuid())
    email String @unique @email
    password String @password @omit
    name String?
    posts Post[]
}
```

The following types are generated:

## Entity type

````ts
export type User = {
  id: string
  email: string
  password: string | null
  name: string | null
  posts: Post[]
}```

This type serves as the return type of the generated React hooks:

```ts
import { type User } from '@zenstackhq/runtime/types';
import { useUser } from '@zenstackhq/runtime/client';

export function MyComponent() {
    const { find } = useUser();
    const result = find();
    const users: User[] = result.data;
    ...
}
````

Backend database access API also returns the same type:

```ts
const users: User[] = await service.db.user.find();
```

## Filter and sort type

Types for filtering and sorting entites are also generated:

```ts
export type UserFindManyArgs = {
    select?: UserSelect | null;
    include?: UserInclude | null;
    where?: UserWhereInput;
    orderBy?: Enumerable<UserOrderByWithRelationInput>;
    ...
};
```

You can use it like:

```ts
const { find } = useUser();
const { data: users } = find({
    where: {
        email: {
            endsWith: '@zenstack.dev',
        },
    },
    orderBy: [
        {
            email: 'asc',
        },
    ],
    include: {
        // include related Post entities
        posts: true,
    },
});
```
