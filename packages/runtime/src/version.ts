/* eslint-disable @typescript-eslint/no-var-requires */
export function getVersion() {
    return require('./package.json').version;
}
