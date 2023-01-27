import { DMMF } from '@prisma/generator-helper';
import { PluginOptions } from '@zenstackhq/sdk';
import { Model } from '@zenstackhq/sdk/ast';
import { generate } from './react-hooks-generator';

export const name = 'React';

export default async function run(model: Model, options: PluginOptions, dmmf: DMMF.Document) {
    return generate(model, options, dmmf);
}
