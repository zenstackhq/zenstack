import { PluginError } from '@zenstackhq/sdk';
import colors from 'colors';
import path from 'path';
import { CliError } from '../cli-error';
import {
    checkNewVersion,
    checkRequiredPackage,
    getZenStackPackages,
    loadDocument,
    requiredPrismaVersion,
} from '../cli-util';
import { PluginRunner, PluginRunnerOptions } from '../plugin-runner';

type Options = {
    schema: string;
    output?: string;
    dependencyCheck: boolean;
    versionCheck: boolean;
    compile: boolean;
    defaultPlugins: boolean;
};

/**
 * CLI action for generating code from schema
 */
export async function generate(projectPath: string, options: Options) {
    if (options.dependencyCheck) {
        checkRequiredPackage('prisma', requiredPrismaVersion);
        checkRequiredPackage('@prisma/client', requiredPrismaVersion);
    }

    // check for multiple versions of Zenstack packages
    const packages = getZenStackPackages(projectPath);
    if (packages) {
        const versions = new Set<string>(packages.map((p) => p.version));
        if (versions.size > 1) {
            console.warn(
                colors.yellow(
                    'WARNING: Multiple versions of Zenstack packages detected. Run "zenstack info" to see details.'
                )
            );
        }
    }

    const tasks = [runPlugins(options)];

    if (options.versionCheck) {
        tasks.push(checkNewVersion());
    }

    await Promise.all(tasks);
}

async function runPlugins(options: Options) {
    const model = await loadDocument(options.schema);

    const runnerOpts: PluginRunnerOptions = {
        schema: model,
        schemaPath: path.resolve(options.schema),
        defaultPlugins: options.defaultPlugins,
        output: options.output,
        compile: options.compile,
    };

    try {
        await new PluginRunner().run(runnerOpts);
    } catch (err) {
        if (err instanceof PluginError) {
            console.error(colors.red(`${err.plugin}: ${err.message}`));
            throw new CliError(err.message);
        } else {
            throw err;
        }
    }
}
