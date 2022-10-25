import { execSync as _exec } from 'child_process';

/**
 * Utility for executing command synchronously and prints outputs on current console
 */
export function execSync(cmd: string): void {
    _exec(cmd, { encoding: 'utf-8', stdio: 'inherit' });
}
