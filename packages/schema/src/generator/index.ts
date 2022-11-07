/* eslint-disable @typescript-eslint/no-var-requires */
import { Context } from './types';
import * as fs from 'fs';
import colors from 'colors';
import PrismaGenerator from './prisma';
import ServiceGenerator from './service';
import ReactHooksGenerator from './react-hooks';
import NextAuthGenerator from './next-auth';
import { TypescriptCompilation } from './tsc';

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
            new NextAuthGenerator(),
            new TypescriptCompilation(),
        ];

        for (const generator of generators) {
            if (
                includeGenerators &&
                !includeGenerators.includes(generator.name)
            ) {
                continue;
            }
            await generator.generate(context);
        }

        console.log(
            colors.green(
                colors.bold('👻 All generators completed successfully!')
            )
        );
    }
}
