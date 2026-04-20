import { env } from 'node:process';

/**
 * Common CI environment variable names used by various providers.
 */
const CI_ENV_VARS = [
    'CI',
    'CONTINUOUS_INTEGRATION',
    'BUILD_NUMBER',
    'RUN_ID',
];

/**
 * Detects if the current environment is a CI (Continuous Integration) system.
 * Checks for the presence of well-known CI environment variables.
 *
 * @returns `true` if running in a CI environment, `false` otherwise
 */
export const isInCi = (): boolean => {
    // Check if CI is explicitly set to a falsy value
    if (env['CI'] === '0' || env['CI'] === 'false' || env['CI'] === '') {
        return false;
    }

    // Check for the presence of CI-related environment variables
    return CI_ENV_VARS.some((key) => key in env) ||
        Object.keys(env).some((key) => key.startsWith('CI_'));
};
