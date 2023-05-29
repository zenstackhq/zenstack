import { DMMF } from '@prisma/generator-helper';
import { PluginError, PluginOptions } from '@zenstackhq/sdk';
import { Model } from '@zenstackhq/sdk/ast';
import { RESTfulOpenAPIGenerator } from './rest-generator';
import { RPCOpenAPIGenerator } from './rpc-generator';

export const name = 'OpenAPI';

export default async function run(model: Model, options: PluginOptions, dmmf: DMMF.Document) {
    const flavor = options.flavor ? (options.flavor as string) : 'rpc';

    switch (flavor) {
        case 'rest':
            return new RESTfulOpenAPIGenerator(model, options, dmmf).generate();
        case 'rpc':
            return new RPCOpenAPIGenerator(model, options, dmmf).generate();
        default:
            throw new PluginError(name, `Unknown flavor: ${flavor}`);
    }
}
