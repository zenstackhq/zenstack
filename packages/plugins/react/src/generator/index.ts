import type { DMMF } from '@prisma/generator-helper';
import { PluginError, type PluginOptions } from '@zenstackhq/sdk';
import type { Model } from '@zenstackhq/sdk/ast';
import { generate as reactQueryGenerate } from './react-query';
import { generate as swrGenerate } from './swr';

export async function generate(model: Model, options: PluginOptions, dmmf: DMMF.Document) {
    const fetcher = (options.fetcher as string) ?? 'swr';
    switch (fetcher) {
        case 'swr':
            return swrGenerate(model, options, dmmf);
        case 'react-query':
            return reactQueryGenerate(model, options, dmmf);
        default:
            throw new PluginError(`Unknown "fetcher" option: ${fetcher}, use "swr" or "react-query"`);
    }
}
