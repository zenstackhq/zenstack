import { ZodSchemas, getDefaultModelMeta, getDefaultZodSchemas } from '@zenstackhq/runtime';
import { AdapterBaseOptions } from './types';

export function loadAssets(options: AdapterBaseOptions) {
    // model metadata
    const modelMeta = options.modelMeta ?? getDefaultModelMeta(options.loadPath);

    // zod schemas
    let zodSchemas: ZodSchemas | undefined;
    if (typeof options.zodSchemas === 'object') {
        zodSchemas = options.zodSchemas;
    } else if (options.zodSchemas === true) {
        zodSchemas = getDefaultZodSchemas(options.loadPath);
        if (!zodSchemas) {
            throw new Error('Unable to load zod schemas from default location');
        }
    }

    return { modelMeta, zodSchemas };
}
