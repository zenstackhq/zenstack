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
    try {
        latestVersion = await getLatestVersion();
    } catch {
        // noop
        return;
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
