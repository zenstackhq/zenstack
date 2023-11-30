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
        const { withPolicy } = await loadSchema(
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

        const db = withPolicy();
        await expect(db.post.create({ data: { title: 'abc' } })).toBeRejectedByPolicy();

        const authDb = withPolicy({ id: 'user1' });
        await expect(authDb.post.create({ data: { title: 'abc' } })).toResolveTruthy();
    });

    it('undefined user with string id more', async () => {
        const { withPolicy } = await loadSchema(
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

        const db = withPolicy();
        await expect(db.post.create({ data: { title: 'abc' } })).toBeRejectedByPolicy();

        const authDb = withPolicy({ id: 'user1' });
        await expect(authDb.post.create({ data: { title: 'abc' } })).toResolveTruthy();
    });

    it('undefined user with int id', async () => {
        const { withPolicy } = await loadSchema(
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

        const db = withPolicy();
        await expect(db.post.create({ data: { title: 'abc' } })).toBeRejectedByPolicy();

        const authDb = withPolicy({ id: 'user1' });
        await expect(authDb.post.create({ data: { title: 'abc' } })).toResolveTruthy();
    });

    it('undefined user compared with field', async () => {
        const { withPolicy } = await loadSchema(
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

        const db = withPolicy();
        await expect(db.user.create({ data: { id: 'user1' } })).toResolveTruthy();
        await expect(db.post.create({ data: { id: '1', title: 'abc', authorId: 'user1' } })).toResolveTruthy();

        const authDb = withPolicy();
        await expect(authDb.post.update({ where: { id: '1' }, data: { title: 'bcd' } })).toBeRejectedByPolicy();

        expect(() => withPolicy({ id: null })).toThrow(/Invalid user context/);

        const authDb2 = withPolicy({ id: 'user1' });
        await expect(authDb2.post.update({ where: { id: '1' }, data: { title: 'bcd' } })).toResolveTruthy();
    });

    it('undefined user compared with field more', async () => {
        const { withPolicy } = await loadSchema(
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

        const db = withPolicy();
        await expect(db.user.create({ data: { id: 'user1' } })).toResolveTruthy();
        await expect(db.post.create({ data: { id: '1', title: 'abc', authorId: 'user1' } })).toResolveTruthy();

        await expect(db.post.update({ where: { id: '1' }, data: { title: 'bcd' } })).toBeRejectedByPolicy();

        const authDb2 = withPolicy({ id: 'user1' });
        await expect(authDb2.post.update({ where: { id: '1' }, data: { title: 'bcd' } })).toResolveTruthy();
    });

    it('undefined user non-id field', async () => {
        const { withPolicy } = await loadSchema(
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

        const db = withPolicy();
        await expect(db.user.create({ data: { id: 'user1', role: 'USER' } })).toResolveTruthy();
        await expect(db.post.create({ data: { id: '1', title: 'abc', authorId: 'user1' } })).toResolveTruthy();
        await expect(db.post.update({ where: { id: '1' }, data: { title: 'bcd' } })).toBeRejectedByPolicy();

        const authDb = withPolicy({ id: 'user1', role: 'USER' });
        await expect(authDb.post.update({ where: { id: '1' }, data: { title: 'bcd' } })).toBeRejectedByPolicy();

        const authDb1 = withPolicy({ id: 'user2', role: 'ADMIN' });
        await expect(authDb1.post.update({ where: { id: '1' }, data: { title: 'bcd' } })).toResolveTruthy();
    });

    it('non User auth model', async () => {
        const { withPolicy } = await loadSchema(
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

        const userDb = withPolicy({ id: 'user1', role: 'USER' });
        await expect(userDb.post.create({ data: { title: 'abc' } })).toBeRejectedByPolicy();

        const adminDb = withPolicy({ id: 'user1', role: 'ADMIN' });
        await expect(adminDb.post.create({ data: { title: 'abc' } })).toResolveTruthy();
    });

    it('User model ignored', async () => {
        const { withPolicy } = await loadSchema(
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

        const userDb = withPolicy({ id: 'user1', role: 'USER' });
        await expect(userDb.post.create({ data: { title: 'abc' } })).toBeRejectedByPolicy();

        const adminDb = withPolicy({ id: 'user1', role: 'ADMIN' });
        await expect(adminDb.post.create({ data: { title: 'abc' } })).toResolveTruthy();
    });

    it('Auth model ignored', async () => {
        const { withPolicy } = await loadSchema(
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

        const userDb = withPolicy({ id: 'user1', role: 'USER' });
        await expect(userDb.post.create({ data: { title: 'abc' } })).toBeRejectedByPolicy();

        const adminDb = withPolicy({ id: 'user1', role: 'ADMIN' });
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
});
