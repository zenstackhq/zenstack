import { loadSchema } from '@zenstackhq/testtools';

describe('Polymorphic @omit', () => {
    const model = `
        model User {
            id Int @id @default(autoincrement())
            assets Asset[]

            @@allow('all', true)
        }
        
        model Asset {
            id Int @id @default(autoincrement())
            type String
            foo String @omit
            user User? @relation(fields: [userId], references: [id])
            userId Int? @unique

            @@delegate(type)
            @@allow('all', true)
        }
        
        model Post extends Asset {
            title String
            bar String @omit
        }
    `;

    it('omits when queried via a concrete model', async () => {
        const { enhance } = await loadSchema(model);

        const db = enhance();
        const post = await db.post.create({ data: { foo: 'foo', bar: 'bar', title: 'Post1' } });
        expect(post.foo).toBeUndefined();
        expect(post.bar).toBeUndefined();

        const foundPost = await db.post.findUnique({ where: { id: post.id } });
        expect(foundPost.foo).toBeUndefined();
        expect(foundPost.bar).toBeUndefined();
    });

    it('omits when queried via a base model', async () => {
        const { enhance } = await loadSchema(model);

        const db = enhance();
        const post = await db.post.create({ data: { foo: 'foo', bar: 'bar', title: 'Post1' } });
        expect(post.foo).toBeUndefined();
        expect(post.bar).toBeUndefined();

        const foundAsset = await db.asset.findUnique({ where: { id: post.id } });
        expect(foundAsset.foo).toBeUndefined();
        expect(foundAsset.bar).toBeUndefined();
        expect(foundAsset.title).toBeTruthy();
    });

    it('omits when discriminator is not selected', async () => {
        const { enhance } = await loadSchema(model);

        const db = enhance();
        const post = await db.post.create({
            data: { foo: 'foo', bar: 'bar', title: 'Post1' },
        });
        expect(post.foo).toBeUndefined();
        expect(post.bar).toBeUndefined();

        const foundAsset = await db.asset.findUnique({
            where: { id: post.id },
            select: { id: true, foo: true },
        });
        console.log(foundAsset);
        expect(foundAsset.foo).toBeUndefined();
        expect(foundAsset.bar).toBeUndefined();
    });

    it('omits when queried in a nested context', async () => {
        const { enhance } = await loadSchema(model);

        const db = enhance();
        const user = await db.user.create({ data: {} });
        const post = await db.post.create({
            data: { foo: 'foo', bar: 'bar', title: 'Post1', user: { connect: { id: user.id } } },
        });
        expect(post.foo).toBeUndefined();
        expect(post.bar).toBeUndefined();

        const foundUser = await db.user.findUnique({ where: { id: user.id }, include: { assets: true } });
        expect(foundUser.assets[0].foo).toBeUndefined();
        expect(foundUser.assets[0].bar).toBeUndefined();
        expect(foundUser.assets[0].title).toBeTruthy();
    });
});
