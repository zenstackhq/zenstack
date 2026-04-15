import { createConfig } from '@zenstackhq/tsdown-config';

export default createConfig({
    entry: {
        extension: 'src/extension/main.ts',
        'language-server': 'src/language-server/main.ts',
    },
    sourcemap: false,
    format: ['cjs'],
    deps: {
        neverBundle: ['vscode'],
        alwaysBundle: [/^(?!vscode$)/],
    },
});
