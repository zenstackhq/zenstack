import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        deps: {
            interopDefault: true,
        },
        include: ['**/*.test.ts'],
        testTimeout: 100000,
        hookTimeout: 100000,
        coverage: {
            provider: 'v8',
            exclude: ['tests/**', 'samples/**', 'packages/**/tests/**'],
        },
    },
});
