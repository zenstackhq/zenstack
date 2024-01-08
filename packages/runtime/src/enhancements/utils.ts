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
