import fs from 'fs';
import z, { ZodError } from 'zod';
import { CliError } from './cli-error';

// TODO: future use
const schema = z.object({});

export type ConfigType = z.infer<typeof schema>;

export let config: ConfigType = schema.parse({});

/**
 * Loads and validates CLI configuration file.
 * @returns
 */
export function loadConfig(filename: string) {
    try {
        const fileData = fs.readFileSync(filename, `utf-8`);
        const content = JSON.parse(fileData);
        config = schema.parse(content);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
        if (err?.code === `ENOENT`) {
            throw new CliError(`Config file could not be found: ${filename}`);
        }
        if (err instanceof SyntaxError) {
            throw new CliError(`Config is not a valid JSON file: ${filename}`);
        }
        if (err instanceof ZodError) {
            throw new CliError(`Config file ${filename} is not valid: ${err}`);
        }
        throw new CliError(`Error loading config: ${filename}`);
    }
}
