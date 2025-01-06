/* eslint-disable @typescript-eslint/no-var-requires */
export function getVersion(): string | undefined {
    try {
        return require('../package.json').version;
    } catch {
        try {
            // dev environment
            return require('../../package.json').version;
        } catch {
            return undefined;
        }
    }
}
