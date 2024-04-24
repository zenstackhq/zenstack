import { loadSchema } from '@zenstackhq/testtools';

describe('Regression: issue 735', () => {
    it('regression', async () => {
        await loadSchema(
            `
        model MyModel {
            id String @id @default(cuid())
            view String
            import Int
        }

        model view {
            id String @id @default(cuid())
            name String
        }
        `,
            { pushDb: false }
        );
    });
});
