import { loadSchema } from '@zenstackhq/testtools';

describe('Regression: issue 886', () => {
    it('regression', async () => {
        const { zodSchemas } = await loadSchema(
            `
            model Model {
                id Int @id @default(autoincrement())
                a Int @default(100)
                b String @default('')
                c DateTime @default(now())
            }
            `
        );

        const r = zodSchemas.models.ModelSchema.parse({});
        expect(r.a).toBe(100);
        expect(r.b).toBe('');
        expect(r.c).toBeInstanceOf(Date);
    });
});
