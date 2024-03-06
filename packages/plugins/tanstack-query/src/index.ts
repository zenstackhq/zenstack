import type { PluginFunction } from '@zenstackhq/sdk';
import { generate } from './generator';

export const name = 'Tanstack Query';

const run: PluginFunction = async (model, options, dmmf) => {
    if (!dmmf) {
        throw new Error('DMMF is required');
    }
    return generate(model, options, dmmf);
};

export default run;
