import { execSync as _exec, execFileSync, type ExecSyncOptions } from 'child_process';
import { fileURLToPath } from 'url';

/**
 * Utility for executing command synchronously and prints outputs on current console
 */
export function execSync(cmd: string, options?: Omit<ExecSyncOptions, 'env'> & { env?: Record<string, string> }): void {
    const { env, ...restOptions } = options ?? {};
    const mergedEnv = env ? { ...process.env, ...env } : undefined;
    _exec(cmd, {
        encoding: 'utf-8',
        stdio: options?.stdio ?? 'inherit',
        env: mergedEnv,
        ...restOptions,
    });
}

/**
 * Utility for running package commands through npx/bunx
 */
export function execPackage(
    cmd: string,
    options?: Omit<ExecSyncOptions, 'env'> & { env?: Record<string, string> },
): void {
    const packageManager = process?.versions?.['bun'] ? 'bunx' : 'npx';
    const [executable, ...args] = cmd.split(' ');
    execFileSync(packageManager, [executable, ...args], {
        encoding: 'utf-8',
        stdio: options?.stdio ?? 'inherit',
        env: options?.env ? { ...process.env, ...options.env } : undefined,
        ...options,
    });
}

/**
 * Utility for running prisma commands
 */
export function execPrisma(args: string, options?: Omit<ExecSyncOptions, 'env'> & { env?: Record<string, string> }) {
    let prismaPath: string | undefined;
    try {
        if (typeof import.meta.resolve === 'function') {
            // esm
            prismaPath = fileURLToPath(import.meta.resolve('prisma/build/index.js'));
        } else {
            // cjs
            prismaPath = require.resolve('prisma/build/index.js');
        }
    } catch {
        // ignore and fallback
    }

    const _options = {
        ...options,
        env: {
            ...options?.env,
            PRISMA_HIDE_UPDATE_MESSAGE: '1',
        },
    };

    if (!prismaPath) {
        // fallback to npx/bunx execute
        execPackage(`prisma ${args}`, _options);
        return;
    }

    execFileSync('node', [prismaPath, ...args.split(' ')], {
        encoding: 'utf-8',
        stdio: _options?.stdio ?? 'inherit',
        env: _options?.env ? { ...process.env, ..._options.env } : undefined,
        ..._options,
    });
}
