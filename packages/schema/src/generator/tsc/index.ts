/* eslint-disable @typescript-eslint/no-var-requires */
import colors from 'colors';
import * as fs from 'fs';
import path from 'path';
import { execSync } from '../../utils/exec-utils';
import { Context, Generator, GeneratorError } from '../types';

export class TypescriptCompilation implements Generator {
    get name(): string {
        return 'tsc';
    }

    async generate(context: Context) {
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
    }
}
