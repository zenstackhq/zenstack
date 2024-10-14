/* eslint-disable @typescript-eslint/no-var-requires */

import type { DMMF } from '@prisma/generator-helper';
import { getDMMF as _getDMMF, type GetDMMFOptions } from '@prisma/internals';
import { DEFAULT_RUNTIME_LOAD_PATH } from '@zenstackhq/runtime';
import path from 'path';
import semver from 'semver';
import { Model } from './ast';
import { RUNTIME_PACKAGE } from './constants';
import type { PluginOptions } from './types';
import { getDataSourceProvider } from './utils';
import { normalizedRelative } from './path';

/**
 * Given an import context directory and plugin options, compute the import spec for the Prisma Client.
 */
export function getPrismaClientImportSpec(importingFromDir: string, options: PluginOptions) {
    if (!options.prismaClientPath || options.prismaClientPath === '@prisma/client') {
        return '@prisma/client';
    }

    if (
        options.prismaClientPath.startsWith(RUNTIME_PACKAGE) ||
        options.prismaClientPath.startsWith(DEFAULT_RUNTIME_LOAD_PATH)
    ) {
        return options.prismaClientPath;
    }

    if (path.isAbsolute(options.prismaClientPath)) {
        // absolute path
        return options.prismaClientPath;
    }

    // resolve absolute path based on the zmodel file location
    const resolvedPrismaClientOutput = path.resolve(path.dirname(options.schemaPath), options.prismaClientPath);

    // translate to path relative to the importing context directory
    let result = normalizedRelative(importingFromDir, resolvedPrismaClientOutput);

    // remove leading `node_modules` (which may be provided by the user)
    result = result.replace(/^([./\\]*)?node_modules\//, '');

    return normalizePath(result);
}

function normalizePath(p: string) {
    return p ? p.split(path.sep).join(path.posix.sep) : p;
}

/**
 * Loads Prisma DMMF
 */
export function getDMMF(options: GetDMMFOptions): Promise<DMMF.Document> {
    return _getDMMF(options);
}

/**
 * Gets the installed Prisma's version
 */
export function getPrismaVersion(): string | undefined {
    if (process.env.ZENSTACK_TEST === '1') {
        // test environment
        try {
            return require(path.resolve('./node_modules/@prisma/client/package.json')).version;
        } catch {
            return undefined;
        }
    }

    try {
        return require('@prisma/client/package.json').version;
    } catch {
        try {
            return require('prisma/package.json').version;
        } catch {
            return undefined;
        }
    }
}

/**
 * Returns if the given model supports `createMany` operation.
 */
export function supportCreateMany(model: Model) {
    // `createMany` is supported for sqlite since Prisma 5.12.0
    const prismaVersion = getPrismaVersion();
    const dsProvider = getDataSourceProvider(model);
    return dsProvider !== 'sqlite' || (prismaVersion && semver.gte(prismaVersion, '5.12.0'));
}

export type { DMMF } from '@prisma/generator-helper';
