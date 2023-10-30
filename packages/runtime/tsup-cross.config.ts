import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/cross/index.ts'],
    outDir: 'dist/cross',
    splitting: false,
    sourcemap: true,
    clean: true,
    dts: true,
    format: ['cjs', 'esm'],
});
