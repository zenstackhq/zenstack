import { loadModel, loadModelWithError } from '@zenstackhq/testtools';

describe('Regression: issue 925', () => {
    it('member reference without using this', async () => {
        await expect(
            loadModelWithError(
                `
            model User {
                id Int @id @default(autoincrement())
                company Company[]
                test Int
              
                @@allow('read', auth().company?[staff?[companyId == test]])
            }
              
            model Company {
                id Int @id @default(autoincrement())
                user User @relation(fields: [userId], references: [id])
                userId Int
              
                staff Staff[]
                @@allow('read', true)
            }
              
            model Staff {
                id Int @id @default(autoincrement())
              
                company Company @relation(fields: [companyId], references: [id])
                companyId Int
              
                @@allow('read', true)
              }
            `
            )
        ).resolves.toContain("Could not resolve reference to ReferenceTarget named 'test'.");
    });

    it('reference with this', async () => {
        await loadModel(
            `
            model User {
                id Int @id @default(autoincrement())
                company Company[]
                test Int
              
                @@allow('read', auth().company?[staff?[companyId == this.test]])
            }
              
            model Company {
                id Int @id @default(autoincrement())
                user User @relation(fields: [userId], references: [id])
                userId Int
              
                staff Staff[]
                @@allow('read', true)
            }
              
            model Staff {
                id Int @id @default(autoincrement())
              
                company Company @relation(fields: [companyId], references: [id])
                companyId Int
              
                @@allow('read', true)
              }
            `
        );
    });
});
