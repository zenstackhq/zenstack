import { loadSchema } from '@zenstackhq/testtools';
import path from 'path';

describe('With Policy: fluent API', () => {
    let origDir: string;

    beforeAll(async () => {
        origDir = path.resolve('.');
    });

    afterEach(async () => {
        process.chdir(origDir);
    });

    it('fluent api', async () => {
        const { enhance, prisma } = await loadSchema(
            `
model User {
    id Int @id
    email String @unique
    posts Post[]

    @@allow('all', true)
}

model Post {
    id Int @id
    title String
    author User? @relation(fields: [authorId], references: [id])
    authorId Int?
    published Boolean @default(false)
    secret String @default("secret") @allow('read', published == false)

    @@allow('all', author == auth())
}`
        );

        await prisma.user.create({
            data: {
                id: 1,
                email: 'a@test.com',
                posts: {
                    create: [
                        { id: 1, title: 'post1', published: true },
                        { id: 2, title: 'post2', published: false },
                    ],
                },
            },
        });

        await prisma.user.create({
            data: {
                id: 2,
                email: 'b@test.com',
                posts: {
                    create: [{ id: 3, title: 'post3' }],
                },
            },
        });

        const db = enhance({ id: 1 });

        // check policies
        await expect(db.user.findUnique({ where: { id: 1 } }).posts()).resolves.toHaveLength(2);
        await expect(
            db.user.findUnique({ where: { id: 1 } }).posts({ where: { published: true } })
        ).resolves.toHaveLength(1);
        await expect(db.user.findUnique({ where: { id: 1 } }).posts({ take: 1 })).resolves.toHaveLength(1);

        // field-level policies
        let p = (await db.user.findUnique({ where: { id: 1 } }).posts({ where: { published: true } }))[0];
        expect(p.secret).toBeUndefined();
        p = (await db.user.findUnique({ where: { id: 1 } }).posts({ where: { published: false } }))[0];
        expect(p.secret).toBeTruthy();

        // to-one
        await expect(db.post.findFirst({ where: { id: 1 } }).author()).resolves.toEqual(
            expect.objectContaining({ id: 1, email: 'a@test.com' })
        );

        // not-found
        await expect(db.user.findUniqueOrThrow({ where: { id: 5 } }).posts()).toBeNotFound();
        await expect(db.user.findFirstOrThrow({ where: { id: 5 } }).posts()).toBeNotFound();
        await expect(db.post.findUniqueOrThrow({ where: { id: 5 } }).author()).toBeNotFound();
        await expect(db.post.findFirstOrThrow({ where: { id: 5 } }).author()).toBeNotFound();

        // chaining
        await expect(
            db.post
                .findFirst({ where: { id: 1 } })
                .author()
                .posts()
        ).resolves.toHaveLength(2);

        // chaining broken
        expect((db.post.findMany() as any).author).toBeUndefined();
        expect(
            db.post
                .findFirst({ where: { id: 1 } })
                .author()
                .posts().author
        ).toBeUndefined();
    });
});
