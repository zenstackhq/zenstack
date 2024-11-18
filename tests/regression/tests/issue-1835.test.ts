import { loadSchema } from '@zenstackhq/testtools';

describe('issue 1835', () => {
    it('regression', async () => {
        await loadSchema(
            `
        enum Enum {
            SOME_VALUE
            ANOTHER_VALUE
        }

        model Model {
            id String @id @default(cuid())
            value Enum
            @@ignore
        }

        model AnotherModel {
            id String @id @default(cuid())
        }
            `,
            {
                provider: 'postgresql',
                pushDb: false,
            }
        );
    });
});
