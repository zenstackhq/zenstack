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

            @@allow('all', true)
        }
        `
        );

        const db = enhance({ id: 'userId-1' });
        // await expect(db.user.create({ data: { id: 'userId-1' } })).toResolveTruthy();
        // await expect(db.post.create({ data: { title: 'abc' } })).resolves.toMatchObject({ authorId: 'userId-1' });

        // check() policies are generated with fake values for now: true for read, false for create
        await expect(db.user.check('read', { where: { title: 'abc' } })).toResolveTruthy();
        await expect(db.user.check('create', { data: { title: 'def' } })).toResolveFalsy();
    });
});
