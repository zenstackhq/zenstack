import { getVersion } from '@zenstackhq/runtime';
import colors from 'colors';
import fs from 'fs';
import { writeFile } from 'fs/promises';
import ora from 'ora';
import { CliError } from '../cli-error';
import { formatDocument, getDefaultSchemaLocation } from '../cli-util';

type Options = {
    schema: string;
    prismaStyle?: boolean;
};

export async function format(_projectPath: string, options: Options) {
    const version = getVersion();
    console.log(colors.bold(`⌛️ ZenStack CLI v${version}`));

    const schemaFile = options.schema ?? getDefaultSchemaLocation();
    if (!fs.existsSync(schemaFile)) {
        console.error(colors.red(`File ${schemaFile} does not exist.`));
        throw new CliError('schema file does not exist');
    }

    const spinner = ora(`Formatting ${schemaFile}`).start();
    try {
        const formattedDoc = await formatDocument(schemaFile, options.prismaStyle);
        await writeFile(schemaFile, formattedDoc);
        spinner.succeed();
    } catch (e) {
        spinner.fail();
        throw e;
    }
}
