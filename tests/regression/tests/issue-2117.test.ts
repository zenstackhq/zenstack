import { loadSchema } from '@zenstackhq/testtools';

describe('issue 2117', () => {
    it('regression', async () => {
        const { prisma, enhanceRaw, prismaModule } = await loadSchema(
            `
            model User {
                uuid              String           @id
                email             String           @unique @deny('read', auth().uuid != this.uuid)
                username          String           @unique
                @@allow('all', true)
            }
            `
        );

        const extPrisma = prisma.$extends(
            prismaModule.defineExtension({
                name: 'urls-extension',
                result: {
                    user: {
                        pageUrl: {
                            needs: { username: true },
                            compute: () => `foo`,
                        },
                    },
                },
            })
        );

        const db = enhanceRaw(extPrisma, { user: { uuid: '1' } }, { logPrismaQuery: true });
        await db.user.create({ data: { uuid: '1', email: 'a@b.com', username: 'a' } });
        await expect(db.user.findFirst()).resolves.toMatchObject({
            uuid: '1',
            email: 'a@b.com',
            username: 'a',
            pageUrl: 'foo',
        });
        const r = await db.user.findFirst({ select: { email: true } });
        expect(r.email).toBeTruthy();
        expect(r.uuid).toBeUndefined();
        expect(r.pageUrl).toBeUndefined();
    });
});
