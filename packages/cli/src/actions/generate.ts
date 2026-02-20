import { invariant, singleDebounce } from '@zenstackhq/common-helpers';
import { ZModelLanguageMetaData } from '@zenstackhq/language';
import { type AbstractDeclaration, isPlugin, LiteralExpr, Plugin, type Model } from '@zenstackhq/language/ast';
import { getLiteral, getLiteralArray } from '@zenstackhq/language/utils';
import { type CliPlugin } from '@zenstackhq/sdk';
import colors from 'colors';
import { createJiti } from 'jiti';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { watch } from 'chokidar';
import ora, { type Ora } from 'ora';
import { CliError } from '../cli-error';
import * as corePlugins from '../plugins';
import { getOutputPath, getSchemaFile, getZenStackPackages, loadSchemaDocument } from './action-utils';
import semver from 'semver';

type Options = {
    schema?: string;
    output?: string;
    silent: boolean;
    watch: boolean;
    lite?: boolean;
    liteOnly?: boolean;
    generateModels?: boolean;
    generateInput?: boolean;
};

/**
 * CLI action for generating code from schema
 */
export async function run(options: Options) {
    try {
        await checkForMismatchedPackages(process.cwd());
    } catch (err) {
        console.warn(colors.yellow(`Failed to check for mismatched ZenStack packages: ${err}`));
    }
    const model = await pureGenerate(options, false);

    if (options.watch) {
        const logsEnabled = !options.silent;

        if (logsEnabled) {
            console.log(colors.green(`\nEnabled watch mode!`));
        }

        const schemaExtensions = ZModelLanguageMetaData.fileExtensions;

        // Get real models file path (cuz its merged into single document -> we need use cst nodes)
        const getRootModelWatchPaths = (model: Model) =>
            new Set<string>(
                (
                    model.declarations.filter(
                        (v) =>
                            v.$cstNode?.parent?.element.$type === 'Model' &&
                            !!v.$cstNode.parent.element.$document?.uri?.fsPath,
                    ) as AbstractDeclaration[]
                ).map((v) => v.$cstNode!.parent!.element.$document!.uri!.fsPath),
            );

        const watchedPaths = getRootModelWatchPaths(model);

        if (logsEnabled) {
            const logPaths = [...watchedPaths].map((at) => `- ${at}`).join('\n');
            console.log(`Watched file paths:\n${logPaths}`);
        }

        const watcher = watch([...watchedPaths], {
            alwaysStat: false,
            ignoreInitial: true,
            ignorePermissionErrors: true,
            ignored: (at) => !schemaExtensions.some((ext) => at.endsWith(ext)),
        });

        // prevent save multiple files and run multiple times
        const reGenerateSchema = singleDebounce(
            async () => {
                if (logsEnabled) {
                    console.log('Got changes, run generation!');
                }

                try {
                    const newModel = await pureGenerate(options, true);
                    const allModelsPaths = getRootModelWatchPaths(newModel);
                    const newModelPaths = [...allModelsPaths].filter((at) => !watchedPaths.has(at));
                    const removeModelPaths = [...watchedPaths].filter((at) => !allModelsPaths.has(at));

                    if (newModelPaths.length) {
                        if (logsEnabled) {
                            const logPaths = newModelPaths.map((at) => `- ${at}`).join('\n');
                            console.log(`Added file(s) to watch:\n${logPaths}`);
                        }

                        newModelPaths.forEach((at) => watchedPaths.add(at));
                        watcher.add(newModelPaths);
                    }

                    if (removeModelPaths.length) {
                        if (logsEnabled) {
                            const logPaths = removeModelPaths.map((at) => `- ${at}`).join('\n');
                            console.log(`Removed file(s) from watch:\n${logPaths}`);
                        }

                        removeModelPaths.forEach((at) => watchedPaths.delete(at));
                        watcher.unwatch(removeModelPaths);
                    }
                } catch (e) {
                    console.error(e);
                }
            },
            500,
            true,
        );

        watcher.on('unlink', (pathAt) => {
            if (logsEnabled) {
                console.log(`Removed file from watch: ${pathAt}`);
            }

            watchedPaths.delete(pathAt);
            watcher.unwatch(pathAt);

            reGenerateSchema();
        });

        watcher.on('change', () => {
            reGenerateSchema();
        });
    }
}

async function pureGenerate(options: Options, fromWatch: boolean) {
    const start = Date.now();

    const schemaFile = getSchemaFile(options.schema);

    const model = await loadSchemaDocument(schemaFile);
    const outputPath = getOutputPath(options, schemaFile);

    await runPlugins(schemaFile, model, outputPath, options);

    if (!options.silent) {
        console.log(colors.green(`Generation completed successfully in ${Date.now() - start}ms.\n`));

        if (!fromWatch) {
            console.log(`You can now create a ZenStack client with it.

\`\`\`ts
import { ZenStackClient } from '@zenstackhq/orm';
import { schema } from '${path.relative('.', outputPath)}/schema';

const client = new ZenStackClient(schema, {
    dialect: { ... }
});
\`\`\`

Check documentation: https://zenstack.dev/docs/`);
        }
    }

    return model;
}

async function runPlugins(schemaFile: string, model: Model, outputPath: string, options: Options) {
    const plugins = model.declarations.filter(isPlugin);
    const processedPlugins: { cliPlugin: CliPlugin; pluginOptions: Record<string, unknown> }[] = [];

    for (const plugin of plugins) {
        const provider = getPluginProvider(plugin);

        let cliPlugin: CliPlugin | undefined;
        if (provider.startsWith('@core/')) {
            cliPlugin = (corePlugins as any)[provider.slice('@core/'.length)];
            if (!cliPlugin) {
                throw new CliError(`Unknown core plugin: ${provider}`);
            }
        } else {
            cliPlugin = await loadPluginModule(provider, path.dirname(schemaFile));
        }

        if (cliPlugin) {
            const pluginOptions = getPluginOptions(plugin);

            // merge CLI options
            if (provider === '@core/typescript') {
                if (options.lite !== undefined) {
                    pluginOptions['lite'] = options.lite;
                }
                if (options.liteOnly !== undefined) {
                    pluginOptions['liteOnly'] = options.liteOnly;
                }
                if (options.generateModels !== undefined) {
                    pluginOptions['generateModels'] = options.generateModels;
                }
                if (options.generateInput !== undefined) {
                    pluginOptions['generateInput'] = options.generateInput;
                }
            }

            processedPlugins.push({ cliPlugin, pluginOptions });
        }
    }

    const defaultPlugins = [
        {
            plugin: corePlugins['typescript'],
            options: {
                lite: options.lite,
                liteOnly: options.liteOnly,
                generateModels: options.generateModels,
                generateInput: options.generateInput,
            },
        },
    ];
    defaultPlugins.forEach(({ plugin, options }) => {
        if (!processedPlugins.some((p) => p.cliPlugin === plugin)) {
            // default plugins are run before user plugins
            processedPlugins.unshift({ cliPlugin: plugin, pluginOptions: options });
        }
    });

    for (const { cliPlugin, pluginOptions } of processedPlugins) {
        invariant(
            typeof cliPlugin.generate === 'function',
            `Plugin ${cliPlugin.name} does not have a generate function`,
        );

        // run plugin generator
        let spinner: Ora | undefined;

        if (!options.silent) {
            spinner = ora(cliPlugin.statusText ?? `Running plugin ${cliPlugin.name}`).start();
        }
        try {
            await cliPlugin.generate({
                schemaFile,
                model,
                defaultOutputPath: outputPath,
                pluginOptions,
            });
            spinner?.succeed();
        } catch (err) {
            spinner?.fail();
            console.error(err);
        }
    }
}

function getPluginProvider(plugin: Plugin) {
    const providerField = plugin.fields.find((f) => f.name === 'provider');
    invariant(providerField, `Plugin ${plugin.name} does not have a provider field`);
    const provider = (providerField.value as LiteralExpr).value as string;
    return provider;
}

function getPluginOptions(plugin: Plugin): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const field of plugin.fields) {
        if (field.name === 'provider') {
            continue; // skip provider
        }
        const value = getLiteral(field.value) ?? getLiteralArray(field.value);
        if (value === undefined) {
            console.warn(`Plugin "${plugin.name}" option "${field.name}" has unsupported value, skipping`);
            continue;
        }
        result[field.name] = value;
    }
    return result;
}

async function loadPluginModule(provider: string, basePath: string) {
    let moduleSpec = provider;
    if (moduleSpec.startsWith('.')) {
        // relative to schema's path
        moduleSpec = path.resolve(basePath, moduleSpec);
    }

    const importAsEsm = async (spec: string) => {
        try {
            const result = (await import(spec)).default as CliPlugin;
            return result;
        } catch (err) {
            throw new CliError(`Failed to load plugin module from ${spec}: ${(err as Error).message}`);
        }
    };

    const jiti = createJiti(pathToFileURL(basePath).toString());
    const importAsTs = async (spec: string) => {
        try {
            const result = (await jiti.import(spec, { default: true })) as CliPlugin;
            return result;
        } catch (err) {
            throw new CliError(`Failed to load plugin module from ${spec}: ${(err as Error).message}`);
        }
    };

    const esmSuffixes = ['.js', '.mjs'];
    const tsSuffixes = ['.ts', '.mts'];

    if (fs.existsSync(moduleSpec) && fs.statSync(moduleSpec).isFile()) {
        // try provider as ESM file
        if (esmSuffixes.some((suffix) => moduleSpec.endsWith(suffix))) {
            return await importAsEsm(pathToFileURL(moduleSpec).toString());
        }

        // try provider as TS file
        if (tsSuffixes.some((suffix) => moduleSpec.endsWith(suffix))) {
            return await importAsTs(moduleSpec);
        }
    }

    // try ESM index files in provider directory
    for (const suffix of esmSuffixes) {
        const indexPath = path.join(moduleSpec, `index${suffix}`);
        if (fs.existsSync(indexPath)) {
            return await importAsEsm(pathToFileURL(indexPath).toString());
        }
    }

    // try TS index files in provider directory
    for (const suffix of tsSuffixes) {
        const indexPath = path.join(moduleSpec, `index${suffix}`);
        if (fs.existsSync(indexPath)) {
            return await importAsTs(indexPath);
        }
    }

    // last resort, try to import as esm directly
    try {
        return (await import(moduleSpec)).default as CliPlugin;
    } catch {
        // plugin may not export a generator so we simply ignore the error here
        return undefined;
    }
}

async function checkForMismatchedPackages(projectPath: string) {
    const packages = await getZenStackPackages(projectPath);
    if (!packages.length) {
        return false;
    }

    const versions = new Set<string>();
    for (const { version } of packages) {
        if (version) {
            versions.add(version);
        }
    }

    if (versions.size > 1) {
        const message =
            'WARNING: Multiple versions of ZenStack packages detected.\n\tThis will probably cause issues and break your types.';
        const slashes = '/'.repeat(73);
        const latestVersion = semver.sort(Array.from(versions)).reverse()[0]!;

        console.warn(colors.yellow(`${slashes}\n\n\t${message}\n`));
        for (const { pkg, version } of packages) {
            if (!version) continue;

            if (version === latestVersion) {
                console.log(`\t${pkg.padEnd(32)}\t${colors.green(version)}`);
            } else {
                console.log(`\t${pkg.padEnd(32)}\t${colors.yellow(version)}`);
            }
        }
        console.warn(`\n${colors.yellow(slashes)}`);

        return true;
    }

    return false;
}
