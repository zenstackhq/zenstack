/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-var-requires */
import type { DMMF } from '@prisma/generator-helper';
import { isPlugin, Model, Plugin } from '@zenstackhq/language/ast';
import {
    getDataModels,
    getDMMF,
    getLiteral,
    getLiteralArray,
    hasValidationAttributes,
    PluginError,
    PluginFunction,
    PluginOptions,
    resolvePath,
} from '@zenstackhq/sdk';
import colors from 'colors';
import fs from 'fs';
import ora from 'ora';
import path from 'path';
import { ensureDefaultOutputFolder } from '../plugins/plugin-utils';
import { getDefaultPrismaOutputFile } from '../plugins/prisma/schema-generator';
import telemetry from '../telemetry';
import { getVersion } from '../utils/version-utils';

type PluginInfo = {
    name: string;
    provider: string;
    options: PluginOptions;
    run: PluginFunction;
    dependencies: string[];
    module: any;
};

export type PluginRunnerOptions = {
    schema: Model;
    schemaPath: string;
    output?: string;
    defaultPlugins: boolean;
    compile: boolean;
};

/**
 * ZenStack plugin runner
 */
export class PluginRunner {
    /**
     * Runs a series of nested generators
     */
    async run(options: PluginRunnerOptions): Promise<void> {
        const version = getVersion();
        console.log(colors.bold(`⌛️ ZenStack CLI v${version}, running plugins`));

        ensureDefaultOutputFolder(options);

        const plugins: PluginInfo[] = [];
        const pluginDecls = options.schema.declarations.filter((d): d is Plugin => isPlugin(d));

        let prismaOutput = getDefaultPrismaOutputFile(options.schemaPath);

        for (const pluginDecl of pluginDecls) {
            const pluginProvider = this.getPluginProvider(pluginDecl);
            if (!pluginProvider) {
                console.error(`Plugin ${pluginDecl.name} has invalid provider option`);
                throw new PluginError('', `Plugin ${pluginDecl.name} has invalid provider option`);
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let pluginModule: any;

            try {
                pluginModule = this.loadPluginModule(pluginProvider, options);
            } catch (err) {
                console.error(`Unable to load plugin module ${pluginProvider}: ${err}`);
                throw new PluginError('', `Unable to load plugin module ${pluginProvider}`);
            }

            if (!pluginModule.default || typeof pluginModule.default !== 'function') {
                console.error(`Plugin provider ${pluginProvider} is missing a default function export`);
                throw new PluginError('', `Plugin provider ${pluginProvider} is missing a default function export`);
            }

            const dependencies = this.getPluginDependencies(pluginModule);
            const pluginName = this.getPluginName(pluginModule, pluginProvider);
            const pluginOptions: PluginOptions = { schemaPath: options.schemaPath, name: pluginName };

            pluginDecl.fields.forEach((f) => {
                const value = getLiteral(f.value) ?? getLiteralArray(f.value);
                if (value === undefined) {
                    throw new PluginError(pluginName, `Invalid option value for ${f.name}`);
                }
                pluginOptions[f.name] = value;
            });

            plugins.push({
                name: pluginName,
                provider: pluginProvider,
                dependencies,
                options: pluginOptions,
                run: pluginModule.default as PluginFunction,
                module: pluginModule,
            });

            if (pluginProvider === '@core/prisma' && typeof pluginOptions.output === 'string') {
                // record custom prisma output path
                prismaOutput = resolvePath(pluginOptions.output, pluginOptions);
            }
        }

        // get core plugins that need to be enabled
        const corePlugins = this.calculateCorePlugins(options, plugins);

        // shift/insert core plugins to the front
        for (const corePlugin of corePlugins.reverse()) {
            const existingIdx = plugins.findIndex((p) => p.provider === corePlugin.provider);
            if (existingIdx >= 0) {
                // shift the plugin to the front
                const existing = plugins[existingIdx];
                plugins.splice(existingIdx, 1);
                plugins.unshift(existing);
            } else {
                // synthesize a plugin and insert front
                const pluginModule = require(this.getPluginModulePath(corePlugin.provider, options));
                const pluginName = this.getPluginName(pluginModule, corePlugin.provider);
                plugins.unshift({
                    name: pluginName,
                    provider: corePlugin.provider,
                    dependencies: [],
                    options: { schemaPath: options.schemaPath, name: pluginName, ...corePlugin.options },
                    run: pluginModule.default,
                    module: pluginModule,
                });
            }
        }

        // check dependencies
        for (const plugin of plugins) {
            for (const dep of plugin.dependencies) {
                if (!plugins.find((p) => p.provider === dep)) {
                    console.error(`Plugin ${plugin.provider} depends on "${dep}" but it's not declared`);
                    throw new PluginError(
                        plugin.name,
                        `Plugin ${plugin.provider} depends on "${dep}" but it's not declared`
                    );
                }
            }
        }

        if (plugins.length === 0) {
            console.log(colors.yellow('No plugins configured.'));
            return;
        }

        const warnings: string[] = [];

        let dmmf: DMMF.Document | undefined = undefined;
        for (const { name, provider, run, options: pluginOptions } of plugins) {
            // const start = Date.now();
            await this.runPlugin(name, run, options, pluginOptions, dmmf, warnings);
            // console.log(`✅ Plugin ${colors.bold(name)} (${provider}) completed in ${Date.now() - start}ms`);
            if (provider === '@core/prisma') {
                // load prisma DMMF
                dmmf = await getDMMF({
                    datamodel: fs.readFileSync(prismaOutput, { encoding: 'utf-8' }),
                });
            }
        }
        console.log(colors.green(colors.bold('\n👻 All plugins completed successfully!')));

        warnings.forEach((w) => console.warn(colors.yellow(w)));

        console.log(`Don't forget to restart your dev server to let the changes take effect.`);
    }

    private calculateCorePlugins(options: PluginRunnerOptions, plugins: PluginInfo[]) {
        const corePlugins: Array<{ provider: string; options?: Record<string, unknown> }> = [];

        if (options.defaultPlugins) {
            corePlugins.push(
                { provider: '@core/prisma' },
                { provider: '@core/model-meta' },
                { provider: '@core/access-policy' }
            );
        } else if (plugins.length > 0) {
            // "@core/prisma" plugin is always enabled if any plugin is configured
            corePlugins.push({ provider: '@core/prisma' });
        }

        // "@core/access-policy" has implicit requirements
        let zodImplicitlyAdded = false;
        if ([...plugins, ...corePlugins].find((p) => p.provider === '@core/access-policy')) {
            // make sure "@core/model-meta" is enabled
            if (!corePlugins.find((p) => p.provider === '@core/model-meta')) {
                corePlugins.push({ provider: '@core/model-meta' });
            }

            // '@core/zod' plugin is auto-enabled by "@core/access-policy"
            // if there're validation rules
            if (!corePlugins.find((p) => p.provider === '@core/zod') && this.hasValidation(options.schema)) {
                zodImplicitlyAdded = true;
                corePlugins.push({ provider: '@core/zod', options: { modelOnly: true } });
            }
        }

        // core plugins introduced by dependencies
        plugins.forEach((plugin) => {
            // TODO: generalize this
            const isTrpcPlugin =
                plugin.provider === '@zenstackhq/trpc' ||
                // for testing
                (process.env.ZENSTACK_TEST && plugin.provider.includes('trpc'));

            for (const dep of plugin.dependencies) {
                if (dep.startsWith('@core/')) {
                    const existing = corePlugins.find((p) => p.provider === dep);
                    if (existing) {
                        // TODO: generalize this
                        if (existing.provider === '@core/zod') {
                            // Zod plugin can be automatically enabled in `modelOnly` mode, however
                            // other plugin (tRPC) for now requires it to run in full mode
                            existing.options = {};

                            if (
                                isTrpcPlugin &&
                                zodImplicitlyAdded // don't do it for user defined zod plugin
                            ) {
                                // pass trpc plugin's `generateModels` option down to zod plugin
                                existing.options.generateModels = plugin.options.generateModels;
                            }
                        }
                    } else {
                        // add core dependency
                        const toAdd = { provider: dep, options: {} as Record<string, unknown> };

                        // TODO: generalize this
                        if (dep === '@core/zod' && isTrpcPlugin) {
                            // pass trpc plugin's `generateModels` option down to zod plugin
                            toAdd.options.generateModels = plugin.options.generateModels;
                        }

                        corePlugins.push(toAdd);
                    }
                }
            }
        });

        return corePlugins;
    }

    private hasValidation(schema: Model) {
        return getDataModels(schema).some((model) => hasValidationAttributes(model));
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private getPluginName(pluginModule: any, pluginProvider: string): string {
        return typeof pluginModule.name === 'string' ? (pluginModule.name as string) : pluginProvider;
    }

    private getPluginDependencies(pluginModule: any) {
        return Array.isArray(pluginModule.dependencies) ? (pluginModule.dependencies as string[]) : [];
    }

    private getPluginProvider(plugin: Plugin) {
        const providerField = plugin.fields.find((f) => f.name === 'provider');
        return getLiteral<string>(providerField?.value);
    }

    private async runPlugin(
        name: string,
        run: PluginFunction,
        runnerOptions: PluginRunnerOptions,
        options: PluginOptions,
        dmmf: DMMF.Document | undefined,
        warnings: string[]
    ) {
        const spinner = ora(`Running plugin ${colors.cyan(name)}`).start();
        try {
            await telemetry.trackSpan(
                'cli:plugin:start',
                'cli:plugin:complete',
                'cli:plugin:error',
                {
                    plugin: name,
                    options,
                },
                async () => {
                    let result = run(runnerOptions.schema, options, dmmf, {
                        output: runnerOptions.output,
                        compile: runnerOptions.compile,
                    });
                    if (result instanceof Promise) {
                        result = await result;
                    }
                    if (Array.isArray(result)) {
                        warnings.push(...result);
                    }
                }
            );
            spinner.succeed();
        } catch (err) {
            spinner.fail();
            throw err;
        }
    }

    private getPluginModulePath(provider: string, options: Pick<PluginOptions, 'schemaPath'>) {
        let pluginModulePath = provider;
        if (provider.startsWith('@core/')) {
            pluginModulePath = provider.replace(/^@core/, path.join(__dirname, '../plugins'));
        } else {
            try {
                // direct require
                require.resolve(pluginModulePath);
            } catch {
                // relative
                pluginModulePath = resolvePath(provider, options);
            }
        }
        return pluginModulePath;
    }

    private loadPluginModule(provider: string, options: Pick<PluginOptions, 'schemaPath'>) {
        const pluginModulePath = this.getPluginModulePath(provider, options);
        return require(pluginModulePath);
    }
}
