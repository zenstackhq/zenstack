import { loadSchema } from '@zenstackhq/testtools';

describe('issue 1693', () => {
    it('regression', async () => {
        await loadSchema(
            `
            model Animal {
                id String @id @default(uuid())
                animalType String @default("")
                @@delegate(animalType)
            }

            model Dog extends Animal {
                name String
            }
            `,
            { fullZod: true }
        );
    });
});
