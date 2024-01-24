import * as util from 'util';
import type { DbClientContract } from '../types';

/**
 * Formats an object for pretty printing.
 */
export function formatObject(value: unknown) {
    return util.formatWithOptions({ depth: 20 }, value);
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

export function deepGet(object: object, path: string | string[] | undefined, defaultValue: unknown): unknown {
    if (path === undefined || path === '') {
        return defaultValue;
    }
    const keys = Array.isArray(path) ? path : path.split('.');
    for (const key of keys) {
        if (object && typeof object === 'object' && key in object) {
            object = object[key as keyof typeof object];
        } else {
            return defaultValue;
        }
    }
    return object !== undefined ? object : defaultValue;
}
