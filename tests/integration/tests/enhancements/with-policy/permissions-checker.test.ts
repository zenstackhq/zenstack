import { loadSchema } from '@zenstackhq/testtools';
import path from 'path';

describe('With Policy: permissions checker test', () => {
    let origDir: string;

    beforeAll(async () => {
        origDir = path.resolve('.');
    });

    afterEach(() => {
        process.chdir(origDir);
    });

    it('`check` method on enhanced prisma', async () => {
        const { enhance, enhanceRaw, prisma } = await loadSchema(
            `
        model User {
            id String @id
            age Int
            posts Post[]

            // @@allow('all', true)
            @@allow('create,read', age > 18 && age < 60)
            
            @@deny('update', age > 18 && age < 60)
            
            @@deny('delete', true)
            @@allow('delete', true)

        }

        model Post {
            id String @id @default(uuid())
            title String
            rating Int
            author User @relation(fields: [authorId], references: [id])
            authorId String @default("userId-1")

            @@allow('create,read', auth() == author && title == "Title" && rating > 1)
            
            @@deny('update', rating < 10)
            @@allow('update', rating > 5)
            
            @@deny('delete', auth() == null)
        }
        `
        );

        const authDb = enhance({ id: 'userId-1' });
        const db = enhanceRaw(prisma, {});

        // check user
        await expect(db.user.check('read', {})).toResolveTruthy();
        await expect(authDb.user.check('read', {})).toResolveTruthy();
        await expect(authDb.user.check('read', { age: { lt: 10 } })).toResolveFalsy();
        await expect(authDb.user.check('update', {})).toResolveTruthy();
        await expect(authDb.user.check('delete', {})).toResolveFalsy();

        // check post
        await expect(db.post.check('read', {})).toResolveFalsy();
        await expect(authDb.post.check('read', {})).toResolveTruthy();
        await expect(authDb.post.check('read', { author: { id: 'userId-1' } })).toResolveTruthy();
        await expect(authDb.post.check('read', { author: { id: 'invalid' } })).toResolveFalsy();
        await expect(authDb.post.check('read', { authorId: 'userId-1' })).toResolveTruthy();
        await expect(authDb.post.check('read', { authorId: 'invalid' })).toResolveFalsy();
        await expect(authDb.post.check('read', { title: 'Title' })).toResolveTruthy();
        await expect(authDb.post.check('read', { title: 'invalid' })).toResolveFalsy();
        await expect(authDb.post.check('read', { rating: 2 })).toResolveTruthy();
        await expect(authDb.post.check('read', { rating: 0 })).toResolveFalsy();
        await expect(authDb.post.check('read', { rating: { gt: 8 } })).toResolveTruthy();
        await expect(authDb.post.check('read', { rating: { lt: 1 } })).toResolveFalsy();
        await expect(authDb.post.check('create', {})).toResolveTruthy();
        await expect(authDb.post.check('update', {})).toResolveTruthy();
        await expect(authDb.post.check('update', { rating: { lt: 1 } })).toResolveFalsy();
        await expect(authDb.post.check('update', { rating: { gt: 10 } })).toResolveTruthy();
        await expect(authDb.post.check('update', { rating: 8 })).toResolveFalsy();
        await expect(db.post.check('delete', {})).toResolveFalsy();
        await expect(authDb.post.check('delete', {})).toResolveTruthy();
    });
});
