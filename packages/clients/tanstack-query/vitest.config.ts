import base from '@zenstackhq/vitest-config/base';
import { defineConfig, mergeConfig } from 'vitest/config';

export default mergeConfig(
    base,
    defineConfig({
        test: {
            include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
            typecheck: {
                enabled: true,
                tsconfig: 'tsconfig.test.json',
            },
        },
    }),
);
