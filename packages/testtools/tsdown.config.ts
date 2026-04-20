import fs from 'fs';
import { createConfig } from '@zenstackhq/tsdown-config';

export default createConfig({
    entry: { index: 'src/index.ts' },
    deps: {
        neverBundle: ['vitest'],
    },
    async onSuccess() {
        fs.cpSync('src/types.d.ts', 'dist/types.d.ts', { force: true });
    },
});
