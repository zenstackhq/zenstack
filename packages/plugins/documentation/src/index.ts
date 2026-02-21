import type { CliPlugin } from '@zenstackhq/sdk';
import { generate } from './generator';

const plugin: CliPlugin = {
    name: 'Documentation Generator',
    statusText: 'Generating documentation',
    generate,
};

export default plugin;
