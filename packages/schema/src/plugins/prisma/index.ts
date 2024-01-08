import { PluginFunction } from '@zenstackhq/sdk';
import PrismaSchemaGenerator from './schema-generator';

export const name = 'Prisma';
export const description = 'Generating Prisma schema';

const run: PluginFunction = async (model, options, _dmmf, _globalOptions) => {
    return new PrismaSchemaGenerator().generate(model, options);
};

export default run;
