import base from '@zenstackhq/vitest-config/base';
import { defineConfig, mergeConfig, TestProjectConfiguration } from 'vitest/config';

const fullSchemaConfig: TestProjectConfiguration = {
    test: {
        name: 'full',
        include: ['test/**/*.test.ts'],
        env: {
            ZENSTACK_TEST_SCHEMA_TARGET: 'full',
        },
    },
};

const liteSchemaConfig: TestProjectConfiguration = {
    test: {
        name: 'lite',
        include: ['test/**/*.test.ts'],
        env: {
            ZENSTACK_TEST_SCHEMA_TARGET: 'lite',
        },
    },
};

export default mergeConfig(
    base,
    defineConfig({
        test: {
            typecheck: {
                enabled: true,
                include: ['test/**/*.ts'],
            },

            projects: [fullSchemaConfig, liteSchemaConfig],
        },
    }),
);
