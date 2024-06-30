import safeJsonStringify from 'safe-json-stringify';
import { resolveField, type FieldInfo, type ModelMeta } from '..';
import type { DbClientContract } from '../types';

/**
 * Formats an object for pretty printing.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function formatObject(value: any, multiLine = true) {
    return multiLine ? safeJsonStringify(value, undefined, 2) : safeJsonStringify(value);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function prismaClientValidationError(prisma: DbClientContract, prismaModule: any, message: string): Error {
    throw new prismaModule.PrismaClientValidationError(message, { clientVersion: prisma._clientVersion });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function prismaClientKnownRequestError(prisma: DbClientContract, prismaModule: any, ...args: unknown[]): Error {
    return new prismaModule.PrismaClientKnownRequestError(...args);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function prismaClientUnknownRequestError(prismaModule: any, ...args: unknown[]): Error {
    throw new prismaModule.PrismaClientUnknownRequestError(...args);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isUnsafeMutate(model: string, args: any, modelMeta: ModelMeta) {
    if (!args) {
        return false;
    }
    for (const k of Object.keys(args)) {
        const field = resolveField(modelMeta, model, k);
        if (field && (isAutoIncrementIdField(field) || field.isForeignKey)) {
            return true;
        }
    }
    return false;
}

export function isAutoIncrementIdField(field: FieldInfo) {
    return field.isId && field.isAutoIncrement;
}
