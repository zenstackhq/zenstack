import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/browser/index.ts'],
    outDir: 'dist/browser',
    splitting: false,
    sourcemap: true,
    clean: true,
    dts: true,
    format: ['cjs', 'esm'],
});
