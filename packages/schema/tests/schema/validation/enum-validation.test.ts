import { loadModelWithError } from '@zenstackhq/testtools';

describe('Enum Validation Tests', () => {
    const prelude = `
        datasource db {
            provider = "postgresql"
            url = "url"
        }
    `;

    it('duplicated fields', async () => {
        expect(
            await loadModelWithError(`
                ${prelude}
                enum E {
                    A
                    A
                }
        `)
        ).toContain('Duplicated declaration name "A"');
    });
});
