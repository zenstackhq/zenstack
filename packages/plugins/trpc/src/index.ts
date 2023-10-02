import type { DMMF } from '@prisma/generator-helper';
import { PluginOptions } from '@zenstackhq/sdk';
import { Model } from '@zenstackhq/sdk/ast';
import { generate } from './generator';

export const name = 'tRPC';
export const dependencies = ['@core/zod'];

export default async function run(model: Model, options: PluginOptions, dmmf: DMMF.Document) {
    return generate(model, options, dmmf);
}
