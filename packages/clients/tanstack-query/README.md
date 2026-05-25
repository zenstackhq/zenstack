# @zenstackhq/tanstack-query

[TanStack Query](https://tanstack.com/query) integration for ZenStack. Generates fully typed query and mutation hooks from your ZModel schema for React, Vue, and Svelte, with built-in cache invalidation and optimistic update helpers.

## Supported Frameworks

- **React** — `@zenstackhq/tanstack-query/react`
- **Vue** — `@zenstackhq/tanstack-query/vue`
- **Svelte** — `@zenstackhq/tanstack-query/svelte`

## Installation

```bash
npm install @zenstackhq/tanstack-query @tanstack/react-query
```

Replace `@tanstack/react-query` with `@tanstack/vue-query` or `@tanstack/svelte-query` as needed.

## Usage (React example)

```tsx
import { useClientQueries } from '@zenstackhq/tanstack-query/react';
import { schema } from './schema';

function PostList() {
    const client = useClientQueries(schema);

    const { data: posts } = client.post.useQuery({
        where: { published: true },
        include: { author: true },
    });

    const { mutate: createPost } = client.post.useMutation();

    return <ul>{posts?.map((p) => <li key={p.id}>{p.title}</li>)}</ul>;
}
```

## Learn More

- [ZenStack Documentation](https://zenstack.dev/docs/service/client-sdk/tanstack-query/)
