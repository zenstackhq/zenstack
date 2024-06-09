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

    it('policy tests', async () => {
        const { enhance, prisma } = await loadSchema(
            `
model User {
    id Int @id
    email String @unique
    profile Profile?
    posts Post[]

    @@allow('all', true)
}

model Profile {
    id Int @id
    age Int
    user User @relation(fields: [userId], references: [id])
    userId Int @unique
    @@allow('all', auth() == user)
}

model Post {
    id Int @id
    title String
    author User? @relation(fields: [authorId], references: [id])
    authorId Int?
    published Boolean @default(false)
    secret String @default("secret") @allow('read', published == false, true)

    @@allow('read', published)
}`
        );

        await prisma.user.create({
            data: {
                id: 1,
                email: 'a@test.com',
                profile: {
                    create: { id: 1, age: 18 },
                },
                posts: {
                    create: [
                        { id: 1, title: 'post1', published: true },
                        { id: 2, title: 'post2', published: true },
                        { id: 3, title: 'post3', published: false },
                    ],
                },
            },
        });

        await prisma.user.create({
            data: {
                id: 2,
                email: 'b@test.com',
                posts: {
                    create: [{ id: 4, title: 'post4' }],
                },
            },
        });

        const db1 = enhance({ id: 1 });
        const db2 = enhance({ id: 2 });

        // check policies
        await expect(db1.user.findUnique({ where: { id: 1 } }).posts()).resolves.toHaveLength(2);
        await expect(db2.user.findUnique({ where: { id: 2 } }).posts()).resolves.toHaveLength(0);
        await expect(
            db1.user.findUnique({ where: { id: 1 } }).posts({ where: { published: true } })
        ).resolves.toHaveLength(2);
        await expect(db1.user.findUnique({ where: { id: 1 } }).posts({ take: 1 })).resolves.toHaveLength(1);

        // field-level policies
        let p = (
            await db1.user
                .findUnique({ where: { id: 1 } })
                .posts({ where: { published: true }, select: { secret: true } })
        )[0];
        expect(p.secret).toBeUndefined();
        p = (
            await db1.user
                .findUnique({ where: { id: 1 } })
                .posts({ where: { published: false }, select: { secret: true } })
        )[0];
        expect(p.secret).toBeTruthy();

        // to-one optional
        await expect(db1.post.findFirst({ where: { id: 1 } }).author()).resolves.toMatchObject({
            id: 1,
            email: 'a@test.com',
        });
        await expect(db1.post.findFirst({ where: { id: 1 } }).author({ where: { id: 1 } })).resolves.toMatchObject({
            id: 1,
            email: 'a@test.com',
        });
        await expect(db1.post.findFirst({ where: { id: 1 } }).author({ where: { id: 2 } })).toResolveNull();

        // to-one required
        await expect(db1.profile.findUnique({ where: { userId: 1 } }).user()).resolves.toMatchObject({
            id: 1,
            email: 'a@test.com',
        });
        // not found
        await expect(db1.profile.findUnique({ where: { userId: 2 } }).user()).toResolveNull();
        // not readable
        await expect(db2.profile.findUnique({ where: { userId: 1 } }).user()).toResolveNull();

        // unresolved promise
        db1.user.findUniqueOrThrow({ where: { id: 5 } });
        db1.user.findUniqueOrThrow({ where: { id: 5 } }).posts();

        // not-found
        await expect(db1.user.findUniqueOrThrow({ where: { id: 5 } }).posts()).toBeNotFound();
        await expect(db1.user.findFirstOrThrow({ where: { id: 5 } }).posts()).toBeNotFound();
        await expect(db1.post.findUniqueOrThrow({ where: { id: 5 } }).author()).toBeNotFound();
        await expect(db1.post.findFirstOrThrow({ where: { id: 5 } }).author()).toBeNotFound();

        // chaining
        await expect(
            db1.post
                .findFirst({ where: { id: 1 } })
                .author()
                .posts()
        ).resolves.toHaveLength(2);
        await expect(
            db1.post
                .findFirst({ where: { id: 1 } })
                .author()
                .posts({ where: { published: true } })
        ).resolves.toHaveLength(2);

        // chaining broken
        expect((db1.post.findMany() as any).author).toBeUndefined();
        expect(
            db1.post
                .findFirst({ where: { id: 1 } })
                .author()
                .posts().author
        ).toBeUndefined();
    });

    it('non-policy tests', async () => {
        const { enhance, prisma } = await loadSchema(
            `
model User {
    id Int @id
    email String @unique
    password String? @omit
    profile Profile?
    posts Post[]
}

model Profile {
    id Int @id
    age Int
    user User @relation(fields: [userId], references: [id])
    userId Int @unique
}

model Post {
    id Int @id
    title String
    author User? @relation(fields: [authorId], references: [id])
    authorId Int?
    published Boolean @default(false)
}`,
            { enhancements: ['omit'] }
        );

        await prisma.user.create({
            data: {
                id: 1,
                email: 'a@test.com',
                profile: {
                    create: { id: 1, age: 18 },
                },
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

        const db = enhance();

        // check policies
        await expect(db.user.findUnique({ where: { id: 1 } }).posts()).resolves.toHaveLength(2);
        await expect(
            db.user.findUnique({ where: { id: 1 } }).posts({ where: { published: true } })
        ).resolves.toHaveLength(1);
        await expect(db.user.findUnique({ where: { id: 1 } }).posts({ take: 1 })).resolves.toHaveLength(1);

        // to-one optional
        await expect(db.post.findFirst({ where: { id: 1 } }).author()).resolves.toMatchObject({
            id: 1,
            email: 'a@test.com',
        });
        await expect(db.post.findFirst({ where: { id: 1 } }).author({ where: { id: 1 } })).resolves.toMatchObject({
            id: 1,
            email: 'a@test.com',
        });
        await expect(db.post.findFirst({ where: { id: 1 } }).author({ where: { id: 2 } })).toResolveNull();

        // to-one required
        await expect(db.profile.findUnique({ where: { userId: 1 } }).user()).resolves.toMatchObject({
            id: 1,
            email: 'a@test.com',
        });
        // not found
        await expect(db.profile.findUnique({ where: { userId: 2 } }).user()).toResolveNull();

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
        await expect(
            db.post
                .findFirst({ where: { id: 1 } })
                .author()
                .posts({ where: { published: true } })
        ).resolves.toHaveLength(1);

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
