/* eslint-disable @typescript-eslint/no-var-requires */
import { Context, GeneratorError } from './types';
import * as fs from 'fs';
import colors from 'colors';
import PrismaGenerator from './prisma';
import ServiceGenerator from './service';
import ReactHooksGenerator from './react-hooks';
import NextAuthGenerator from './next-auth';
import path from 'path';
import { execSync } from '../utils/exec-utils';

/**
 * ZenStack code generator
 */
export class ZenStackGenerator {
    /**
     * Runs a series of nested generators
     */
    async generate(context: Context): Promise<void> {
        // folder that stores generated prisma schema and migrations
        if (!fs.existsSync(context.outDir)) {
            fs.mkdirSync(context.outDir);
        }

        // folder that stores generated zenstack code
        if (fs.existsSync(context.generatedCodeDir)) {
            fs.rmSync(context.generatedCodeDir, {
                force: true,
                recursive: true,
            });
        }
        fs.mkdirSync(context.generatedCodeDir);

        const version = require('../../package.json').version;
        console.log(colors.bold(`⌛️ Running ZenStack generator v${version}`));

        // TODO: plugin mechanism
        const generators = [
            new PrismaGenerator(),
            new ServiceGenerator(),
            new ReactHooksGenerator(),
            new NextAuthGenerator(),
        ];

        for (const generator of generators) {
            await generator.generate(context);
        }

        // generate package.json
        const packageJson = require(path.join(
            __dirname,
            '../res',
            'package.template.json'
        ));
        fs.writeFileSync(
            path.join(context.generatedCodeDir, 'package.json'),
            JSON.stringify(packageJson, undefined, 4)
        );

        // compile ts sources
        const tsConfig = require(path.join(
            __dirname,
            '../res',
            'tsconfig.template.json'
        ));
        fs.writeFileSync(
            path.join(context.generatedCodeDir, 'tsconfig.json'),
            JSON.stringify(tsConfig, undefined, 4)
        );

        try {
            execSync(
                `npx tsc -p "${path.join(
                    context.generatedCodeDir,
                    'tsconfig.json'
                )}"`
            );
        } catch {
            throw new GeneratorError(
                'Something went wrong, generated runtime code failed to compile...\nPlease check errors above.'
            );
        }

        console.log(colors.blue('  ✔️ Typescript source files transpiled'));

        console.log(
            colors.green(
                colors.bold('👻 All generators completed successfully!')
            )
        );
    }
}
