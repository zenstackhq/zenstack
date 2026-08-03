import colors from 'colors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import semver from 'semver';

const CHECK_VERSION_TIMEOUT = 2000;
const VERSION_CHECK_TAG = 'latest';

export function getVersion() {
    try {
        // isomorphic __dirname
        const _dirname = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));
        return JSON.parse(fs.readFileSync(path.join(_dirname, '../package.json'), 'utf8')).version;
    } catch {
        return undefined;
    }
}

export async function checkNewVersion() {
    const currVersion = getVersion();
    let latestVersion: string;
    // race against a ref'd, always-settling timer: if the fetch's connection dies in a
    // way that strands its promise (leaving no active handle), the pending `await` would
    // otherwise drain the event loop and silently exit the process with code 0 mid-command;
    // the timer both keeps the loop alive and guarantees this await settles
    let timer: NodeJS.Timeout | undefined;
    try {
        const fetchPromise = getLatestVersion();
        // if the timer wins the race, a later settlement of the fetch must not surface
        // as an unhandled rejection
        fetchPromise.catch(() => {});
        latestVersion = await Promise.race([
            fetchPromise,
            new Promise<never>((_, reject) => {
                timer = setTimeout(() => reject(new Error('version check timed out')), CHECK_VERSION_TIMEOUT + 1000);
            }),
        ]);
    } catch {
        // noop
        return;
    } finally {
        clearTimeout(timer);
    }

    if (latestVersion && currVersion && semver.gt(latestVersion, currVersion)) {
        console.log(`A newer version ${colors.cyan(latestVersion)} is available.`);
    }
}

export async function getLatestVersion() {
    const fetchResult = await fetch(`https://registry.npmjs.org/@zenstackhq/cli/${VERSION_CHECK_TAG}`, {
        headers: { accept: 'application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8, */*' },
        signal: AbortSignal.timeout(CHECK_VERSION_TIMEOUT),
    });

    if (fetchResult.ok) {
        const data: any = await fetchResult.json();
        const latestVersion = data?.version;
        if (typeof latestVersion === 'string' && semver.valid(latestVersion)) {
            return latestVersion;
        }
    }

    throw new Error('invalid npm registry response');
}
