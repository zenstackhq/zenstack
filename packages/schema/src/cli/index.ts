import { Command } from 'commander';
import { Model } from '../language-server/generated/ast';
import { ZModelLanguageMetaData } from '../language-server/generated/module';
import { createZModelServices } from '../language-server/zmodel-module';
import { extractAstNode } from './cli-util';
import { Context } from '../generator/types';
import * as path from 'path';
import * as fs from 'fs';
import colors from 'colors';
import PrismaGenerator from '../generator/prisma';
import ServiceGenerator from '../generator/service';
import ReactHooksGenerator from '../generator/react-hooks';
import NextAuthGenerator from '../generator/next-auth';
import ServerGenerator from '../generator/server';

export const generateAction = async (
    fileName: string,
    opts: GenerateOptions
): Promise<void> => {
    const services = createZModelServices().ZModel;
    const model = await extractAstNode<Model>(fileName, services);

    const context: Context = {
        schema: model,
        outDir: path.resolve(opts.destination),
    };

    if (!fs.existsSync(context.outDir)) {
        fs.mkdirSync(context.outDir);
    }

    console.log(colors.bold('⌛️ Running ZenStack generators'));

    const generators = [
        new PrismaGenerator(),
        new ServiceGenerator(),
        new ReactHooksGenerator(),
        new ServerGenerator(),
        new NextAuthGenerator(),
    ];

    for (const generator of generators) {
        await generator.generate(context);
    }

    console.log(
        colors.green(colors.bold('👻 All generators completed successfully!'))
    );
};

export type GenerateOptions = {
    destination: string;
};

export default function (): void {
    const program = new Command();

    program
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        .version(require('../../package.json').version);

    const fileExtensions = ZModelLanguageMetaData.fileExtensions.join(', ');
    program
        .command('generate')
        .argument(
            '<file>',
            `source file (possible file extensions: ${fileExtensions})`
        )
        .option(
            '-d, --destination <dir>',
            'destination directory of generating',
            '.zenstack'
        )
        .description(
            'generates JavaScript code that prints "Hello, {name}!" for each greeting in a source file'
        )
        .action(generateAction);

    program.parse(process.argv);
}
