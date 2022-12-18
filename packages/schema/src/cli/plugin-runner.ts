/* eslint-disable @typescript-eslint/no-var-requires */
import { getDMMF } from '@prisma/internals';
import { isPlugin, Plugin } from '@zenstackhq/language/ast';
import { PluginFunction, PluginOptions } from '@zenstackhq/sdk';
import { getLiteral, getLiteralArray } from '@zenstackhq/sdk/utils';
import colors from 'colors';
import fs from 'fs';
import ora from 'ora';
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
        const version = require('../../package.json').version;
        console.log(
            colors.bold(`⌛️ ZenStack CLI v${version}, running plugins`)
        );

        const plugins: Array<{
            provider: string;
            name: string;
            run: PluginFunction;
            options: PluginOptions;
        }> = [];

        const pluginDecls = context.schema.declarations.filter(
            (d): d is Plugin => isPlugin(d)
        );

        for (const plugin of pluginDecls) {
            const options: PluginOptions = {};

            plugin.fields.forEach((f) => {
                const value = getLiteral(f.value) || getLiteralArray(f.value);
                if (!value) {
                    throw new CliError(`Invalid plugin value for ${f.name}`);
                }
                options[f.name] = value;
            });

            if (!options.provider) {
                throw new CliError(
                    `Plugin ${plugin.name} doesn't have a provider specified`
                );
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let pluginModule: any;
            try {
                pluginModule = require(options.provider);
            } catch {
                console.error(
                    `Unable to load plugin module ${options.provider}`
                );
                throw new CliError(
                    `Unable to load plugin module ${options.provider}`
                );
            }

            if (
                !pluginModule.default ||
                typeof pluginModule.default !== 'function'
            ) {
                console.error(
                    `Plugin provider ${options.provider} is missing a default function export`
                );
                throw new CliError(
                    `Plugin provider ${options.provider} is missing a default function export`
                );
            }
            const name =
                typeof pluginModule.name === 'string'
                    ? (pluginModule.name as string)
                    : options.provider;
            plugins.push({
                name,
                provider: options.provider,
                run: pluginModule.default as PluginFunction,
                options,
            });
        }

        const prismaPluginProvider = 'zenstack/plugins/prisma';
        let prismaPlugin = plugins.find(
            (p) => p.provider === prismaPluginProvider
        );
        if (!prismaPlugin) {
            prismaPlugin = {
                name: 'prisma',
                provider: prismaPluginProvider,
                run: require(prismaPluginProvider).default,
                options: {},
            };
        }

        const warnings: string[] = [];

        const r = await prismaPlugin.run(context.schema, prismaPlugin.options);
        if (Array.isArray(r)) {
            warnings.push(...r);
        }

        const prismaOutput =
            (prismaPlugin.options.output as string) ?? 'prisma/schema.prisma';

        const dmmf = await getDMMF({
            datamodel: fs.readFileSync(prismaOutput, { encoding: 'utf-8' }),
        });

        for (const { name, run, options } of plugins.filter(
            (p) => p !== prismaPlugin
        )) {
            const spinner = ora(`Running plugin ${colors.cyan(name)}`).start();
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
        }

        console.log(
            colors.green(
                colors.bold('\n👻 All plugins completed successfully!')
            )
        );

        warnings.forEach((w) => console.warn(colors.yellow(w)));
    }
}
