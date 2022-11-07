/*
 * For a detailed explanation regarding each configuration property and type check, visit:
 * https://jestjs.io/docs/configuration
 */
export default {
    // Automatically clear mock calls, instances, contexts and results before every test
    clearMocks: true,

    // Automatically reset mock state before every test
    resetMocks: true,

    // A map from regular expressions to paths to transformers
    transform: { '^.+\\.tsx?$': 'ts-jest' },

    testTimeout: 300000,

    // explicitly specify moduel paths so that resolution from local dependencies work
    modulePaths: ['<rootDir>/tests/test-run/node_modules'],
};
