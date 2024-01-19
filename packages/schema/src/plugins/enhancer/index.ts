import {
    PluginError,
    createProject,
    emitProject,
    resolvePath,
    saveProject,
    type PluginFunction,
} from '@zenstackhq/sdk';
import { getDefaultOutputFolder } from '../plugin-utils';
import { generate as generateEnhancer } from './enhance';
import { generate as generateModelMeta } from './model-meta';
import { generate as generatePolicy } from './policy';

export const name = 'Prisma Enhancer';
export const description = 'Generating PrismaClient enhancer';

const run: PluginFunction = async (model, options, _dmmf, globalOptions) => {
    let ourDir = options.output ? (options.output as string) : getDefaultOutputFolder(globalOptions);
    if (!ourDir) {
        throw new PluginError(name, `Unable to determine output path, not running plugin`);
    }
    ourDir = resolvePath(ourDir, options);

    const project = createProject();

    await generateModelMeta(model, options, project, ourDir);
    await generatePolicy(model, options, project, ourDir);
    await generateEnhancer(model, options, project, ourDir);

    let shouldCompile = true;
    if (typeof options.compile === 'boolean') {
        // explicit override
        shouldCompile = options.compile;
    } else if (globalOptions) {
        // from CLI or config file
        shouldCompile = globalOptions.compile;
    }

    if (!shouldCompile || options.preserveTsFiles === true) {
        await saveProject(project);
    }

    if (shouldCompile) {
        await emitProject(project);
    }
};

export default run;
