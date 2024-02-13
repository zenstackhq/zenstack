/*
 * For a detailed explanation regarding each configuration property and type check, visit:
 * https://jestjs.io/docs/configuration
 */

export default {
    // Automatically clear mock calls, instances, contexts and results before every test
    clearMocks: true,

    // Indicates whether the coverage information should be collected while executing the test
    collectCoverage: true,

    // The directory where Jest should output its coverage files
    coverageDirectory: 'tests/coverage',

    // An array of regexp pattern strings used to skip coverage collection
    coveragePathIgnorePatterns: ['/node_modules/', '/tests/'],

    // Indicates which provider should be used to instrument code for coverage
    coverageProvider: 'v8',

    // A list of reporter names that Jest uses when writing coverage reports
    coverageReporters: ['json', 'text', 'lcov', 'clover'],

    // A map from regular expressions to paths to transformers
    transform: { '^.+\\.tsx?$': 'ts-jest' },

    testTimeout: 300000,
    testMatch: ['**/permissions-checker.test.ts'],
};
