import { PluginFunction } from '@zenstackhq/sdk';
import { invariant } from '@zenstackhq/runtime/local-helpers';
import { ZodSchemaGenerator } from './generator';

export const name = 'Zod';
export const description = 'Generating Zod schemas';

const run: PluginFunction = async (model, options, dmmf, globalOptions) => {
    invariant(dmmf);
    const generator = new ZodSchemaGenerator(model, options, dmmf, globalOptions);
    return generator.generate();
};

export default run;
