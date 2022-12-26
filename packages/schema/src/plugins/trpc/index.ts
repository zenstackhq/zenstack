import { DMMF } from '@prisma/generator-helper';
import { PluginOptions } from '@zenstackhq/sdk';
import { Model } from '@zenstackhq/sdk/ast';
import { generate } from './generator';

export const name = 'tRPC';

export default async function run(model: Model, options: PluginOptions, dmmf: DMMF.Document) {
    // based on: https://github.com/omar-dulaimi/prisma-trpc-generator
    return generate(model, options, dmmf);
}
