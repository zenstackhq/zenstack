import {
    PluginError,
    createProject,
    emitProject,
    getPrismaClientImportSpec,
    resolvePath,
    saveProject,
    type PluginFunction,
} from '@zenstackhq/sdk';
import path from 'path';
import { getDefaultOutputFolder } from '../plugin-utils';

export const name = 'Prisma Enhancer';

const run: PluginFunction = async (_model, options, _dmmf, globalOptions) => {
    let output = options.output ? (options.output as string) : getDefaultOutputFolder(globalOptions);
    if (!output) {
        throw new PluginError(options.name, `Unable to determine output path, not running plugin`);
    }

    output = resolvePath(output, options);
    const outFile = path.join(output, 'enhance.ts');
    const project = createProject();

    let shouldCompile = true;
    if (typeof options.compile === 'boolean') {
        // explicit override
        shouldCompile = options.compile;
    } else if (globalOptions) {
        // from CLI or config file
        shouldCompile = globalOptions.compile;
    }

    project.createSourceFile(
        outFile,
        `import { createEnhancement, type WithPolicyContext, type EnhancementOptions, type ZodSchemas } from '@zenstackhq/runtime';
import modelMeta from './model-meta';
import policy from './policy';
${options.withZodSchemas ? "import * as zodSchemas from './zod';" : 'const zodSchemas = undefined;'}
import { Prisma } from '${getPrismaClientImportSpec(_model, output)}';

export function enhance<DbClient extends object>(prisma: DbClient, context?: WithPolicyContext, options?: EnhancementOptions): DbClient {
    return createEnhancement(prisma, {
        modelMeta,
        policy,
        zodSchemas: zodSchemas as unknown as (ZodSchemas | undefined),
        prismaModule: Prisma,
        ...options
    }, context);
}
`,
        { overwrite: true }
    );

    if (!shouldCompile || options.preserveTsFiles === true) {
        await saveProject(project);
    }

    if (shouldCompile) {
        await emitProject(project);
    }
};

export default run;
