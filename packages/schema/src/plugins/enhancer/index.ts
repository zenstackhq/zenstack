import { PluginError, createProject, resolvePath, type PluginFunction, RUNTIME_PACKAGE } from '@zenstackhq/sdk';
import path from 'path';
import { getDefaultOutputFolder } from '../plugin-utils';
import { generate as generateEnhancer } from './enhance';
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
    const { dmmf } = await generateEnhancer(model, options, project, outDir);

    let prismaClientPath: string | undefined;
    if (dmmf) {
        // a logical client is generated
        if (typeof options.output === 'string') {
            // `options.output` is either relative to zmodel path or absolute
            prismaClientPath = path.join(options.output, 'prisma');
        } else {
            prismaClientPath = `${RUNTIME_PACKAGE}/prisma`;
        }
    }

    return { dmmf, warnings: [], prismaClientPath };
};

export default run;
