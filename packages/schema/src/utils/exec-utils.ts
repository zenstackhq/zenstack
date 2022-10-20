import { execSync as _exec } from 'child_process';

export function execSync(cmd: string) {
    _exec(cmd, { encoding: 'utf-8', stdio: 'inherit' });
}
