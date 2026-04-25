import { createConfig } from '@zenstackhq/tsdown-config';

export default createConfig({ entry: { index: 'src/index.ts', 'schema-generator': 'src/schema-generator.ts' } });
