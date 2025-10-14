import {
    PluginError,
    RUNTIME_PACKAGE,
    createProject,
    getPrismaClientGenerator,
    normalizedRelative,
    resolvePath,
    type PluginFunction,
} from '@zenstackhq/sdk';
import path from 'path';
import { getDefaultOutputFolder } from '../plugin-utils';
import { EnhancerGenerator } from './enhance';
import { generate as generateModelMeta } from './model-meta';
import { generate as generatePolicy } from './policy';

export const name = 'Prisma Enhancer';
export const description = 'Generating PrismaClient enhancer';

const run: PluginFunction = async (model, options, _dmmf, globalOptions) => {
    let outDir = options.output ? (options.output as string) : getDefaultOutputFolder(globalOptions);
    if (!outDir) {
        throw new PluginError(name, `Unable to determine output path, not running plugin`);
    }
    outDir = resolvePath(outDir, options);

    const project = globalOptions?.tsProject ?? createProject();

    await generateModelMeta(model, options, project, outDir);
    await generatePolicy(model, options, project, outDir);
    const { dmmf, newPrismaClientDtsPath } = await new EnhancerGenerator(model, options, project, outDir).generate();

    let prismaClientPath: string | undefined;
    if (dmmf) {
        // a logical client is generated
        if (options.output || globalOptions?.output) {
            // handle custom output path

            // get the absolute path of the prisma client types
            const prismaGenerator = getPrismaClientGenerator(model);
            const prismaClientPathAbs = path.resolve(outDir, prismaGenerator?.isNewGenerator ? 'client' : 'models');

            // resolve it relative to the schema path
            prismaClientPath = normalizedRelative(path.dirname(options.schemaPath), prismaClientPathAbs);
        } else {
            prismaClientPath = `${RUNTIME_PACKAGE}/models`;
        }
    }

    return { dmmf, warnings: [], prismaClientPath, prismaClientDtsPath: newPrismaClientDtsPath };
};

export default run;
