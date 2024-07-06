import { PluginError } from '@zenstackhq/sdk';
import colors from 'colors';
import path from 'path';
import { CliError } from '../cli-error';
import {
    checkNewVersion,
    checkRequiredPackage,
    getDefaultSchemaLocation,
    getZenStackPackages,
    loadDocument,
    requiredPrismaVersion,
} from '../cli-util';
import { PluginRunner, PluginRunnerOptions } from '../plugin-runner';

type Options = {
    schema?: string;
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

    await runPlugins(options);

    if (options.versionCheck) {
        // note that we can't run plugins and do version check concurrently because
        // plugins are CPU-bound and can cause version check to false timeout
        await checkNewVersion();
    }
}

async function runPlugins(options: Options) {
    const schema = options.schema ?? getDefaultSchemaLocation();

    const model = await loadDocument(schema);

    const runnerOpts: PluginRunnerOptions = {
        schema: model,
        schemaPath: path.resolve(schema),
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
