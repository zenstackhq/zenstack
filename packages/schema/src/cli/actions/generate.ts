import { PluginError } from '@zenstackhq/sdk';
import { isPlugin } from '@zenstackhq/sdk/ast';
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
    showNotification,
} from '../cli-util';
import { PluginRunner, PluginRunnerOptions } from '../plugin-runner';

type Options = {
    schema?: string;
    output?: string;
    dependencyCheck: boolean;
    versionCheck: boolean;
    compile: boolean;
    withPlugins?: string[];
    withoutPlugins?: string[];
    defaultPlugins: boolean;
    offline?: boolean;
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
    if (packages.length > 0) {
        const versions = new Set<string>(packages.map((p) => p.version).filter((v): v is string => !!v));
        if (versions.size > 1) {
            console.warn(
                colors.yellow(
                    'WARNING: Multiple versions of Zenstack packages detected. Run "zenstack info" to see details.'
                )
            );
        }
    }

    await runPlugins(options);

    // note that we can't run online jobs concurrently with plugins because
    // plugins are CPU-bound and can cause false timeout
    const postJobs: Promise<void>[] = [];

    if (options.versionCheck && !options.offline) {
        postJobs.push(checkNewVersion());
    }

    if (!options.offline) {
        postJobs.push(showNotification());
    }

    await Promise.all(postJobs);
}

async function runPlugins(options: Options) {
    const schema = options.schema ?? getDefaultSchemaLocation();

    const model = await loadDocument(schema);

    for (const name of [...(options.withPlugins ?? []), ...(options.withoutPlugins ?? [])]) {
        const pluginDecl = model.declarations.find((d) => isPlugin(d) && d.name === name);
        if (!pluginDecl) {
            console.error(colors.red(`Plugin "${name}" not found in schema.`));
            throw new CliError(`Plugin "${name}" not found in schema.`);
        }
    }

    const runnerOpts: PluginRunnerOptions = {
        schema: model,
        schemaPath: path.resolve(schema),
        withPlugins: options.withPlugins,
        withoutPlugins: options.withoutPlugins,
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
