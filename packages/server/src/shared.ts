/* eslint-disable @typescript-eslint/no-var-requires */
import type { ModelMeta, ZodSchemas } from '@zenstackhq/runtime';
import { AdapterBaseOptions } from './types';

export function loadAssets(options: AdapterBaseOptions) {
    // model metadata
    const modelMeta = options.modelMeta ?? getDefaultModelMeta();

    // zod schemas
    let zodSchemas: ZodSchemas | undefined;
    if (typeof options.zodSchemas === 'object') {
        zodSchemas = options.zodSchemas;
    } else if (options.zodSchemas === true) {
        zodSchemas = getDefaultZodSchemas();
        if (!zodSchemas) {
            throw new Error('Unable to load zod schemas from default location');
        }
    }

    return { modelMeta, zodSchemas };
}

/**
 * Load model metadata.
 *
 * @param loadPath The path to load model metadata from. If not provided,
 * will use default load path.
 */
export function getDefaultModelMeta(): ModelMeta {
    try {
        return require('@zenstackhq/runtime/model-meta').default;
    } catch {
        throw new Error('Model meta cannot be loaded. Please make sure "zenstack generate" has been run.');
    }
}

/**
 * Load zod schemas.
 *
 * @param loadPath The path to load zod schemas from. If not provided,
 * will use default load path.
 */
export function getDefaultZodSchemas(): ZodSchemas | undefined {
    try {
        return require('@zenstackhq/runtime/zod');
    } catch {
        return undefined;
    }
}
