import { PrismaClientValidationError } from '@prisma/client/runtime';
import path from 'path';
import { MODEL_PRELUDE, loadPrisma } from '../../utils';

describe('With Policy:undefined user', () => {
    let origDir: string;
    const suite = 'undefined-user';

    beforeAll(async () => {
        origDir = path.resolve('.');
    });

    afterEach(() => {
        process.chdir(origDir);
    });

    it('undefined user with string id', async () => {
        const { withPolicy } = await loadPrisma(
            `${suite}/undefined user with string id`,
            `
        ${MODEL_PRELUDE}

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
        const { withPolicy } = await loadPrisma(
            `${suite}/undefined user with string id more`,
            `
        ${MODEL_PRELUDE}

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
        const { withPolicy } = await loadPrisma(
            `${suite}/undefined user with int id`,
            `
        ${MODEL_PRELUDE}

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
        const { withPolicy } = await loadPrisma(
            `${suite}/undefined user compared with field`,
            `
        ${MODEL_PRELUDE}

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

        const authDb1 = withPolicy({ id: null });
        await expect(authDb1.post.update({ where: { id: '1' }, data: { title: 'bcd' } })).rejects.toThrow();

        const authDb2 = withPolicy({ id: 'user1' });
        await expect(authDb2.post.update({ where: { id: '1' }, data: { title: 'bcd' } })).toResolveTruthy();
    });

    it('undefined user compared with field more', async () => {
        const { withPolicy } = await loadPrisma(
            `${suite}/undefined user compared with field more`,
            `
        ${MODEL_PRELUDE}

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

        const authDb1 = withPolicy({ id: null });
        await expect(authDb1.post.update({ where: { id: '1' }, data: { title: 'bcd' } })).rejects.toThrow();

        const authDb2 = withPolicy({ id: 'user1' });
        await expect(authDb2.post.update({ where: { id: '1' }, data: { title: 'bcd' } })).toResolveTruthy();
    });

    it('undefined user non-id field', async () => {
        const { withPolicy } = await loadPrisma(
            `${suite}/undefined user non-id field`,
            `
        ${MODEL_PRELUDE}

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

        const authDb = withPolicy({ role: 'USER' });
        await expect(db.post.update({ where: { id: '1' }, data: { title: 'bcd' } })).toBeRejectedByPolicy();

        const authDb1 = withPolicy({ role: 'ADMIN' });
        await expect(authDb1.post.update({ where: { id: '1' }, data: { title: 'bcd' } })).toResolveTruthy();
    });
});
