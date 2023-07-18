import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/runtime/index.ts', 'src/runtime/react.ts', 'src/runtime/svelte.ts'],
    outDir: 'dist/runtime',
    splitting: false,
    sourcemap: true,
    clean: true,
    dts: true,
    format: ['cjs', 'esm'],
});
