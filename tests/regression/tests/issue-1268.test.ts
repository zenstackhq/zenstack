import { loadSchema } from '@zenstackhq/testtools';

describe('issue 1268', () => {
    it('regression', async () => {
        const { zodSchemas } = await loadSchema(
            `
            model Model {
                id String @id @default(uuid())
                bytes Bytes
            }
            `,
            {
                fullZod: true,
                pushDb: false,
                compile: true,
                extraSourceFiles: [
                    {
                        name: 'test.ts',
                        content: `
import { ModelCreateInputObjectSchema } from '.zenstack/zod/objects';
ModelCreateInputObjectSchema.parse({ bytes: new Uint8Array(0) });
                        `,
                    },
                ],
            }
        );

        expect(
            zodSchemas.objects.ModelCreateInputObjectSchema.safeParse({ bytes: new Uint8Array(0) }).success
        ).toBeTruthy();
    });
});
