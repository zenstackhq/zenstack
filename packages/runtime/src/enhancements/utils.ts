/* eslint-disable @typescript-eslint/no-var-requires */

import { AUXILIARY_FIELDS } from '@zenstackhq/sdk';
import path from 'path';
import * as util from 'util';
import { DbClientContract } from '../types';

/**
 * Wraps a value into array if it's not already one
 */
export function ensureArray<T>(value: T): T[] {
    return Array.isArray(value) ? value : [value];
}

/**
 * Gets field names in a data model entity, filtering out internal fields.
 */
export function getModelFields(data: object) {
    return data ? Object.keys(data).filter((f) => !AUXILIARY_FIELDS.includes(f)) : [];
}

/**
 * Array or scalar
 */
export type Enumerable<T> = T | Array<T>;

/**
 * Uniformly enumerates an array or scalar.
 */
export function enumerate<T>(x: Enumerable<T>) {
    if (Array.isArray(x)) {
        return x;
    } else {
        return [x];
    }
}

export function formatObject(value: unknown) {
    return util.formatWithOptions({ depth: 10 }, value);
}

let _PrismaClientValidationError: new (...args: unknown[]) => Error;
let _PrismaClientKnownRequestError: new (...args: unknown[]) => Error;
let _PrismaClientUnknownRequestError: new (...args: unknown[]) => Error;

/* eslint-disable @typescript-eslint/no-explicit-any */
function loadPrismaModule(prisma: any) {
    // https://github.com/prisma/prisma/discussions/17832
    if (prisma._engineConfig?.datamodelPath) {
        const loadPath = path.dirname(prisma._engineConfig.datamodelPath);
        try {
            return require(loadPath).Prisma;
        } catch {
            return require('@prisma/client/runtime');
        }
    } else {
        return require('@prisma/client/runtime');
    }
}

export function prismaClientValidationError(prisma: DbClientContract, ...args: unknown[]) {
    if (!_PrismaClientValidationError) {
        const _prisma = loadPrismaModule(prisma);
        _PrismaClientValidationError = _prisma.PrismaClientValidationError;
    }
    throw new _PrismaClientValidationError(...args);
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
