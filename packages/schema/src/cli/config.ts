import { GUARD_FIELD_NAME, TRANSACTION_FIELD_NAME } from '@zenstackhq/sdk';
import fs from 'fs';
import z from 'zod';
import { fromZodError } from 'zod-validation-error';
import { CliError } from './cli-error';

const schema = z
    .object({
        guardFieldName: z.string().default(GUARD_FIELD_NAME),
        transactionFieldName: z.string().default(TRANSACTION_FIELD_NAME),
    })
    .strict();

export type ConfigType = z.infer<typeof schema>;

export let config: ConfigType = schema.parse({});

/**
 * Loads and validates CLI configuration file.
 * @returns
 */
export function loadConfig(filename: string) {
    if (!fs.existsSync(filename)) {
        return;
    }

    let content: unknown;
    try {
        content = JSON.parse(fs.readFileSync(filename, 'utf-8'));
    } catch {
        throw new CliError(`Config is not a valid JSON file: ${filename}`);
    }

    const parsed = schema.safeParse(content);
    if (!parsed.success) {
        throw new CliError(`Config file ${filename} is not valid: ${fromZodError(parsed.error)}`);
    }

    config = parsed.data;
}
