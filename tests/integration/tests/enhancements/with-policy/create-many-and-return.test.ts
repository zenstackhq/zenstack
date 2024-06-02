import { loadSchema } from '@zenstackhq/testtools';

describe('Test API createManyAndReturn', () => {
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
            @@allow('create', contains(title, 'hello'))
        }
        `
        );

        await prisma.user.createMany({
            data: [
                { id: 1, level: 1 },
                { id: 2, level: 0 },
            ],
        });

        const db = enhance();

        // create rule violation
        await expect(
            db.post.createManyAndReturn({
                data: [{ title: 'foo', userId: 1 }],
            })
        ).toBeRejectedByPolicy();

        // success
        let r = await db.post.createManyAndReturn({
            data: [{ id: 1, title: 'hello1', userId: 1, published: true }],
        });
        expect(r.length).toBe(1);

        // read-back check
        await expect(
            db.post.createManyAndReturn({
                data: [
                    { id: 2, title: 'hello2', userId: 1, published: true },
                    { id: 3, title: 'hello3', userId: 1, published: false },
                ],
            })
        ).toBeRejectedByPolicy(['result is not allowed to be read back']);
        await expect(prisma.post.findMany()).resolves.toHaveLength(3);

        // return relation
        await prisma.post.deleteMany();
        r = await db.post.createManyAndReturn({
            include: { user: true },
            data: [{ id: 1, title: 'hello1', userId: 1, published: true }],
        });
        expect(r[0]).toMatchObject({ user: { id: 1 } });

        // relation filtered
        await prisma.post.deleteMany();
        await expect(
            db.post.createManyAndReturn({
                include: { user: true },
                data: [{ id: 1, title: 'hello1', userId: 2, published: true }],
            })
        ).toBeRejectedByPolicy(['result is not allowed to be read back']);
        await expect(prisma.post.findMany()).resolves.toHaveLength(1);
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

        const r = await db.post.createManyAndReturn({
            data: [
                { title: 'post1', published: true },
                { title: 'post2', published: false },
            ],
        });
        expect(r).toHaveLength(2);
        expect(r[0].title).toBe('post1');
        expect(r[1].title).toBeUndefined();
    });
});
