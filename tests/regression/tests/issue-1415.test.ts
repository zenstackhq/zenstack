import { loadSchema } from '@zenstackhq/testtools';

describe('issue 1415', () => {
    it('regression', async () => {
        await loadSchema(
            `
            model User {
              id    String @id @default(cuid())
              prices Price[]
            }
            
            model Price {
              id        String   @id @default(cuid())
              owner User @relation(fields: [ownerId], references: [id])
              ownerId String @default(auth().id)
              priceType    String
              @@delegate(priceType)
            }
            `
        );
    });
});
