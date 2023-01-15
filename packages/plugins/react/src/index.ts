import { PluginOptions } from '@zenstackhq/sdk';
import { Model } from '@zenstackhq/sdk/ast';
import { generate } from './react-hooks-generator';

export const name = 'React';

export default async function run(model: Model, options: PluginOptions) {
    return generate(model, options);
}
