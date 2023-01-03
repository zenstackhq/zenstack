import { DMMF } from '@prisma/generator-helper';
import { Model } from '@zenstackhq/language/ast';

/**
 * Plugin configuration option value type
 */
export type OptionValue = string | number | boolean;

/**
 * Plugin configuration oiptions
 */
export type PluginOptions = { provider?: string } & Record<string, OptionValue | OptionValue[]>;

/**
 * Plugin entry point function definition
 */
export type PluginFunction = (
    model: Model,
    options: PluginOptions,
    dmmf?: DMMF.Document
) => Promise<string[]> | string[] | Promise<void> | void;

/**
 * Plugin error
 */
export class PluginError extends Error {
    constructor(message: string) {
        super(message);
    }
}
