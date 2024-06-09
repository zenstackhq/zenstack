import { loadModel, loadModelWithError, safelyLoadModel } from '../../utils';

describe('Datasource Validation Tests', () => {
    it('missing fields', async () => {
        const result = await safelyLoadModel(`
                datasource db {
                }
        `);

        expect(result).toMatchObject({
            status: 'rejected',
            reason: {
                cause: [
                    { message: 'datasource must include a "provider" field' },
                    { message: 'datasource must include a "url" field' },
                ],
            },
        });
    });

    it('dup fields', async () => {
        expect(
            await loadModelWithError(`
                datasource db {
                    provider = 'abc'
                    provider = 'abc'
                }
        `)
        ).toContain('Duplicated declaration name "provider"');
    });

    it('invalid provider value', async () => {
        expect(
            await loadModelWithError(`
                datasource db {
                    provider = 123
                }
        `)
        ).toContain('"provider" must be set to a string literal');

        expect(
            await loadModelWithError(`
                datasource db {
                    provider = 'abc'
                }
        `)
        ).toContain('Provider "abc" is not supported');
    });

    it('invalid url value', async () => {
        expect(
            await loadModelWithError(`
                datasource db {
                    url = 123
                }
        `)
        ).toContain('"url" must be set to a string literal or an invocation of "env" function');

        expect(
            await loadModelWithError(`
                datasource db {
                    url = uuid()
                }
        `)
        ).toContain('"url" must be set to a string literal or an invocation of "env" function');
    });

    it('invalid relationMode value', async () => {
        expect(
            await loadModelWithError(`
                datasource db {
                    relationMode = 123
                }
        `)
        ).toContain('"relationMode" must be set to "foreignKeys" or "prisma"');

        expect(
            await loadModelWithError(`
                datasource db {
                    relationMode = "foo"
                }
        `)
        ).toContain('"relationMode" must be set to "foreignKeys" or "prisma"');
    });

    it('success', async () => {
        await loadModel(`
            datasource db {
                provider = "postgresql"
                url = "url"
                relationMode = "prisma"
            }
        `);

        await loadModel(`
            datasource db {
                provider = "postgresql"
                url = env("url")
                relationMode = "foreignKeys"
            }
        `);
    });
});
