import { DMMF } from '@prisma/generator-helper';
import { Model } from '@zenstackhq/language/ast';

export type OptionValue = string | number | boolean;

export type PluginOptions = { provider?: string } & Record<
    string,
    OptionValue | OptionValue[]
>;

export type PluginFunction = (
    model: Model,
    options: PluginOptions,
    dmmf?: DMMF.Document
) => Promise<string[]> | string[] | Promise<void> | void;

export class PluginError extends Error {
    constructor(message: string) {
        super(message);
    }
}

export const GUARD_FIELD_NAME = 'zenstack_guard';
export const TRANSACTION_FIELD_NAME = 'zenstack_transaction';
