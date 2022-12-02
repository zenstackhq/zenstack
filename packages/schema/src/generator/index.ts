/* eslint-disable @typescript-eslint/no-var-requires */
import { Context } from './types';
import * as fs from 'fs';
import colors from 'colors';
import PrismaGenerator from './prisma';
import ServiceGenerator from './service';
import ReactHooksGenerator from './react-hooks';
import { TypescriptCompilation } from './tsc';
import FieldConstraintGenerator from './field-constraint';
import telemetry from '../telemetry';

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

        const version = require('../../package.json').version;
        console.log(colors.bold(`⌛️ Running ZenStack generator v${version}`));

        // TODO: plugin mechanism
        const generators = [
            new PrismaGenerator(),
            new ServiceGenerator(),
            new ReactHooksGenerator(),
            new FieldConstraintGenerator(),
            new TypescriptCompilation(),
        ];

        for (const generator of generators) {
            if (
                includeGenerators &&
                !includeGenerators.includes(generator.name)
            ) {
                continue;
            }

            await telemetry.trackSpan(
                'cli:generator:start',
                'cli:generator:complete',
                'cli:generator:error',
                {
                    generator: generator.name,
                },
                () => generator.generate(context)
            );
        }

        console.log(
            colors.green(
                colors.bold('👻 All generators completed successfully!')
            )
        );
    }
}
