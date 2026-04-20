import { defineConfig } from 'tsdown';

type Config = Parameters<typeof defineConfig>[0];

/**
 * Creates a tsdown config with standard ZenStack package defaults:
 * outDir: 'dist', sourcemap: true, format: ['cjs', 'esm'], dts: true
 */
export function createConfig(overrides: Config = {}): ReturnType<typeof defineConfig> {
    return defineConfig({
        outDir: 'dist',
        sourcemap: true,
        format: ['cjs', 'esm'],
        dts: true,
        ...overrides,
    });
}
