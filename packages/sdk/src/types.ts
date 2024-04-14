import type { DMMF } from '@prisma/generator-helper';
import { Model } from '@zenstackhq/language/ast';
import type { Project } from 'ts-morph';

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
export type PluginOptions = {
    /**
     * ZModel schema absolute path
     */
    schemaPath: string;

    /**
     * PrismaClient import path, either relative to `schemaPath` or absolute
     */
    prismaClientPath?: string;
} & PluginDeclaredOptions;

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

    /**
     * The `ts-morph` project used for code generation.
     * @private
     */
    tsProject: Project;
};

/**
 * Plugin run results.
 */
export type PluginResult = {
    /**
     * Warnings
     */
    warnings: string[];

    /**
     * PrismaClient path, either relative to zmodel path or absolute, if the plugin
     * generated a PrismaClient
     */
    prismaClientPath?: string;

    /**
     * An optional Prisma DMMF document that a plugin can generate
     * @private
     */
    dmmf?: DMMF.Document;
};

/**
 * Plugin entry point function definition
 */
export type PluginFunction = (
    model: Model,
    options: PluginOptions,
    dmmf: DMMF.Document | undefined,
    globalOptions?: PluginGlobalOptions
) => Promise<PluginResult> | PluginResult | Promise<void> | void;

/**
 * Plugin error
 */
export class PluginError extends Error {
    constructor(public plugin: string, message: string) {
        super(message);
    }
}
