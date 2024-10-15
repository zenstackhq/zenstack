import { loadSchema } from '@zenstackhq/testtools';
describe('issue 1644', () => {
    it('regression', async () => {
        const { prisma, enhance } = await loadSchema(
            `
            model User {
                id       Int    @id @default(autoincrement())
                email    String @unique @email @length(6, 32) @allow('read', auth() == this)

                // full access to all
                @@allow('all', true)
            }
            `
        );

        await prisma.user.create({ data: { id: 1, email: 'a@example.com' } });
        await prisma.user.create({ data: { id: 2, email: 'b@example.com' } });

        const db = enhance({ id: 1 });
        await expect(db.user.count({ where: { email: { contains: 'example.com' } } })).resolves.toBe(1);
        await expect(db.user.findMany({ where: { email: { contains: 'example.com' } } })).resolves.toHaveLength(1);
    });
});
