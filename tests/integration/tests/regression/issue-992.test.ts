import { loadSchema } from '@zenstackhq/testtools';

describe('Regression: issue 992', () => {
    it('regression', async () => {
        const { enhance, prisma } = await loadSchema(
            `
            model Product {
                id String @id @default(cuid())
                category Category @relation(fields: [categoryId], references: [id])
                categoryId String
              
                deleted Int @default(0) @omit
                @@deny('read', deleted != 0)
                @@allow('all', true)
            }
              
            model Category {
                id String @id @default(cuid())
                products Product[]
                @@allow('all', true)
            }
            `
        );

        await prisma.category.create({
            data: {
                products: {
                    create: [
                        {
                            deleted: 0,
                        },
                        {
                            deleted: 0,
                        },
                    ],
                },
            },
        });

        const db = enhance();
        const category = await db.category.findFirst({ include: { products: true } });
        expect(category.products[0].deleted).toBeUndefined();
        expect(category.products[1].deleted).toBeUndefined();
    });
});
