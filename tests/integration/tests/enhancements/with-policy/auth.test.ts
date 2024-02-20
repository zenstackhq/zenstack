import { loadSchema } from '@zenstackhq/testtools';
import path from 'path';

describe('With Policy: auth() test', () => {
    let origDir: string;

    beforeAll(async () => {
        origDir = path.resolve('.');
    });

    afterEach(() => {
        process.chdir(origDir);
    });

    it('undefined user with string id simple', async () => {
        const { enhance } = await loadSchema(
            `
        model User {
            id String @id @default(uuid())
        }

        model Post {
            id String @id @default(uuid())
            title String

            @@allow('read', true)
            @@allow('create', auth() != null)
        }
        `
        );

        const db = enhance();
        await expect(db.post.create({ data: { title: 'abc' } })).toBeRejectedByPolicy();

        const authDb = enhance({ id: 'user1' });
        await expect(authDb.post.create({ data: { title: 'abc' } })).toResolveTruthy();
    });

    it('undefined user with string id more', async () => {
        const { enhance } = await loadSchema(
            `
        model User {
            id String @id @default(uuid())
        }

        model Post {
            id String @id @default(uuid())
            title String

            @@allow('read', true)
            @@allow('create', auth().id != null)
        }
        `
        );

        const db = enhance();
        await expect(db.post.create({ data: { title: 'abc' } })).toBeRejectedByPolicy();

        const authDb = enhance({ id: 'user1' });
        await expect(authDb.post.create({ data: { title: 'abc' } })).toResolveTruthy();
    });

    it('undefined user with int id', async () => {
        const { enhance } = await loadSchema(
            `
        model User {
            id Int @id @default(autoincrement())
        }

        model Post {
            id String @id @default(uuid())
            title String

            @@allow('read', true)
            @@allow('create', auth() != null)
        }
        `
        );

        const db = enhance();
        await expect(db.post.create({ data: { title: 'abc' } })).toBeRejectedByPolicy();

        const authDb = enhance({ id: 'user1' });
        await expect(authDb.post.create({ data: { title: 'abc' } })).toResolveTruthy();
    });

    it('undefined user compared with field', async () => {
        const { enhance } = await loadSchema(
            `
        model User {
            id String @id @default(uuid())
            posts Post[]

            @@allow('all', true)
        }

        model Post {
            id String @id @default(uuid())
            title String
            author User @relation(fields: [authorId], references: [id])
            authorId String

            @@allow('create,read', true)
            @@allow('update', auth() == author)
        }
        `
        );

        const db = enhance();
        await expect(db.user.create({ data: { id: 'user1' } })).toResolveTruthy();
        await expect(db.post.create({ data: { id: '1', title: 'abc', authorId: 'user1' } })).toResolveTruthy();

        const authDb = enhance();
        await expect(authDb.post.update({ where: { id: '1' }, data: { title: 'bcd' } })).toBeRejectedByPolicy();

        expect(() => enhance({ id: null })).toThrow(/Invalid user context/);

        const authDb2 = enhance({ id: 'user1' });
        await expect(authDb2.post.update({ where: { id: '1' }, data: { title: 'bcd' } })).toResolveTruthy();
    });

    it('undefined user compared with field more', async () => {
        const { enhance } = await loadSchema(
            `
        model User {
            id String @id @default(uuid())
            posts Post[]

            @@allow('all', true)
        }

        model Post {
            id String @id @default(uuid())
            title String
            author User @relation(fields: [authorId], references: [id])
            authorId String

            @@allow('create,read', true)
            @@allow('update', auth().id == author.id)
        }
        `
        );

        const db = enhance();
        await expect(db.user.create({ data: { id: 'user1' } })).toResolveTruthy();
        await expect(db.post.create({ data: { id: '1', title: 'abc', authorId: 'user1' } })).toResolveTruthy();

        await expect(db.post.update({ where: { id: '1' }, data: { title: 'bcd' } })).toBeRejectedByPolicy();

        const authDb2 = enhance({ id: 'user1' });
        await expect(authDb2.post.update({ where: { id: '1' }, data: { title: 'bcd' } })).toResolveTruthy();
    });

    it('undefined user non-id field', async () => {
        const { enhance } = await loadSchema(
            `
        model User {
            id String @id @default(uuid())
            posts Post[]
            role String

            @@allow('all', true)
        }

        model Post {
            id String @id @default(uuid())
            title String
            author User @relation(fields: [authorId], references: [id])
            authorId String

            @@allow('create,read', true)
            @@allow('update', auth().role == 'ADMIN')
        }
        `
        );

        const db = enhance();
        await expect(db.user.create({ data: { id: 'user1', role: 'USER' } })).toResolveTruthy();
        await expect(db.post.create({ data: { id: '1', title: 'abc', authorId: 'user1' } })).toResolveTruthy();
        await expect(db.post.update({ where: { id: '1' }, data: { title: 'bcd' } })).toBeRejectedByPolicy();

        const authDb = enhance({ id: 'user1', role: 'USER' });
        await expect(authDb.post.update({ where: { id: '1' }, data: { title: 'bcd' } })).toBeRejectedByPolicy();

        const authDb1 = enhance({ id: 'user2', role: 'ADMIN' });
        await expect(authDb1.post.update({ where: { id: '1' }, data: { title: 'bcd' } })).toResolveTruthy();
    });

    it('non User auth model', async () => {
        const { enhance } = await loadSchema(
            `
        model Foo {
            id String @id @default(uuid())
            role String

            @@auth()
        }

        model Post {
            id String @id @default(uuid())
            title String

            @@allow('read', true)
            @@allow('create', auth().role == 'ADMIN')
        }
        `
        );

        const userDb = enhance({ id: 'user1', role: 'USER' });
        await expect(userDb.post.create({ data: { title: 'abc' } })).toBeRejectedByPolicy();

        const adminDb = enhance({ id: 'user1', role: 'ADMIN' });
        await expect(adminDb.post.create({ data: { title: 'abc' } })).toResolveTruthy();
    });

    it('User model ignored', async () => {
        const { enhance } = await loadSchema(
            `
        model User {
            id String @id @default(uuid())
            role String

            @@ignore
        }

        model Post {
            id String @id @default(uuid())
            title String

            @@allow('read', true)
            @@allow('create', auth().role == 'ADMIN')
        }
        `
        );

        const userDb = enhance({ id: 'user1', role: 'USER' });
        await expect(userDb.post.create({ data: { title: 'abc' } })).toBeRejectedByPolicy();

        const adminDb = enhance({ id: 'user1', role: 'ADMIN' });
        await expect(adminDb.post.create({ data: { title: 'abc' } })).toResolveTruthy();
    });

    it('Auth model ignored', async () => {
        const { enhance } = await loadSchema(
            `
        model Foo {
            id String @id @default(uuid())
            role String

            @@auth()
            @@ignore
        }

        model Post {
            id String @id @default(uuid())
            title String

            @@allow('read', true)
            @@allow('create', auth().role == 'ADMIN')
        }
        `
        );

        const userDb = enhance({ id: 'user1', role: 'USER' });
        await expect(userDb.post.create({ data: { title: 'abc' } })).toBeRejectedByPolicy();

        const adminDb = enhance({ id: 'user1', role: 'ADMIN' });
        await expect(adminDb.post.create({ data: { title: 'abc' } })).toResolveTruthy();
    });

    it('collection predicate', async () => {
        const { enhance, prisma } = await loadSchema(
            `
        model User {
            id String @id @default(uuid())
            posts Post[]

            @@allow('all', true)
        }

        model Post {
            id String @id @default(uuid())
            title String
            published Boolean @default(false)
            author User @relation(fields: [authorId], references: [id])
            authorId String
            comments Comment[]

            @@allow('read', true)
            @@allow('create', auth().posts?[published && comments![published]])
        }

        model Comment {
            id String @id @default(uuid())
            published Boolean @default(false)
            post Post @relation(fields: [postId], references: [id])
            postId String

            @@allow('all', true)
        }
        `
        );

        const user = await prisma.user.create({ data: {} });

        const createPayload = {
            data: { title: 'Post 1', author: { connect: { id: user.id } } },
        };

        // no post
        await expect(enhance({ id: '1' }).post.create(createPayload)).toBeRejectedByPolicy();

        // post not published
        await expect(
            enhance({ id: '1', posts: [{ id: '1', published: false }] }).post.create(createPayload)
        ).toBeRejectedByPolicy();

        // no comments
        await expect(
            enhance({ id: '1', posts: [{ id: '1', published: true }] }).post.create(createPayload)
        ).toBeRejectedByPolicy();

        // not all comments published
        await expect(
            enhance({
                id: '1',
                posts: [
                    {
                        id: '1',
                        published: true,
                        comments: [
                            { id: '1', published: true },
                            { id: '2', published: false },
                        ],
                    },
                ],
            }).post.create(createPayload)
        ).toBeRejectedByPolicy();

        // comments published but parent post is not
        await expect(
            enhance({
                id: '1',
                posts: [
                    { id: '1', published: false, comments: [{ id: '1', published: true }] },
                    { id: '2', published: true },
                ],
            }).post.create(createPayload)
        ).toBeRejectedByPolicy();

        await expect(
            enhance({
                id: '1',
                posts: [
                    { id: '1', published: true, comments: [{ id: '1', published: true }] },
                    { id: '2', published: false },
                ],
            }).post.create(createPayload)
        ).toResolveTruthy();

        // no comments ("every" evaluates to tru in this case)
        await expect(
            enhance({ id: '1', posts: [{ id: '1', published: true, comments: [] }] }).post.create(createPayload)
        ).toResolveTruthy();
    });

    it('Default auth() on literal fields', async () => {
        const { enhance } = await loadSchema(
            `
        model User {
            id String @id
            name String
            score Int

        }

        model Post {
            id String @id @default(uuid())
            title String
            score Int? @default(auth().score)
            authorName String? @default(auth().name)

            @@allow('all', true)
        }
        `
        );

        const userDb = enhance({ id: '1', name: 'user1', score: 10 });
        await expect(userDb.post.create({ data: { title: 'abc' } })).toResolveTruthy();
        await expect(userDb.post.findMany()).resolves.toHaveLength(1);
        await expect(userDb.post.count({ where: { authorName: 'user1', score: 10 } })).resolves.toBe(1);
    });

    it('Default auth() data should not override passed args', async () => {
        const { enhance } = await loadSchema(
            `
        model User {
            id String @id
            name String

        }

        model Post {
            id String @id @default(uuid())
            authorName String? @default(auth().name)

            @@allow('all', true)
        }
        `
        );

        const userContextName = 'user1';
        const overrideName = 'no-default-auth-name';
        const userDb = enhance({ id: '1', name: userContextName });
        await expect(userDb.post.create({ data: { authorName: overrideName } })).toResolveTruthy();
        await expect(userDb.post.count({ where: { authorName: overrideName } })).resolves.toBe(1);
    });

    it('Default auth() with foreign key', async () => {
        const { enhance, modelMeta } = await loadSchema(
            `
        model User {
            id String @id
            posts Post[]

            @@allow('all', true)

        }

        model Post {
            id String @id @default(uuid())
            title String
            author User @relation(fields: [authorId], references: [id])
            authorId String @default(auth().id)

            @@allow('all', true)
        }
        `
        );

        const db = enhance({ id: 'userId-1' });
        await expect(db.user.create({ data: { id: 'userId-1' } })).toResolveTruthy();
        await expect(db.post.create({ data: { title: 'abc' } })).resolves.toMatchObject({ authorId: 'userId-1' });
    });

    it('Default auth() with nested user context value', async () => {
        const { enhance } = await loadSchema(
            `
        model User {
            id String @id
            profile Profile?
            posts Post[]

            @@allow('all', true)
        }

        model Profile {
            id String @id @default(uuid())
            image Image?
            user User @relation(fields: [userId], references: [id])
            userId String @unique
        }

        model Image {
            id String @id @default(uuid())
            url String
            profile Profile @relation(fields: [profileId], references: [id])
            profileId String @unique
        }

        model Post {
            id String @id @default(uuid())
            title String
            defaultImageUrl String @default(auth().profile.image.url)
            author User @relation(fields: [authorId], references: [id])
            authorId String

            @@allow('all', true)
        }
        `
        );
        const url = 'https://zenstack.dev';
        const db = enhance({ id: 'userId-1', profile: { image: { url } } });

        // top-level create
        await expect(db.user.create({ data: { id: 'userId-1' } })).toResolveTruthy();
        await expect(
            db.post.create({ data: { title: 'abc', author: { connect: { id: 'userId-1' } } } })
        ).resolves.toMatchObject({ defaultImageUrl: url });

        // nested create
        let result = await db.user.create({
            data: {
                id: 'userId-2',
                posts: {
                    create: [{ title: 'p1' }, { title: 'p2' }],
                },
            },
            include: { posts: true },
        });
        expect(result.posts).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ title: 'p1', defaultImageUrl: url }),
                expect.objectContaining({ title: 'p2', defaultImageUrl: url }),
            ])
        );
    });

    it('Default auth() without user context', async () => {
        const { enhance } = await loadSchema(
            `
        model User {
            id String @id
            posts Post[]

            @@allow('all', true)
        }

        model Post {
            id String @id @default(uuid())
            title String
            author User @relation(fields: [authorId], references: [id])
            authorId String @default(auth().id)

            @@allow('all', auth().id != null)
        }
        `
        );

        const db = enhance();
        await expect(db.user.create({ data: { id: 'userId-1' } })).toResolveTruthy();
        await expect(db.post.create({ data: { title: 'title' } })).rejects.toThrow(
            'Using `auth()` in `@default` requires a user context'
        );
        await expect(db.post.findMany({})).toResolveTruthy();
    });
});
