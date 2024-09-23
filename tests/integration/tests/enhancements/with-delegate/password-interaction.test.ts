import { loadSchema } from '@zenstackhq/testtools';
import { compareSync } from 'bcryptjs';

describe('Polymorphic @omit', () => {
    const model = `
        model User {
            id Int @id @default(autoincrement())
            posts Post[]

            @@allow('all', true)
        }
        
        model Asset {
            id Int @id @default(autoincrement())
            type String
            assetPassword String @password

            @@delegate(type)
            @@allow('all', true)
        }
        
        model Post extends Asset {
            title String
            postPassword String @password
            user User? @relation(fields: [userId], references: [id])
            userId Int? @unique
        }
    `;

    it('hashes when created directly', async () => {
        const { enhance } = await loadSchema(model);

        const db = enhance();
        const post = await db.post.create({ data: { title: 'Post1', assetPassword: 'asset', postPassword: 'post' } });
        expect(compareSync('asset', post.assetPassword)).toBeTruthy();
        expect(compareSync('post', post.postPassword)).toBeTruthy();
    });

    it('hashes when created nested', async () => {
        const { enhance } = await loadSchema(model);

        const db = enhance();
        const user = await db.user.create({
            data: { posts: { create: { title: 'Post1', assetPassword: 'asset', postPassword: 'post' } } },
            include: { posts: true },
        });
        expect(compareSync('asset', user.posts[0].assetPassword)).toBeTruthy();
        expect(compareSync('post', user.posts[0].postPassword)).toBeTruthy();
    });
});
