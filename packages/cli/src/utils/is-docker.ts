// Based on https://github.com/sindresorhus/is-docker

import fs from 'node:fs';

/**
 * Cached result for docker detection to avoid repeated file system checks.
 * Reset-able for testing purposes.
 */
let isDockerCached: boolean | undefined;

/**
 * Checks if the /.dockerenv file exists (legacy method).
 */
function hasDockerEnv(): boolean {
    try {
        fs.statSync('/.dockerenv');
        return true;
    } catch {
        return false;
    }
}

/**
 * Checks if docker is present in /proc/self/cgroup (modern method).
 */
function hasDockerCGroup(): boolean {
    try {
        return fs.readFileSync('/proc/self/cgroup', 'utf8').includes('docker');
    } catch {
        return false;
    }
}

/**
 * Detects if the current process is running inside a Docker container.
 * Uses a cached result after the first call for performance.
 *
 * @returns `true` if running inside Docker, `false` otherwise
 */
export default function isDocker(): boolean {
    if (isDockerCached === undefined) {
        isDockerCached = hasDockerEnv() || hasDockerCGroup();
    }

    return isDockerCached;
}

/**
 * Resets the cached docker detection result.
 * Useful for testing or when the container environment changes.
 */
export function resetDockerCache(): void {
    isDockerCached = undefined;
}
