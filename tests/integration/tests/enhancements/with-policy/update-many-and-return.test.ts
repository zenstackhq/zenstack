import { loadSchema } from '@zenstackhq/testtools';

describe('Test API updateManyAndReturn', () => {
    it('model-level policies', async () => {
        const { prisma, enhance } = await loadSchema(
            `
        model User {
            id Int @id @default(autoincrement())
            posts Post[]
            level Int

            @@allow('read', level > 0)
        }

        model Post {
            id Int @id @default(autoincrement())
            title String
            published Boolean @default(false)
            userId Int
            user User @relation(fields: [userId], references: [id])

            @@allow('read', published)
            @@allow('update', contains(title, 'hello'))
        }
        `
        );

        await prisma.user.createMany({
            data: [{ id: 1, level: 1 }],
        });
        await prisma.user.createMany({
            data: [{ id: 2, level: 0 }],
        });

        await prisma.post.createMany({
            data: [
                { id: 1, title: 'hello1', userId: 1, published: true },
                { id: 2, title: 'world1', userId: 1, published: false },
            ],
        });

        const db = enhance();

        // only post#1 is updated
        let r = await db.post.updateManyAndReturn({
            data: { title: 'foo' },
        });
        expect(r).toHaveLength(1);
        expect(r[0].id).toBe(1);

        // post#2 is excluded from update
        await expect(
            db.post.updateManyAndReturn({
                where: { id: 2 },
                data: { title: 'foo' },
            })
        ).resolves.toHaveLength(0);

        // reset
        await prisma.post.update({ where: { id: 1 }, data: { title: 'hello1' } });

        // post#1 is updated
        await expect(
            db.post.updateManyAndReturn({
                where: { id: 1 },
                data: { title: 'foo' },
            })
        ).resolves.toHaveLength(1);

        // reset
        await prisma.post.update({ where: { id: 1 }, data: { title: 'hello1' } });

        // read-back check
        // post#1 updated but can't be read back
        await expect(
            db.post.updateManyAndReturn({
                data: { published: false },
            })
        ).toBeRejectedByPolicy(['result is not allowed to be read back']);
        // but the update should have been applied
        await expect(prisma.post.findUnique({ where: { id: 1 } })).resolves.toMatchObject({ published: false });

        // reset
        await prisma.post.update({ where: { id: 1 }, data: { published: true } });

        // return relation
        r = await db.post.updateManyAndReturn({
            include: { user: true },
            data: { title: 'hello2' },
        });
        expect(r[0]).toMatchObject({ user: { id: 1 } });

        // relation filtered
        await prisma.post.create({ data: { id: 3, title: 'hello3', userId: 2, published: true } });
        await expect(
            db.post.updateManyAndReturn({
                where: { id: 3 },
                include: { user: true },
                data: { title: 'hello4' },
            })
        ).toBeRejectedByPolicy(['result is not allowed to be read back']);
        // update is applied
        await expect(prisma.post.findUnique({ where: { id: 3 } })).resolves.toMatchObject({ title: 'hello4' });
    });

    it('field-level policies', async () => {
        const { prisma, enhance } = await loadSchema(
            `
        model Post {
            id Int @id @default(autoincrement())
            title String @allow('read', published)
            published Boolean @default(false)

            @@allow('all', true)
        }
        `
        );

        const db = enhance();

        // update should succeed but one result's title field can't be read back
        await prisma.post.createMany({
            data: [
                { id: 1, title: 'post1', published: true },
                { id: 2, title: 'post2', published: false },
            ],
        });

        const r = await db.post.updateManyAndReturn({
            data: { title: 'foo' },
        });

        expect(r.length).toBe(2);
        expect(r[0].title).toBeTruthy();
        expect(r[1].title).toBeUndefined();

        // check posts are updated
        await expect(prisma.post.findMany({ where: { title: 'foo' } })).resolves.toHaveLength(2);
    });
});
