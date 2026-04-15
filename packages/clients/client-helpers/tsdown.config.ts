import { createConfig } from '@zenstackhq/tsdown-config';

export default createConfig({
    entry: {
        index: 'src/index.ts',
        fetch: 'src/fetch.ts',
    },
    format: ['esm'],
});
