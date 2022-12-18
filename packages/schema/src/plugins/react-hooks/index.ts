import { Model } from '@zenstackhq/language/ast';
import { PluginOptions } from '@zenstackhq/sdk';
import ReactHooksGenerator from './react-hooks-generator';

export const name = 'React Hooks';

export default async function run(model: Model, options: PluginOptions) {
    return new ReactHooksGenerator().generate(model, options);
}
