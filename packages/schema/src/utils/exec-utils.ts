import { execSync as _exec, ExecSyncOptions } from 'child_process';

/**
 * Utility for executing command synchronously and prints outputs on current console
 */
export function execSync(cmd: string, options?: Omit<ExecSyncOptions, 'env'> & { env?: Record<string, string> }): void {
    const { env, ...restOptions } = options ?? {};
    const mergedEnv = env ? { ...process.env, ...env } : undefined;
    _exec(cmd, { encoding: 'utf-8', stdio: options?.stdio ?? 'inherit', env: mergedEnv, ...restOptions });
}
