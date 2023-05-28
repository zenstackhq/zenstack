import { DbOperations } from '@zenstackhq/runtime';
import type { ModelZodSchema } from '@zenstackhq/runtime/zod';
import { upperCaseFirst } from 'upper-case-first';
import { fromZodError } from 'zod-validation-error';
import { AUXILIARY_FIELDS } from '@zenstackhq/sdk';
import { LoggerConfig } from '../types';

export function getZodSchema(zodSchemas: ModelZodSchema, model: string, operation: keyof DbOperations) {
    if (zodSchemas[model]) {
        return zodSchemas[model][operation];
    } else if (zodSchemas[upperCaseFirst(model)]) {
        return zodSchemas[upperCaseFirst(model)][operation];
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

export function logWarning(logger: LoggerConfig | undefined | null, message: string) {
    if (logger === undefined) {
        console.warn(`@zenstackhq/server: ${message}`);
    } else if (logger?.warn) {
        logger.warn(message);
    }
}

export function logInfo(logger: LoggerConfig | undefined | null, message: string) {
    if (logger === undefined) {
        console.log(`@zenstackhq/server: ${message}`);
    } else if (logger?.info) {
        logger.info(message);
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
