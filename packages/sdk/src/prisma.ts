/* eslint-disable @typescript-eslint/no-var-requires */

import type { DMMF } from '@prisma/generator-helper';
import path from 'path';
import * as semver from 'semver';
import { RUNTIME_PACKAGE } from './constants';
import type { PluginOptions } from './types';

/**
 * Given an import context directory and plugin options, compute the import spec for the Prisma Client.
 */
export function getPrismaClientImportSpec(importingFromDir: string, options: PluginOptions) {
    if (!options.prismaClientPath || options.prismaClientPath === '@prisma/client') {
        return '@prisma/client';
    }

    if (options.prismaClientPath.startsWith(RUNTIME_PACKAGE)) {
        return options.prismaClientPath;
    }

    if (path.isAbsolute(options.prismaClientPath)) {
        // absolute path
        return options.prismaClientPath;
    }

    // resolve absolute path based on the zmodel file location
    const resolvedPrismaClientOutput = path.resolve(path.dirname(options.schemaPath), options.prismaClientPath);

    // compute prisma client absolute output dir relative to the importing file
    return normalizePath(path.relative(importingFromDir, resolvedPrismaClientOutput));
}

function normalizePath(p: string) {
    return p ? p.split(path.sep).join(path.posix.sep) : p;
}

export type GetDMMFOptions = {
    datamodel?: string;
    cwd?: string;
    prismaPath?: string;
    datamodelPath?: string;
    retry?: number;
    previewFeatures?: string[];
};

/**
 * Loads Prisma DMMF with appropriate version
 */
export function getDMMF(options: GetDMMFOptions, defaultPrismaVersion?: string): Promise<DMMF.Document> {
    const prismaVersion = getPrismaVersion() ?? defaultPrismaVersion;
    if (prismaVersion && semver.gte(prismaVersion, '5.0.0')) {
        const _getDMMF = require('@prisma/internals-v5').getDMMF;
        return _getDMMF(options);
    } else {
        const _getDMMF = require('@prisma/internals').getDMMF;
        return _getDMMF(options);
    }
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
