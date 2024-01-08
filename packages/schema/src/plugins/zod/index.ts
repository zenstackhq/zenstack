import { PluginFunction } from '@zenstackhq/sdk';
import invariant from 'tiny-invariant';
import { generate } from './generator';

export const name = 'Zod';
export const description = 'Generating Zod schemas';

const run: PluginFunction = async (model, options, dmmf, globalOptions) => {
    invariant(dmmf);
    return generate(model, options, dmmf, globalOptions);
};

export default run;
