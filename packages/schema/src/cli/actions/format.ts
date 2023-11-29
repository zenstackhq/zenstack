import { getVersion } from '@zenstackhq/runtime';
import { formatDocument } from '../cli-util';
import colors from 'colors';
import ora from 'ora';
import { writeFile } from 'fs/promises';

export async function format(projectPath: string, options: { schema: string }) {
    const version = getVersion();
    console.log(colors.bold(`⌛️ ZenStack CLI v${version}`));

    const schemaFile = options.schema;
    const spinner = ora(`Formatting ${schemaFile}`).start();
    try {
        const formattedDoc = await formatDocument(schemaFile);
        await writeFile(schemaFile, formattedDoc);
        spinner.succeed();
    } catch (e) {
        spinner.fail();
        throw e;
    }
}
