import { Command } from 'commander';
import { Model } from '../language-server/generated/ast';
import { ZModelLanguageMetaData } from '../language-server/generated/module';
import { createZModelServices } from '../language-server/zmodel-module';
import { extractAstNode } from './cli-util';
import PrismaGenerator from '../generator/prisma';
import { Context } from '../generator/types';

export const generateAction = async (
    fileName: string,
    opts: GenerateOptions
): Promise<void> => {
    const services = createZModelServices().ZModel;
    const model = await extractAstNode<Model>(fileName, services);

    const generators = [new PrismaGenerator()];
    const context: Context = {
        schema: model,
        outDir: opts.destination,
    };

    for (const generator of generators) {
        await generator.generate(context);
    }
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
