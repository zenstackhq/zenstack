import baseConfig from '../../jest.config';

/*
 * For a detailed explanation regarding each configuration property and type check, visit:
 * https://jestjs.io/docs/configuration
 */
export default {
    ...baseConfig,
    setupFilesAfterEnv: ['./test-setup.ts'],
};
