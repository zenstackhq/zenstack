import type { DMMF } from '@prisma/generator-helper';
import { Model } from '@zenstackhq/language/ast';

/**
 * Plugin configuration option value type
 */
export type OptionValue = string | number | boolean;

/**
 * Plugin configuration options
 */
export type PluginDeclaredOptions = {
    /***
     * The provider package
     */
    provider: string;
} & Record<string, OptionValue | OptionValue[]>;

/**
 * Plugin configuration options for execution
 */
export type PluginOptions = { schemaPath: string } & PluginDeclaredOptions;

/**
 * Global options that apply to all plugins
 */
export type PluginGlobalOptions = {
    /**
     * Default output directory
     */
    output?: string;

    /**
     * Whether to compile the generated code
     */
    compile: boolean;
};

/**
 * Plugin entry point function definition
 */
export type PluginFunction = (
    model: Model,
    options: PluginOptions,
    dmmf?: DMMF.Document,
    globalOptions?: PluginGlobalOptions
) => Promise<string[]> | string[] | Promise<void> | void;

/**
 * Plugin error
 */
export class PluginError extends Error {
    constructor(public plugin: string, message: string) {
        super(message);
    }
}
