import { httpBatchLink } from 'trpc-nuxt/client';
import type { AppRouter } from '~/server/trpc/routers';
import { createTRPCNuxtClient } from '~/server/trpc/routers/generated/client/nuxt';

export default defineNuxtPlugin(() => {
    /**
     * createTRPCNuxtClient adds a `useQuery` composable
     * built on top of `useAsyncData`.
     */
    const client = createTRPCNuxtClient<AppRouter>({
        links: [
            httpBatchLink({
                url: '/api/trpc',
            }),
        ],
    });

    return {
        provide: {
            client,
        },
    };
});
