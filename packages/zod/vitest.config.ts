import base from '@zenstackhq/vitest-config/base';
import { defineConfig, mergeConfig } from 'vitest/config';

export default mergeConfig(
    base,
    defineConfig({
        test: {
            typecheck: {
                enabled: true,
                include: ['test/**/*.ts'],
            },

            projects: [
                {
                    test: {
                        name: 'full',
                        include: ['test/**/*.test.ts'],
                        env: {
                            ZENSTACK_TEST_SCHEMA_TARGET: 'full',
                        },
                    },
                },

                {
                    test: {
                        name: 'lite',
                        include: ['test/**/*.test.ts'],
                        env: {
                            ZENSTACK_TEST_SCHEMA_TARGET: 'lite',
                        },
                    },
                },
            ],
        },
    }),
);
