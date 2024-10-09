/*
 * For a detailed explanation regarding each configuration property and type check, visit:
 * https://jestjs.io/docs/configuration
 */

import path from 'path';

export default {
    // Automatically clear mock calls, instances, contexts and results before every test
    clearMocks: true,

    globalSetup: path.join(__dirname, '../../../script/test-global-setup.ts'),

    setupFiles: [path.join(__dirname, '../../../script/set-test-env.ts')],

    // Indicates whether the coverage information should be collected while executing the test
    collectCoverage: true,

    // The directory where Jest should output its coverage files
    coverageDirectory: path.join(__dirname, '../../../.test/coverage'),

    // An array of regexp pattern strings used to skip coverage collection
    coveragePathIgnorePatterns: ['/node_modules/', '/tests/'],

    // Indicates which provider should be used to instrument code for coverage
    coverageProvider: 'v8',

    // A list of reporter names that Jest uses when writing coverage reports
    coverageReporters: ['json', 'text', 'lcov', 'clover'],

    // A map from regular expressions to paths to transformers
    transform: { '^.+\\.tsx?$': 'ts-jest' },

    testTimeout: 300000,

    testEnvironment: 'jsdom',
};
