import { defineConfig } from 'tsup';

export default defineConfig({
    entry: {
        index: 'src/index.ts',
    },
    outDir: 'dist',
    splitting: false,
    sourcemap: true,
    clean: true,
    dts: true,
    format: ['esm', 'cjs'],
    esbuildOptions: (options) => {
        options.logOverride = {
            'empty-import-meta': 'silent',
        };
    },
});
