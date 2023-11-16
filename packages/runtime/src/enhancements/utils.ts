/* eslint-disable @typescript-eslint/no-var-requires */

import path from 'path';
import * as util from 'util';
import type { DbClientContract } from '../types';

/**
 * Formats an object for pretty printing.
 */
export function formatObject(value: unknown) {
    return util.formatWithOptions({ depth: 20 }, value);
}

let _PrismaClientValidationError: new (...args: unknown[]) => Error;
let _PrismaClientKnownRequestError: new (...args: unknown[]) => Error;
let _PrismaClientUnknownRequestError: new (...args: unknown[]) => Error;

/* eslint-disable @typescript-eslint/no-explicit-any */
function loadPrismaModule(prisma: any) {
    // https://github.com/prisma/prisma/discussions/17832
    if (prisma._engineConfig?.datamodelPath) {
        // try engine path first
        const loadPath = path.dirname(prisma._engineConfig.datamodelPath);
        try {
            const _prisma = require(loadPath).Prisma;
            if (typeof _prisma !== 'undefined') {
                return _prisma;
            }
        } catch {
            // noop
        }
    }

    try {
        // Prisma v4
        return require('@prisma/client/runtime');
    } catch {
        try {
            // Prisma v5
            return require('@prisma/client');
        } catch (err) {
            if (process.env.ZENSTACK_TEST === '1') {
                // running in test, try cwd
                try {
                    return require(path.join(process.cwd(), 'node_modules/@prisma/client/runtime'));
                } catch {
                    return require(path.join(process.cwd(), 'node_modules/@prisma/client'));
                }
            } else {
                throw err;
            }
        }
    }
}

export function prismaClientValidationError(prisma: DbClientContract, message: string) {
    if (!_PrismaClientValidationError) {
        const _prisma = loadPrismaModule(prisma);
        _PrismaClientValidationError = _prisma.PrismaClientValidationError;
    }
    throw new _PrismaClientValidationError(message, { clientVersion: prisma._clientVersion });
}

export function prismaClientKnownRequestError(prisma: DbClientContract, ...args: unknown[]) {
    if (!_PrismaClientKnownRequestError) {
        const _prisma = loadPrismaModule(prisma);
        _PrismaClientKnownRequestError = _prisma.PrismaClientKnownRequestError;
    }
    return new _PrismaClientKnownRequestError(...args);
}

export function prismaClientUnknownRequestError(prisma: DbClientContract, ...args: unknown[]) {
    if (!_PrismaClientUnknownRequestError) {
        const _prisma = loadPrismaModule(prisma);
        _PrismaClientUnknownRequestError = _prisma.PrismaClientUnknownRequestError;
    }
    throw new _PrismaClientUnknownRequestError(...args);
}
