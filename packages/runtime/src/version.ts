import path from 'path';

/* eslint-disable @typescript-eslint/no-var-requires */
export function getVersion() {
    try {
        return require('./package.json').version;
    } catch {
        try {
            // dev environment
            return require('../package.json').version;
        } catch {
            return 'unknown';
        }
    }
}

/**
 * Gets installed Prisma version by first checking "@prisma/client" and if not available,
 * "prisma".
 */
export function getPrismaVersion(): string | undefined {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        return require('@prisma/client/package.json').version;
    } catch {
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            return require('prisma/package.json').version;
        } catch {
            if (process.env.ZENSTACK_TEST === '1') {
                // test environment
                try {
                    return require(path.resolve('./node_modules/@prisma/client/package.json')).version;
                } catch {
                    return undefined;
                }
            }

            return undefined;
        }
    }
}
