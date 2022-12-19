import { Model } from '@zenstackhq/language/ast';
import { PluginOptions } from '@zenstackhq/sdk';
import { generate } from './react-hooks-generator';

export const name = 'React Hooks';

export default async function run(model: Model, options: PluginOptions) {
    return generate(model, options);
}
