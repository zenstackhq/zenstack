import { createConfig } from '@zenstackhq/tsdown-config';

export default createConfig({
    entry: {
        index: 'src/index.ts',
        ast: 'src/ast.ts',
        utils: 'src/utils.ts',
        factory: 'src/factory/index.ts',
    },
});
