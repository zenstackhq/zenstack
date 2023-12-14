import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/runtime/index.ts'],
    outDir: 'dist/runtime',
    splitting: false,
    sourcemap: true,
    clean: true,
    dts: true,
    format: ['cjs', 'esm'],
});
