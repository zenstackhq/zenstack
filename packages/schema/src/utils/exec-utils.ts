import { execSync as _exec, StdioOptions } from 'child_process';

/**
 * Utility for executing command synchronously and prints outputs on current console
 */
export function execSync(cmd: string, stdio: StdioOptions = 'inherit', env?: Record<string, string>): void {
    const mergedEnv = { ...process.env, ...env };
    _exec(cmd, { encoding: 'utf-8', stdio, env: mergedEnv });
}

/**
 * Utility for running package commands through npx/bunx
 */
export function execPackage(cmd: string, stdio: StdioOptions = 'inherit', env?: Record<string, string>): void {
    const packageManager = process?.versions?.bun ? 'bunx' : 'npx';
    const mergedEnv = { ...process.env, ...env };
    _exec(`${packageManager} ${cmd}`, { encoding: 'utf-8', stdio, env: mergedEnv });
}