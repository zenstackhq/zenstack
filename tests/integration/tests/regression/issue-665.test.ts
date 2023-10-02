import { loadSchema } from '@zenstackhq/testtools';

describe('Regression: issue 665', () => {
    it('regression', async () => {
        const { prisma, withPolicy } = await loadSchema(
            `
            model User {
                id Int @id @default(autoincrement())
                admin Boolean @default(false)
                username String @unique @allow("all", auth() == this) @allow("all", auth().admin)
                password String @password @default("") @allow("all", auth() == this) @allow("all", auth().admin)
                firstName String @default("")
                lastName String @default("")
              
                @@allow('all', true)
              }
            `
        );

        await prisma.user.create({ data: { id: 1, username: 'test', password: 'test', admin: true } });

        // admin
        let r = await withPolicy({ id: 1, admin: true }).user.findFirst();
        expect(r.username).toEqual('test');

        // owner
        r = await withPolicy({ id: 1 }).user.findFirst();
        expect(r.username).toEqual('test');

        // anonymous
        r = await withPolicy().user.findFirst();
        expect(r.username).toBeUndefined();

        // non-owner
        r = await withPolicy({ id: 2 }).user.findFirst();
        expect(r.username).toBeUndefined();
    });
});
