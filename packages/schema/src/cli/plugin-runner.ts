/* eslint-disable @typescript-eslint/no-var-requires */
import { DMMF } from '@prisma/generator-helper';
import { getDMMF } from '@prisma/internals';
import { Plugin, isPlugin } from '@zenstackhq/language/ast';
import { PluginFunction, PluginOptions, getLiteral, getLiteralArray } from '@zenstackhq/sdk';
import colors from 'colors';
import fs from 'fs';
import ora from 'ora';
import path from 'path';
import telemetry from '../telemetry';
import { Context } from '../types';
import { CliError } from './cli-error';

/**
 * ZenStack code generator
 */
export class PluginRunner {
    /**
     * Runs a series of nested generators
     */
    async run(context: Context): Promise<void> {
        const version = require('../package.json').version;
        console.log(colors.bold(`⌛️ ZenStack CLI v${version}, running plugins`));

        const plugins: Array<{
            provider: string;
            name: string;
            run: PluginFunction;
            options: PluginOptions;
        }> = [];

        const pluginDecls = context.schema.declarations.filter((d): d is Plugin => isPlugin(d));
        const prereqPlugins = ['@zenstack/prisma', '@zenstack/model-meta', '@zenstack/access-policy'];
        const allPluginProviders = prereqPlugins.concat(
            pluginDecls
                .map((p) => this.getPluginProvider(p))
                .filter((p): p is string => !!p && !prereqPlugins.includes(p))
        );
        let prismaOutput = './prisma/schema.prisma';

        for (const pluginProvider of allPluginProviders) {
            const plugin = pluginDecls.find((p) => this.getPluginProvider(p) === pluginProvider);
            if (plugin) {
                const options: PluginOptions = {};

                plugin.fields.forEach((f) => {
                    const value = getLiteral(f.value) || getLiteralArray(f.value);
                    if (!value) {
                        throw new CliError(`Invalid plugin value for ${f.name}`);
                    }
                    options[f.name] = value;
                });

                const pluginModulePath = this.getPluginModulePath(pluginProvider);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                let pluginModule: any;
                try {
                    pluginModule = require(pluginModulePath);
                } catch (err) {
                    console.error(`Unable to load plugin module ${pluginProvider}: ${pluginModulePath}, ${err}`);
                    throw new CliError(`Unable to load plugin module ${pluginProvider}`);
                }

                if (!pluginModule.default || typeof pluginModule.default !== 'function') {
                    console.error(`Plugin provider ${pluginProvider} is missing a default function export`);
                    throw new CliError(`Plugin provider ${pluginProvider} is missing a default function export`);
                }
                plugins.push({
                    name: this.getPluginName(pluginModule, pluginProvider),
                    provider: pluginProvider,
                    run: pluginModule.default as PluginFunction,
                    options,
                });

                if (pluginProvider === '@zenstack/prisma' && options.output) {
                    // record custom prisma output path
                    prismaOutput = options.output as string;
                }
            } else {
                // synthesize a plugin
                const pluginModule = require(this.getPluginModulePath(pluginProvider));
                plugins.push({
                    name: this.getPluginName(pluginModule, pluginProvider),
                    provider: pluginProvider,
                    run: pluginModule.default,
                    options: {},
                });
            }
        }

        const warnings: string[] = [];

        let dmmf: DMMF.Document | undefined = undefined;
        for (const { name, provider, run, options } of plugins) {
            await this.runPlugin(name, run, context, options, dmmf, warnings);
            if (provider === '@zenstack/prisma') {
                // load prisma DMMF
                dmmf = await getDMMF({
                    datamodel: fs.readFileSync(prismaOutput, { encoding: 'utf-8' }),
                });
            }
        }

        console.log(colors.green(colors.bold('\n👻 All plugins completed successfully!')));

        warnings.forEach((w) => console.warn(colors.yellow(w)));
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private getPluginName(pluginModule: any, pluginProvider: string): string {
        return typeof pluginModule.name === 'string' ? (pluginModule.name as string) : pluginProvider;
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
                },
                async () => {
                    let result = run(context.schema, options, dmmf);
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
        if (pluginModulePath.startsWith('@zenstack/')) {
            pluginModulePath = pluginModulePath.replace(/^@zenstack/, path.join(__dirname, '../plugins'));
        }
        return pluginModulePath;
    }
}
