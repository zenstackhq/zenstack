import { execSync as _exec, StdioOptions } from 'child_process';

export function execSync(cmd: string, stdio: StdioOptions = 'inherit', env?: Record<string, string>): void {
    const mergedEnv = { ...process.env, ...env };
    _exec(cmd, { encoding: 'utf-8', stdio, env: mergedEnv });
}
