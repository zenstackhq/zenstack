/* eslint-disable @typescript-eslint/no-var-requires */
export function getVersion() {
    try {
        return require('./package.json').version;
    } catch {
        return require('../package.json').version;
    }
}
