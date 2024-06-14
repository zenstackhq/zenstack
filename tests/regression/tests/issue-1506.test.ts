import { loadModelWithError } from '@zenstackhq/testtools';
describe('issue 1506', () => {
    it('regression', async () => {
        await expect(
            loadModelWithError(
                `
            model A {
                id Int @id @default(autoincrement())
                value Int
                b B @relation(fields: [bId], references: [id])
                bId Int @unique

                @@allow('read', true)
            }

            model B {
                id Int @id @default(autoincrement())
                value Int
                a A?
                c C @relation(fields: [cId], references: [id])
                cId Int @unique

                @@allow('read', value > c.value)
            }

            model C {
                id Int @id @default(autoincrement())
                value Int
                b B?

                @@allow('read', true)
            }
            `
            )
        ).resolves.toContain(
            'comparison between fields of different models is not supported in model-level "read" rules'
        );
    });
});
