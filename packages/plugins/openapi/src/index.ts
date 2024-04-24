import { PluginError, PluginFunction } from '@zenstackhq/sdk';
import { RESTfulOpenAPIGenerator } from './rest-generator';
import { RPCOpenAPIGenerator } from './rpc-generator';

export const name = 'OpenAPI';

const run: PluginFunction = async (model, options, dmmf) => {
    if (!dmmf) {
        throw new Error('DMMF is required');
    }

    const flavor = options.flavor ? (options.flavor as string) : 'rpc';

    switch (flavor) {
        case 'rest':
            return new RESTfulOpenAPIGenerator(model, options, dmmf).generate();
        case 'rpc':
            return new RPCOpenAPIGenerator(model, options, dmmf).generate();
        default:
            throw new PluginError(name, `Unknown flavor: ${flavor}`);
    }
};

export default run;
