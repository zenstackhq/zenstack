import type { DMMF } from '@prisma/generator-helper';
import { Model } from '@zenstackhq/language/ast';

/**
 * Plugin configuration option value type
 */
export type OptionValue = string | number | boolean;

/**
 * Plugin configuration oiptions
 */
export type PluginOptions = { provider?: string; schemaPath: string; name: string } & Record<
    string,
    OptionValue | OptionValue[]
>;

/**
 * Plugin entry point function definition
 */
export type PluginFunction = (
    model: Model,
    options: PluginOptions,
    dmmf?: DMMF.Document,
    config?: Record<string, string>
) => Promise<string[]> | string[] | Promise<void> | void;

/**
 * Plugin error
 */
export class PluginError extends Error {
    constructor(public plugin: string, message: string) {
        super(message);
    }
}
