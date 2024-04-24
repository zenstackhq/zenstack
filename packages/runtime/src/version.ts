import * as pkgJson from './package.json';

/**
 * Gets this package's version.
 * @returns
 */
export function getVersion() {
    return pkgJson.version;
}
