/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-var-requires */
import type { DMMF } from '@prisma/generator-helper';
import { isPlugin, Plugin } from '@zenstackhq/language/ast';
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
import telemetry from '../telemetry';
import type { Context } from '../types';
import { getVersion } from '../utils/version-utils';
import { config } from './config';

type PluginInfo = {
    name: string;
    provider: string;
    options: PluginOptions;
    run: PluginFunction;
    dependencies: string[];
    module: any;
};

/**
 * ZenStack plugin runner
 */
export class PluginRunner {
    /**
     * Runs a series of nested generators
     */
    async run(context: Context): Promise<void> {
        const version = getVersion();
        console.log(colors.bold(`⌛️ ZenStack CLI v${version}, running plugins`));

        ensureDefaultOutputFolder();

        const plugins: PluginInfo[] = [];
        const pluginDecls = context.schema.declarations.filter((d): d is Plugin => isPlugin(d));

        let prismaOutput = resolvePath('./prisma/schema.prisma', { schemaPath: context.schemaPath, name: '' });

        for (const pluginDecl of pluginDecls) {
            const pluginProvider = this.getPluginProvider(pluginDecl);
            if (!pluginProvider) {
                console.error(`Plugin ${pluginDecl.name} has invalid provider option`);
                throw new PluginError('', `Plugin ${pluginDecl.name} has invalid provider option`);
            }
            const pluginModulePath = this.getPluginModulePath(pluginProvider);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let pluginModule: any;
            try {
                pluginModule = require(pluginModulePath);
            } catch (err) {
                console.error(`Unable to load plugin module ${pluginProvider}: ${pluginModulePath}, ${err}`);
                throw new PluginError('', `Unable to load plugin module ${pluginProvider}`);
            }

            if (!pluginModule.default || typeof pluginModule.default !== 'function') {
                console.error(`Plugin provider ${pluginProvider} is missing a default function export`);
                throw new PluginError('', `Plugin provider ${pluginProvider} is missing a default function export`);
            }

            const dependencies = this.getPluginDependencies(pluginModule);
            const pluginName = this.getPluginName(pluginModule, pluginProvider);
            const options: PluginOptions = { schemaPath: context.schemaPath, name: pluginName };

            pluginDecl.fields.forEach((f) => {
                const value = getLiteral(f.value) ?? getLiteralArray(f.value);
                if (value === undefined) {
                    throw new PluginError(pluginName, `Invalid option value for ${f.name}`);
                }
                options[f.name] = value;
            });

            plugins.push({
                name: pluginName,
                provider: pluginProvider,
                dependencies,
                options,
                run: pluginModule.default as PluginFunction,
                module: pluginModule,
            });

            if (pluginProvider === '@core/prisma' && typeof options.output === 'string') {
                // record custom prisma output path
                prismaOutput = resolvePath(options.output, options);
            }
        }

        // make sure prerequisites are included
        const corePlugins = ['@core/prisma', '@core/model-meta', '@core/access-policy'];

        if (getDataModels(context.schema).some((model) => hasValidationAttributes(model))) {
            // '@core/zod' plugin is auto-enabled if there're validation rules
            corePlugins.push('@core/zod');
        }

        // core dependencies introduced by dependencies
        plugins
            .flatMap((p) => p.dependencies)
            .forEach((dep) => {
                if (dep.startsWith('@core/') && !corePlugins.includes(dep)) {
                    corePlugins.push(dep);
                }
            });

        for (const corePlugin of corePlugins.reverse()) {
            const existingIdx = plugins.findIndex((p) => p.provider === corePlugin);
            if (existingIdx >= 0) {
                // shift the plugin to the front
                const existing = plugins[existingIdx];
                plugins.splice(existingIdx, 1);
                plugins.unshift(existing);
            } else {
                // synthesize a plugin and insert front
                const pluginModule = require(this.getPluginModulePath(corePlugin));
                const pluginName = this.getPluginName(pluginModule, corePlugin);
                plugins.unshift({
                    name: pluginName,
                    provider: corePlugin,
                    dependencies: [],
                    options: { schemaPath: context.schemaPath, name: pluginName },
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

        const warnings: string[] = [];

        let dmmf: DMMF.Document | undefined = undefined;
        for (const { name, provider, run, options } of plugins) {
            await this.runPlugin(name, run, context, options, dmmf, warnings);
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
        context: Context,
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
                    let result = run(context.schema, options, dmmf, config);
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

    private getPluginModulePath(provider: string) {
        let pluginModulePath = provider;
        if (pluginModulePath.startsWith('@core/')) {
            pluginModulePath = pluginModulePath.replace(/^@core/, path.join(__dirname, '../plugins'));
        }
        return pluginModulePath;
    }
}
