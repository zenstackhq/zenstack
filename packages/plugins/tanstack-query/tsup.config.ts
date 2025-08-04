import { defineConfig } from 'tsup';

export default defineConfig({
    entry: [
        'src/runtime/index.ts',
        'src/runtime/react.ts',
        'src/runtime/vue.ts',
        'src/runtime/svelte.ts',
        'src/runtime/angular.ts',
    ],
    outDir: 'dist/runtime',
    splitting: false,
    sourcemap: true,
    clean: true,
    dts: true,
    format: ['cjs', 'esm'],
});
