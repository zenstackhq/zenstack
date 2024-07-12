/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-var-requires */
import { isPlugin, Model, Plugin } from '@zenstackhq/language/ast';
import {
    createProject,
    emitProject,
    getDataModels,
    getLiteral,
    getLiteralArray,
    hasValidationAttributes,
    PluginError,
    resolvePath,
    saveProject,
    type OptionValue,
    type PluginDeclaredOptions,
    type PluginFunction,
    type PluginResult,
} from '@zenstackhq/sdk';
import { type DMMF } from '@zenstackhq/sdk/prisma';
import colors from 'colors';
import ora from 'ora';
import path from 'path';
import type { Project } from 'ts-morph';
import { CorePlugins, ensureDefaultOutputFolder } from '../plugins/plugin-utils';
import telemetry from '../telemetry';
import { getVersion } from '../utils/version-utils';

type PluginInfo = {
    name: string;
    description?: string;
    provider: string;
    options: PluginDeclaredOptions;
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
    async run(runnerOptions: PluginRunnerOptions): Promise<void> {
        const version = getVersion();
        console.log(colors.bold(`⌛️ ZenStack CLI v${version}, running plugins`));

        ensureDefaultOutputFolder(runnerOptions);

        const plugins: PluginInfo[] = [];
        const pluginDecls = runnerOptions.schema.declarations.filter((d): d is Plugin => isPlugin(d));

        for (const pluginDecl of pluginDecls) {
            const pluginProvider = this.getPluginProvider(pluginDecl);
            if (!pluginProvider) {
                console.error(`Plugin ${pluginDecl.name} has invalid provider option`);
                throw new PluginError('', `Plugin ${pluginDecl.name} has invalid provider option`);
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let pluginModule: any;

            try {
                pluginModule = this.loadPluginModule(pluginProvider, runnerOptions.schemaPath);
            } catch (err) {
                console.error(`Unable to load plugin module ${pluginProvider}: ${err}`);
                throw new PluginError('', `Unable to load plugin module ${pluginProvider}`);
            }

            if (!pluginModule.default || typeof pluginModule.default !== 'function') {
                console.error(`Plugin provider ${pluginProvider} is missing a default function export`);
                throw new PluginError('', `Plugin provider ${pluginProvider} is missing a default function export`);
            }

            const dependencies = this.getPluginDependencies(pluginModule);
            const pluginOptions: PluginDeclaredOptions = {
                provider: pluginProvider,
            };

            pluginDecl.fields.forEach((f) => {
                const value = getLiteral(f.value) ?? getLiteralArray(f.value);
                if (value === undefined) {
                    throw new PluginError(pluginDecl.name, `Invalid option value for ${f.name}`);
                }
                pluginOptions[f.name] = value;
            });

            plugins.push({
                name: pluginDecl.name,
                description: this.getPluginDescription(pluginModule),
                provider: pluginProvider,
                dependencies,
                options: pluginOptions,
                run: pluginModule.default as PluginFunction,
                module: pluginModule,
            });
        }

        // calculate all plugins (including core plugins implicitly enabled)
        const { corePlugins, userPlugins } = this.calculateAllPlugins(runnerOptions, plugins);
        const allPlugins = [...corePlugins, ...userPlugins];

        // check dependencies
        for (const plugin of allPlugins) {
            for (const dep of plugin.dependencies) {
                if (!allPlugins.find((p) => p.provider === dep)) {
                    console.error(`Plugin ${plugin.provider} depends on "${dep}" but it's not declared`);
                    throw new PluginError(
                        plugin.name,
                        `Plugin ${plugin.provider} depends on "${dep}" but it's not declared`
                    );
                }
            }
        }

        if (allPlugins.length === 0) {
            console.log(colors.yellow('No plugins configured.'));
            return;
        }

        const warnings: string[] = [];

        // run core plugins first
        let dmmf: DMMF.Document | undefined = undefined;
        let prismaClientPath = '@prisma/client';
        const project = createProject();
        for (const { name, description, run, options: pluginOptions } of corePlugins) {
            const options = { ...pluginOptions, prismaClientPath };
            const r = await this.runPlugin(name, description, run, runnerOptions, options, dmmf, project);
            warnings.push(...(r?.warnings ?? [])); // the null-check is for backward compatibility

            if (r.dmmf) {
                // use the DMMF returned by the plugin
                dmmf = r.dmmf;
            }

            if (r.prismaClientPath) {
                // use the prisma client path returned by the plugin
                prismaClientPath = r.prismaClientPath;
            }
        }

        // compile code generated by core plugins
        await compileProject(project, runnerOptions);

        // run user plugins
        for (const { name, description, run, options: pluginOptions } of userPlugins) {
            const options = { ...pluginOptions, prismaClientPath };
            const r = await this.runPlugin(name, description, run, runnerOptions, options, dmmf, project);
            warnings.push(...(r?.warnings ?? [])); // the null-check is for backward compatibility
        }

        console.log(colors.green(colors.bold('\n👻 All plugins completed successfully!')));
        warnings.forEach((w) => console.warn(colors.yellow(w)));
        console.log(`Don't forget to restart your dev server to let the changes take effect.`);
    }

    private calculateAllPlugins(options: PluginRunnerOptions, plugins: PluginInfo[]) {
        const corePlugins: PluginInfo[] = [];
        let zodImplicitlyAdded = false;

        // 1. @core/prisma
        const existingPrisma = plugins.find((p) => p.provider === CorePlugins.Prisma);
        if (existingPrisma) {
            corePlugins.push(existingPrisma);
            plugins.splice(plugins.indexOf(existingPrisma), 1);
        } else if (options.defaultPlugins || plugins.some((p) => p.provider !== CorePlugins.Prisma)) {
            // "@core/prisma" is enabled as default or if any other plugin is configured
            corePlugins.push(this.makeCorePlugin(CorePlugins.Prisma, options.schemaPath, {}));
        }

        const hasValidation = this.hasValidation(options.schema);

        // 2. @core/enhancer
        const existingEnhancer = plugins.find((p) => p.provider === CorePlugins.Enhancer);
        if (existingEnhancer) {
            corePlugins.push(existingEnhancer);
            plugins.splice(plugins.indexOf(existingEnhancer), 1);
        } else {
            if (options.defaultPlugins) {
                corePlugins.push(
                    this.makeCorePlugin(CorePlugins.Enhancer, options.schemaPath, {
                        withZodSchemas: hasValidation,
                    })
                );
            }
        }

        // 3. @core/zod
        const existingZod = plugins.find((p) => p.provider === CorePlugins.Zod);
        if (existingZod && !existingZod.options.output) {
            // we can reuse the user-provided zod plugin if it didn't specify a custom output path
            plugins.splice(plugins.indexOf(existingZod), 1);
            corePlugins.push(existingZod);
        }

        if (
            !corePlugins.some((p) => p.provider === CorePlugins.Zod) &&
            (options.defaultPlugins || corePlugins.some((p) => p.provider === CorePlugins.Enhancer)) &&
            hasValidation
        ) {
            // ensure "@core/zod" is enabled if "@core/enhancer" is enabled and there're validation rules
            zodImplicitlyAdded = true;
            corePlugins.push(this.makeCorePlugin(CorePlugins.Zod, options.schemaPath, { modelOnly: true }));
        }

        // collect core plugins introduced by dependencies
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
                            if (existing.options.modelOnly) {
                                delete existing.options.modelOnly;
                            }

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
                        const depOptions: Record<string, OptionValue | OptionValue[]> = {};

                        // TODO: generalize this
                        if (dep === '@core/zod' && isTrpcPlugin) {
                            // pass trpc plugin's `generateModels` option down to zod plugin
                            depOptions.generateModels = plugin.options.generateModels;
                        }

                        corePlugins.push(this.makeCorePlugin(dep, options.schemaPath, depOptions));
                    }
                }
            }
        });

        return { corePlugins, userPlugins: plugins };
    }

    private makeCorePlugin(
        provider: string,
        schemaPath: string,
        options: Record<string, OptionValue | OptionValue[]>
    ): PluginInfo {
        const pluginModule = require(this.getPluginModulePath(provider, schemaPath));
        const pluginName = this.getPluginName(pluginModule, provider);
        return {
            name: pluginName,
            description: this.getPluginDescription(pluginModule),
            provider: provider,
            dependencies: [],
            options: { ...options, provider },
            run: pluginModule.default,
            module: pluginModule,
        };
    }

    private hasValidation(schema: Model) {
        return getDataModels(schema).some((model) => hasValidationAttributes(model));
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private getPluginName(pluginModule: any, pluginProvider: string) {
        return typeof pluginModule.name === 'string' ? (pluginModule.name as string) : pluginProvider;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private getPluginDescription(pluginModule: any) {
        return typeof pluginModule.description === 'string' ? (pluginModule.description as string) : undefined;
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
        description: string | undefined,
        run: PluginFunction,
        runnerOptions: PluginRunnerOptions,
        options: PluginDeclaredOptions,
        dmmf: DMMF.Document | undefined,
        project: Project
    ) {
        const title = description ?? `Running plugin ${colors.cyan(name)}`;
        const spinner = ora(title).start();
        try {
            const r = await telemetry.trackSpan<PluginResult | void>(
                'cli:plugin:start',
                'cli:plugin:complete',
                'cli:plugin:error',
                {
                    plugin: name,
                    options,
                },
                async () => {
                    return await run(runnerOptions.schema, { ...options, schemaPath: runnerOptions.schemaPath }, dmmf, {
                        output: runnerOptions.output,
                        compile: runnerOptions.compile,
                        tsProject: project,
                    });
                }
            );
            spinner.succeed();

            if (typeof r === 'object') {
                return r;
            } else {
                return { warnings: [] };
            }
        } catch (err) {
            spinner.fail();
            throw err;
        }
    }

    private getPluginModulePath(provider: string, schemaPath: string) {
        if (process.env.ZENSTACK_TEST === '1' && provider.startsWith('@zenstackhq/')) {
            // test code runs with its own sandbox of node_modules, make sure we don't
            // accidentally resolve to the external ones
            return path.resolve(`node_modules/${provider}`);
        }
        let pluginModulePath = provider;
        if (provider.startsWith('@core/')) {
            pluginModulePath = provider.replace(/^@core/, path.join(__dirname, '../plugins'));
        } else {
            try {
                // direct require
                require.resolve(pluginModulePath);
            } catch {
                // relative
                pluginModulePath = resolvePath(provider, { schemaPath });
            }
        }
        return pluginModulePath;
    }

    private loadPluginModule(provider: string, schemaPath: string) {
        const pluginModulePath = this.getPluginModulePath(provider, schemaPath);
        return require(pluginModulePath);
    }
}

async function compileProject(project: Project, runnerOptions: PluginRunnerOptions) {
    if (runnerOptions.compile !== false) {
        // emit
        await emitProject(project);
    } else {
        // otherwise save ts files
        await saveProject(project);
    }
}
