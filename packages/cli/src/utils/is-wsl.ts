import process from 'node:process';
import os from 'node:os';
import fs from 'node:fs';

/**
 * Checks if the current process is running under Windows Subsystem for Linux (WSL).
 * Uses multiple detection methods for reliability.
 *
 * @returns `true` if running under WSL, `false` otherwise
 */
export const isWsl = (): boolean => {
    if (process.platform !== 'linux') {
        return false;
    }

    if (os.release().toLowerCase().includes('microsoft')) {
        return true;
    }

    try {
        return fs.readFileSync('/proc/version', 'utf8').toLowerCase().includes('microsoft');
    } catch {
        return false;
    }
};
