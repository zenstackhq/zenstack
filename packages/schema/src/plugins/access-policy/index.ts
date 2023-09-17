import { PluginFunction } from '@zenstackhq/sdk';
import PolicyGenerator from './policy-guard-generator';

export const name = 'Access Policy';

const run: PluginFunction = async (model, options, _dmmf, globalOptions) => {
    return new PolicyGenerator().generate(model, options, globalOptions);
};

export default run;
