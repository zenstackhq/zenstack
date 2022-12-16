/* eslint-disable @typescript-eslint/no-var-requires */
import { Context, Generator } from './types';
import * as fs from 'fs';
import colors from 'colors';
import PrismaGenerator from './prisma';
import ServiceGenerator from './service';
import ReactHooksGenerator from './react-hooks';
import { TypescriptCompilation } from './tsc';
import FieldConstraintGenerator from './field-constraint';
import telemetry from '../telemetry';
import ora from 'ora';

/**
 * ZenStack code generator
 */
export class ZenStackGenerator {
    /**
     * Runs a series of nested generators
     */
    async generate(
        context: Context,
        includeGenerators?: string[],
        clearOutput = true
    ): Promise<void> {
        // ensure folder that stores generated prisma schema and migrations
        if (!fs.existsSync(context.outDir)) {
            fs.mkdirSync(context.outDir);
        }

        if (clearOutput) {
            // recreate folder that stores generated zenstack code
            if (fs.existsSync(context.generatedCodeDir)) {
                fs.rmSync(context.generatedCodeDir, {
                    force: true,
                    recursive: true,
                });
            }
            fs.mkdirSync(context.generatedCodeDir);
        }

        // TODO: plugin mechanism
        const generators: Generator[] = [
            new PrismaGenerator(),
            new ServiceGenerator(),
            new ReactHooksGenerator(),
            new FieldConstraintGenerator(),
            new TypescriptCompilation(),
        ];

        const version = require('../../package.json').version;
        console.log(colors.bold(`⌛️ Running ZenStack generator v${version}`));

        const warnings: string[] = [];
        for (const generator of generators) {
            if (
                includeGenerators &&
                !includeGenerators.includes(generator.name)
            ) {
                continue;
            }

            const spinner = ora(generator.startMessage).start();
            await telemetry.trackSpan(
                'cli:generator:start',
                'cli:generator:complete',
                'cli:generator:error',
                {
                    generator: generator.name,
                },
                async () => {
                    const genWarnings = await generator.generate(context);
                    warnings.push(...genWarnings);
                }
            );
            spinner.succeed(`${colors.cyan(generator.successMessage)}`);
        }

        console.log(
            colors.green(
                colors.bold('👻 All generators completed successfully!')
            )
        );

        warnings.forEach((w) => console.warn(colors.yellow(w)));
    }
}
