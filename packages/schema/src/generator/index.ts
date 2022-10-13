import { Context } from './types';
import * as fs from 'fs';
import colors from 'colors';
import PrismaGenerator from './prisma';
import ServiceGenerator from './service';
import ReactHooksGenerator from './react-hooks';
import NextAuthGenerator from './next-auth';
import path from 'path';
import { execSync } from 'child_process';

export class ZenStackGenerator {
    async generate(context: Context) {
        if (fs.existsSync(context.outDir)) {
            fs.rmSync(context.outDir, { force: true, recursive: true });
        }
        fs.mkdirSync(context.outDir);

        const version = require('../../package.json').version;
        console.log(colors.bold(`⌛️ Running ZenStack generator v${version}`));

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
            'package.template.json'
        ));
        fs.writeFileSync(
            path.join(context.outDir, 'package.json'),
            JSON.stringify(packageJson, undefined, 4)
        );

        // compile ts sources
        const tsConfig = require(path.join(
            __dirname,
            'tsconfig.template.json'
        ));
        fs.writeFileSync(
            path.join(context.outDir, 'tsconfig.json'),
            JSON.stringify(tsConfig, undefined, 4)
        );

        try {
            execSync(
                `npx tsc -p "${path.join(context.outDir, 'tsconfig.json')}"`,
                { encoding: 'utf-8', stdio: 'inherit' }
            );
        } catch {
            console.error(
                colors.red(
                    'Something went wrong, generated runtime code failed to compile...'
                )
            );
            return;
        }

        console.log(colors.blue('  ✔️ Typescript source files transpiled'));

        console.log(
            colors.green(
                colors.bold('👻 All generators completed successfully!')
            )
        );
    }
}
