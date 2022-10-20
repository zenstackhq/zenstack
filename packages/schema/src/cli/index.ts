import { Command } from 'commander';
import { Model } from '../language-server/generated/ast';
import { ZModelLanguageMetaData } from '../language-server/generated/module';
import { createZModelServices } from '../language-server/zmodel-module';
import { extractAstNode } from './cli-util';
import { Context, GeneratorError } from '../generator/types';
import { ZenStackGenerator } from '../generator';
import { GENERATED_CODE_PATH } from '../generator/constants';
import colors from 'colors';

export const generateAction = async (
    fileName: string,
    opts: GenerateOptions
): Promise<void> => {
    const services = createZModelServices().ZModel;
    const model = await extractAstNode<Model>(fileName, services);

    const context: Context = {
        schema: model,
        outDir: opts.destination || './zenstack',
        // TODO: make this configurable
        generatedCodeDir: GENERATED_CODE_PATH,
    };

    try {
        await new ZenStackGenerator().generate(context);
    } catch (err) {
        if (err instanceof GeneratorError) {
            console.error(colors.red(err.message));
            process.exit(-1);
        }
    }
};

export type GenerateOptions = {
    destination?: string;
};

export default function (): void {
    const program = new Command('zenstack');

    program.version(
        require('../../package.json').version,
        '-v --version',
        'display CLI version'
    );

    program.description(
        `${colors.bold.blue(
            'ζ'
        )} ZenStack simplifies fullstack development by generating backend services and Typescript clients from a data model.\n\nDocumentation: https://zenstack.dev/doc.`
    );

    const fileExtensions = ZModelLanguageMetaData.fileExtensions.join(', ');
    program
        .command('generate')
        .argument('<file>', `source file (with extension ${fileExtensions})`)
        .description(
            'generates RESTful API and Typescript client for your data model'
        )
        .action(generateAction);

    program.parse(process.argv);
}
