import { loadSchema } from '@zenstackhq/testtools';
import path from 'path';

describe('GitHub issues regression', () => {
    let origDir: string;

    beforeAll(async () => {
        origDir = path.resolve('.');
    });

    afterEach(() => {
        process.chdir(origDir);
    });

    it('issue 386', async () => {
        const { withPolicy } = await loadSchema(
            `
        model User {
            id String @id @unique @default(uuid())
            posts Post[]

            @@allow('all', true)
        }
            
        model Post {
            id String @id @default(uuid())
            title String
            published Boolean @default(false)
            author User @relation(fields: [authorId], references: [id])
            authorId String
        
            @@allow('all', contains(title, 'Post'))
        }      
        `
        );

        const db = withPolicy();
        const created = await db.user.create({
            data: {
                posts: {
                    create: {
                        title: 'Post 1',
                    },
                },
            },
            include: {
                posts: true,
            },
        });
        expect(created.posts[0].zenstack_guard).toBeUndefined();
        expect(created.posts[0].zenstack_transaction).toBeUndefined();

        const queried = await db.user.findFirst({ include: { posts: true } });
        expect(queried.posts[0].zenstack_guard).toBeUndefined();
        expect(queried.posts[0].zenstack_transaction).toBeUndefined();
    });

    it('issue 389', async () => {
        const { withPolicy } = await loadSchema(`
        model model {
            id String @id @default(uuid())
            value Int
            @@allow('read', true)
            @@allow('create', value > 0)
        }
        `);
        const db = withPolicy();
        await expect(db.model.create({ data: { value: 0 } })).toBeRejectedByPolicy();
        await expect(db.model.create({ data: { value: 1 } })).toResolveTruthy();
    });
});
