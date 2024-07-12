import { loadSchema } from '@zenstackhq/testtools';

describe('issue 1530', () => {
    it('regression', async () => {
        const { prisma, enhance } = await loadSchema(
            `
            model Category {
                id       Int        @id @default(autoincrement())
                name     String     @unique

                parentId Int?
                parent   Category?  @relation("ParentChildren", fields: [parentId], references: [id])
                children Category[] @relation("ParentChildren")
                @@allow('all', true)
            }
            `
        );

        await prisma.category.create({
            data: { id: 1, name: 'C1' },
        });

        const db = enhance();

        await db.category.update({
            where: { id: 1 },
            data: { parent: { connect: { id: 1 } } },
        });

        const r = await db.category.update({
            where: { id: 1 },
            data: { parent: { disconnect: true } },
        });
        expect(r.parent).toBeUndefined();
    });
});
