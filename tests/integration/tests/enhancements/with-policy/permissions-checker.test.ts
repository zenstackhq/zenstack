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
            age Int
            posts Post[]

            // @@allow('all', true)
            @@allow('all', age > 18 || age < 60)

        }

        model Post {
            id String @id @default(uuid())
            title String
            rating Int
            author User @relation(fields: [authorId], references: [id])
            authorId String @default(auth().id)

            @@allow('all', auth() == author)
            @@allow('all', title == "test" && rating > 1 )

        }
        `
        );

        const db = enhance({ id: 'userId-1' });
        // await expect(db.user.create({ data: { id: 'userId-1' } })).toResolveTruthy();
        // await expect(db.post.create({ data: { title: 'abc' } })).resolves.toMatchObject({ authorId: 'userId-1' });

        await expect(db.user.check('read', {})).toResolveTruthy();
        await expect(db.user.check('create', { age: { lt: 10 } })).toResolveFalsy();
    });
});
