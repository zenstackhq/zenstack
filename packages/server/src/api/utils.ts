import { DbOperations } from '@zenstackhq/runtime';
import type { ModelZodSchema } from '@zenstackhq/runtime/zod';
import { pascalCase } from 'change-case';
import { fromZodError } from 'zod-validation-error';
import { AUXILIARY_FIELDS } from '@zenstackhq/sdk';
import { LoggerConfig } from './types';

export function getZodSchema(zodSchemas: ModelZodSchema, model: string, operation: keyof DbOperations) {
    if (zodSchemas[model]) {
        return zodSchemas[model][operation];
    } else if (zodSchemas[pascalCase(model)]) {
        return zodSchemas[pascalCase(model)][operation];
    } else {
        return undefined;
    }
}

export function zodValidate(
    zodSchemas: ModelZodSchema | undefined,
    model: string,
    operation: keyof DbOperations,
    args: unknown
) {
    const zodSchema = zodSchemas && getZodSchema(zodSchemas, model, operation);
    if (zodSchema) {
        const parseResult = zodSchema.safeParse(args);
        if (parseResult.success) {
            return { data: parseResult.data, error: undefined };
        } else {
            return { data: undefined, error: fromZodError(parseResult.error).message };
        }
    } else {
        return { data: args, error: undefined };
    }
}

export function logError(logger: LoggerConfig | undefined | null, message: string, code?: string) {
    if (logger === undefined) {
        console.error(`@zenstackhq/server: error ${code ? '[' + code + ']' : ''}, ${message}`);
    } else if (logger?.error) {
        logger.error(message, code);
    }
}

/**
 * Recursively strip auxiliary fields from the given data.
 */
export function stripAuxFields(data: unknown) {
    if (Array.isArray(data)) {
        return data.forEach(stripAuxFields);
    } else if (data && typeof data === 'object') {
        for (const [key, value] of Object.entries(data)) {
            if (AUXILIARY_FIELDS.includes(key)) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                delete (data as any)[key];
            } else {
                stripAuxFields(value);
            }
        }
    }
}