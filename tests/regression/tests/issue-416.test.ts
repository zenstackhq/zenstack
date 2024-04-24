import { loadSchema } from '@zenstackhq/testtools';

describe('Regression: issue 416', () => {
    it('regression', async () => {
        await loadSchema(
            `
model Example {
    id Int @id
    doubleQuote String @default("s\\"1")
    singleQuote String @default('s\\'1')
    json Json @default("{\\"theme\\": \\"light\\", \\"consoleDrawer\\": false}")
}
        `,
            { provider: 'postgresql', dbUrl: 'env("DATABASE_URL")', pushDb: false }
        );
    });
});
