import { loadSchema } from '@zenstackhq/testtools';

describe('Regression: issue 646', () => {
    it('regression', async () => {
        await loadSchema(`
model Example {
    id Int @id
    epsilon Decimal @default(0.00000001)
}
        `);
    });
});
