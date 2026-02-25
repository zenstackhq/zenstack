import { defineConfig } from 'tsup';

export default defineConfig({
    entry: {
        index: 'src/index.ts',
    },
    outDir: 'dist',
    splitting: false,
    sourcemap: true,
    dts: true,
    format: ['cjs', 'esm'],
});
