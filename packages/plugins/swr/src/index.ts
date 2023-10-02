import type { DMMF } from '@prisma/generator-helper';
import type { PluginOptions } from '@zenstackhq/sdk';
import type { Model } from '@zenstackhq/sdk/ast';
import { generate } from './generator';

export const name = 'SWR';

export default async function run(model: Model, options: PluginOptions, dmmf: DMMF.Document) {
    return generate(model, options, dmmf);
}
