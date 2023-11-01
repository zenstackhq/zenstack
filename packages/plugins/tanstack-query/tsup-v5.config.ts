import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/runtime-v5/index.ts', 'src/runtime-v5/react.ts', 'src/runtime-v5/vue.ts', 'src/runtime-v5/svelte.ts'],
    outDir: 'dist/runtime-v5',
    splitting: false,
    sourcemap: true,
    clean: true,
    dts: true,
    format: ['cjs', 'esm'],
});
