import { createConfig } from '@zenstackhq/tsdown-config';

export default createConfig({
    entry: {
        api: 'src/api/index.ts',
        express: 'src/adapter/express/index.ts',
        next: 'src/adapter/next/index.ts',
        fastify: 'src/adapter/fastify/index.ts',
        elysia: 'src/adapter/elysia/index.ts',
        nuxt: 'src/adapter/nuxt/index.ts',
        hono: 'src/adapter/hono/index.ts',
        sveltekit: 'src/adapter/sveltekit/index.ts',
        'tanstack-start': 'src/adapter/tanstack-start/index.ts',
    },
});
