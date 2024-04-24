import { loadSchema } from '@zenstackhq/testtools';

describe('Regression: issue 971', () => {
    it('regression', async () => {
        await loadSchema(
            `
            abstract model Level1 {
                id String @id @default(cuid())
                URL String?
                @@validate(URL != null, "URL must be provided") // works
            }
            abstract model Level2 extends Level1 {
                @@validate(URL != null, "URL must be provided") // works 
            }
            abstract model Level3 extends Level2 {
                @@validate(URL != null, "URL must be provided") // doesn't work
            }
            model Foo extends Level3 {
            }
            `
        );
    });
});
