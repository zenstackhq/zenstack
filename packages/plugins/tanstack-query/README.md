# ZenStack TanStack Query Plugin

This package contains ZenStack plugin for generating [TanStack Query](https://tanstack.com/query/latest) hooks for **React**, **Vue**, **Svelte**, and **Angular**.

The generated hooks provide type-safe, optimistic updates, caching, and real-time synchronization for your Prisma models.

## Supported Frameworks

| Framework | TanStack Query Version | Package |
|-----------|------------------------|---------|
| React | v4, v5 (default) | [@tanstack/react-query](https://tanstack.com/query/latest/docs/framework/react/overview) |
| Vue | v4, v5 (default) | [@tanstack/vue-query](https://tanstack.com/query/latest/docs/framework/vue/overview) |
| Svelte | v4, v5 (default) | [@tanstack/svelte-query](https://tanstack.com/query/latest/docs/framework/svelte/overview) |
| Angular | v4, v5 (default) | [@tanstack/angular-query-experimental](https://tanstack.com/query/latest/docs/framework/angular/overview) |

## Installation

Install the plugin package:

```bash
npm install @zenstackhq/tanstack-query
```

Install the peer dependencies for your framework:

### React
```bash
npm install @tanstack/react-query
```

### Vue
```bash
npm install @tanstack/vue-query
```

### Svelte
```bash
npm install @tanstack/svelte-query
```

### Angular
```bash
npm install @tanstack/angular-query-experimental
```

## Configuration

Add the plugin to your ZModel file:

```zmodel
generator client {
    provider = "prisma-client-js"
}

plugin tanstack {
    provider = '@zenstackhq/tanstack-query'
    output = './src/lib/hooks' // output directory
    target = 'react' // 'react' | 'vue' | 'svelte' | 'angular'
    version = 'v5' // 'v4' | 'v5' (optional, defaults to 'v5')
}

model User {
    id    Int    @id @default(autoincrement())
    email String @unique
    name  String?
    posts Post[]
}

model Post {
    id       Int    @id @default(autoincrement())
    title    String
    content  String?
    author   User   @relation(fields: [authorId], references: [id])
    authorId Int
}
```

## Setup by Framework

### React Setup

```tsx
// app.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();

function App() {
    return (
        <QueryClientProvider client={queryClient}>
            {/* Your app components */}
        </QueryClientProvider>
    );
}
```

### Vue Setup

```vue
<!-- main.ts -->
<script setup>
import { VueQueryPlugin } from '@tanstack/vue-query';
import { createApp } from 'vue';

const app = createApp(App);
app.use(VueQueryPlugin);
app.mount('#app');
</script>
```

### Svelte Setup

```svelte
<!-- App.svelte -->
<script>
import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';

const queryClient = new QueryClient();
</script>

<QueryClientProvider client={queryClient}>
    <!-- Your app components -->
</QueryClientProvider>
```

### Angular Setup

```typescript
// app.config.ts or main.ts
import { provideAngularQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { provideHooksContext } from './lib/hooks'; // generated hooks

export const appConfig: ApplicationConfig = {
    providers: [
        provideAngularQuery(new QueryClient()),
        provideHooksContext({
            endpoint: 'http://localhost:3000/api/model', // your API endpoint
            fetch: fetch, // optional custom fetch function
        }),
        // other providers...
    ],
};
```

```typescript
// Or in a module
import { NgModule } from '@angular/core';
import { provideAngularQuery, QueryClient } from '@tanstack/angular-query-experimental';
import { provideHooksContext } from './lib/hooks';

@NgModule({
    providers: [
        provideAngularQuery(new QueryClient()),
        provideHooksContext({
            endpoint: 'http://localhost:3000/api/model',
        }),
    ],
})
export class AppModule {}
```

## Usage Examples

### React Usage

```tsx
import { useFindManyUser, useCreateUser, useUpdateUser, useDeleteUser } from './lib/hooks';

function UserList() {
    // Query users
    const { data: users, isLoading, error } = useFindManyUser({
        include: { posts: true },
        orderBy: { name: 'asc' },
    });

    // Create user mutation
    const createUser = useCreateUser();

    // Update user mutation
    const updateUser = useUpdateUser();

    // Delete user mutation
    const deleteUser = useDeleteUser();

    const handleCreateUser = () => {
        createUser.mutate({
            data: {
                email: 'new@example.com',
                name: 'New User',
            },
        });
    };

    if (isLoading) return <div>Loading...</div>;
    if (error) return <div>Error: {error.message}</div>;

    return (
        <div>
            <button onClick={handleCreateUser}>Create User</button>
            {users?.map(user => (
                <div key={user.id}>
                    <span>{user.name} - {user.email}</span>
                    <button onClick={() => updateUser.mutate({
                        where: { id: user.id },
                        data: { name: 'Updated Name' },
                    })}>
                        Update
                    </button>
                    <button onClick={() => deleteUser.mutate({ where: { id: user.id } })}>
                        Delete
                    </button>
                </div>
            ))}
        </div>
    );
}
```

### Vue Usage

```vue
<template>
    <div>
        <button @click="handleCreateUser">Create User</button>
        <div v-if="isLoading">Loading...</div>
        <div v-else-if="error">Error: {{ error.message }}</div>
        <div v-else>
            <div v-for="user in users" :key="user.id">
                <span>{{ user.name }} - {{ user.email }}</span>
                <button @click="updateUser.mutate({
                    where: { id: user.id },
                    data: { name: 'Updated Name' }
                })">Update</button>
                <button @click="deleteUser.mutate({ where: { id: user.id } })">Delete</button>
            </div>
        </div>
    </div>
</template>

<script setup>
import { useFindManyUser, useCreateUser, useUpdateUser, useDeleteUser } from './lib/hooks';

const { data: users, isLoading, error } = useFindManyUser({
    include: { posts: true },
    orderBy: { name: 'asc' },
});

const createUser = useCreateUser();
const updateUser = useUpdateUser();
const deleteUser = useDeleteUser();

const handleCreateUser = () => {
    createUser.mutate({
        data: {
            email: 'new@example.com',
            name: 'New User',
        },
    });
};
</script>
```

### Svelte Usage

```svelte
<script>
import { useFindManyUser, useCreateUser, useUpdateUser, useDeleteUser } from './lib/hooks';

$: query = useFindManyUser({
    include: { posts: true },
    orderBy: { name: 'asc' },
});

$: createUser = useCreateUser();
$: updateUser = useUpdateUser();
$: deleteUser = useDeleteUser();

function handleCreateUser() {
    $createUser.mutate({
        data: {
            email: 'new@example.com',
            name: 'New User',
        },
    });
}
</script>

<button on:click={handleCreateUser}>Create User</button>

{#if $query.isLoading}
    <div>Loading...</div>
{:else if $query.error}
    <div>Error: {$query.error.message}</div>
{:else}
    {#each $query.data || [] as user (user.id)}
        <div>
            <span>{user.name} - {user.email}</span>
            <button on:click={() => $updateUser.mutate({
                where: { id: user.id },
                data: { name: 'Updated Name' }
            })}>Update</button>
            <button on:click={() => $deleteUser.mutate({ where: { id: user.id } })}>Delete</button>
        </div>
    {/each}
{/if}
```

### Angular Usage

```typescript
// user-list.component.ts
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { 
    injectFindManyUser, 
    injectCreateUser, 
    injectUpdateUser, 
    injectDeleteUser 
} from './lib/hooks';

@Component({
    selector: 'app-user-list',
    standalone: true,
    imports: [CommonModule],
    template: `
        <button (click)="handleCreateUser()">Create User</button>
        
        @if (usersQuery.isLoading()) {
            <div>Loading...</div>
        } @else if (usersQuery.error()) {
            <div>Error: {{ usersQuery.error()?.message }}</div>
        } @else {
            @for (user of usersQuery.data(); track user.id) {
                <div>
                    <span>{{ user.name }} - {{ user.email }}</span>
                    <button (click)="updateUser.mutate({
                        where: { id: user.id },
                        data: { name: 'Updated Name' }
                    })">Update</button>
                    <button (click)="deleteUser.mutate({ where: { id: user.id } })">Delete</button>
                </div>
            }
        }
    `,
})
export class UserListComponent {
    // Inject query and mutation functions
    usersQuery = injectFindManyUser(() => ({
        include: { posts: true },
        orderBy: { name: 'asc' },
    }));

    createUser = injectCreateUser();
    updateUser = injectUpdateUser();
    deleteUser = injectDeleteUser();

    handleCreateUser() {
        this.createUser.mutate({
            data: {
                email: 'new@example.com',
                name: 'New User',
            },
        });
    }
}
```

## Generated Hook Types

For each Prisma model, the plugin generates the following hooks:

### Query Hooks
- `useFindMany{Model}` / `injectFindMany{Model}` - Find multiple records
- `useFindUnique{Model}` / `injectFindUnique{Model}` - Find a single record by unique field
- `useFindFirst{Model}` / `injectFindFirst{Model}` - Find the first matching record
- `useAggregate{Model}` / `injectAggregate{Model}` - Aggregate operations
- `useGroupBy{Model}` / `injectGroupBy{Model}` - Group by operations
- `useCount{Model}` / `injectCount{Model}` - Count records

### Infinite Query Hooks
- `useInfiniteFindMany{Model}` / `injectInfiniteFindMany{Model}` - Infinite scroll queries

### Mutation Hooks
- `useCreate{Model}` / `injectCreate{Model}` - Create new records
- `useCreateMany{Model}` / `injectCreateMany{Model}` - Create multiple records
- `useUpdate{Model}` / `injectUpdate{Model}` - Update existing records
- `useUpdateMany{Model}` / `injectUpdateMany{Model}` - Update multiple records
- `useUpsert{Model}` / `injectUpsert{Model}` - Create or update records
- `useDelete{Model}` / `injectDelete{Model}` - Delete records
- `useDeleteMany{Model}` / `injectDeleteMany{Model}` - Delete multiple records

## Advanced Configuration

### Custom API Endpoint

You can customize the API endpoint and fetch behavior:

#### React/Vue/Svelte
```typescript
// Wrap your app with the context provider
import { HooksProvider } from './lib/hooks';

const hooksConfig = {
    endpoint: 'https://api.myapp.com/model',
    fetch: customFetchFunction,
    logging: true, // Enable request logging
};

<HooksProvider value={hooksConfig}>
    <App />
</HooksProvider>
```

#### Angular
```typescript
// Provide configuration in your app
provideHooksContext({
    endpoint: 'https://api.myapp.com/model',
    fetch: customFetchFunction,
    logging: true,
})
```

### Optimistic Updates

Enable optimistic updates for better UX:

```typescript
const createUser = useCreateUser({
    optimisticUpdate: true,
});

// Angular
const createUser = injectCreateUser(() => ({
    optimisticUpdate: true,
}));
```

### Query Invalidation

Control when queries are invalidated after mutations:

```typescript
const updateUser = useUpdateUser({
    invalidateQueries: true, // default
});

// Or disable invalidation
const updateUser = useUpdateUser({
    invalidateQueries: false,
});
```

## TypeScript Support

All generated hooks are fully typed with your Prisma schema:

```typescript
// Fully typed based on your Prisma schema
const { data: users } = useFindManyUser({
    where: {
        email: { contains: 'example' }, // ✅ Valid
        invalidField: 'value', // ❌ TypeScript error
    },
    include: {
        posts: true, // ✅ Valid relation
        invalidRelation: true, // ❌ TypeScript error
    },
});
```

## Error Handling

```typescript
const { data, error, isLoading } = useFindManyUser();

if (error) {
    console.error('Query failed:', error.message);
}

// For mutations
const createUser = useCreateUser({
    onError: (error) => {
        console.error('Failed to create user:', error.message);
    },
    onSuccess: (data) => {
        console.log('User created:', data);
    },
});
```

## Server-Side Integration

The generated hooks work with any backend that implements the expected REST API format. For a complete full-stack solution, consider using:

- **ZenStack Server Adapters**: Express, Fastify, Next.js, SvelteKit, Nuxt
- **Custom REST API**: Implement endpoints matching the expected format

Visit [ZenStack Documentation](https://zenstack.dev) for complete integration guides and examples.

## Migration from Other Query Libraries

### From React Query/TanStack Query
The generated hooks are thin wrappers around TanStack Query, so you can gradually migrate existing queries while keeping the same caching and synchronization behavior.

### From Apollo Client/Relay
Replace your GraphQL queries with generated REST hooks while maintaining the same component structure and data flow patterns.

## Performance Considerations

- **Automatic Query Deduplication**: TanStack Query automatically deduplicates identical requests
- **Background Refetching**: Queries are automatically refetched when data becomes stale
- **Optimistic Updates**: Enable for instant UI feedback
- **Infinite Queries**: Use for large datasets with pagination

## License

Visit [Homepage](https://zenstack.dev) for more details.
