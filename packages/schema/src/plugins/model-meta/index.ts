import {
    createProject,
    generateModelMeta,
    getDataModels,
    PluginError,
    PluginFunction,
    resolvePath,
} from '@zenstackhq/sdk';
import path from 'path';
import { getDefaultOutputFolder } from '../plugin-utils';

export const name = 'Model Metadata';

const run: PluginFunction = async (model, options, _dmmf, globalOptions) => {
    let output = options.output ? (options.output as string) : getDefaultOutputFolder(globalOptions);
    if (!output) {
        throw new PluginError(options.name, `Unable to determine output path, not running plugin`);
    }

    output = resolvePath(output, options);
    const outFile = path.join(output, 'model-meta.ts');
    const dataModels = getDataModels(model);
    const project = createProject();

    let shouldCompile = true;
    if (typeof options.compile === 'boolean') {
        // explicit override
        shouldCompile = options.compile;
    } else if (globalOptions) {
        // from CLI or config file
        shouldCompile = globalOptions.compile;
    }

    await generateModelMeta(project, dataModels, outFile, shouldCompile, options.preserveTsFiles === true);
};

export default run;
