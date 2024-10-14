import { loadSchema } from '@zenstackhq/testtools';

describe('Filter Function Coverage Tests', () => {
    it('contains case-sensitive field', async () => {
        const { enhance } = await loadSchema(
            `
            model Foo {
                id String @id @default(cuid())
                string String
                @@allow('all', contains(string, 'a'))
            }
            `
        );

        await expect(enhance().foo.create({ data: { string: 'bcd' } })).toBeRejectedByPolicy();
        await expect(enhance().foo.create({ data: { string: 'bac' } })).toResolveTruthy();
    });

    it('contains case-sensitive non-field', async () => {
        const { enhance } = await loadSchema(
            `
            model User {
                id String @id
                name String
            }

            model Foo {
                id String @id @default(cuid())
                @@allow('all', contains(auth().name, 'a'))
            }
            `
        );

        await expect(enhance().foo.create({ data: {} })).toBeRejectedByPolicy();
        await expect(enhance({ id: 'user1', name: 'bcd' }).foo.create({ data: {} })).toBeRejectedByPolicy();
        await expect(enhance({ id: 'user1', name: 'bac' }).foo.create({ data: {} })).toResolveTruthy();
    });

    it('contains with auth()', async () => {
        const { enhance } = await loadSchema(
            `
            model User {
                id String @id
                name String
            }

            model Foo {
                id String @id @default(cuid())
                string String
                @@allow('all', contains(string, auth().name))
            }
            `
        );

        await expect(enhance().foo.create({ data: { string: 'abc' } })).toBeRejectedByPolicy();
        const db = enhance({ id: '1', name: 'a' });
        await expect(db.foo.create({ data: { string: 'bcd' } })).toBeRejectedByPolicy();
        await expect(db.foo.create({ data: { string: 'bac' } })).toResolveTruthy();
    });

    it('startsWith field', async () => {
        const { enhance } = await loadSchema(
            `
            model Foo {
                id String @id @default(cuid())
                string String
                @@allow('all', startsWith(string, 'a'))
            }
            `
        );

        await expect(enhance().foo.create({ data: { string: 'bac' } })).toBeRejectedByPolicy();
        await expect(enhance().foo.create({ data: { string: 'abc' } })).toResolveTruthy();
    });

    it('startsWith non-field', async () => {
        const { enhance } = await loadSchema(
            `
            model User {
                id String @id
                name String
            }

            model Foo {
                id String @id @default(cuid())
                @@allow('all', startsWith(auth().name, 'a'))
            }
            `
        );

        await expect(enhance().foo.create({ data: {} })).toBeRejectedByPolicy();
        await expect(enhance({ id: 'user1', name: 'bac' }).foo.create({ data: {} })).toBeRejectedByPolicy();
        await expect(enhance({ id: 'user1', name: 'abc' }).foo.create({ data: {} })).toResolveTruthy();
    });

    it('endsWith field', async () => {
        const { enhance } = await loadSchema(
            `
            model Foo {
                id String @id @default(cuid())
                string String
                @@allow('all', endsWith(string, 'a'))
            }
            `
        );

        await expect(enhance().foo.create({ data: { string: 'bac' } })).toBeRejectedByPolicy();
        await expect(enhance().foo.create({ data: { string: 'bca' } })).toResolveTruthy();
    });

    it('endsWith non-field', async () => {
        const { enhance } = await loadSchema(
            `
            model User {
                id String @id
                name String
            }

            model Foo {
                id String @id @default(cuid())
                @@allow('all', endsWith(auth().name, 'a'))
            }
            `
        );

        await expect(enhance().foo.create({ data: {} })).toBeRejectedByPolicy();
        await expect(enhance({ id: 'user1', name: 'bac' }).foo.create({ data: {} })).toBeRejectedByPolicy();
        await expect(enhance({ id: 'user1', name: 'bca' }).foo.create({ data: {} })).toResolveTruthy();
    });

    it('in left field', async () => {
        const { enhance } = await loadSchema(
            `
            model Foo {
                id String @id @default(cuid())
                string String
                @@allow('all', string in ['a', 'b'])
            }
            `
        );

        await expect(enhance().foo.create({ data: { string: 'c' } })).toBeRejectedByPolicy();
        await expect(enhance().foo.create({ data: { string: 'b' } })).toResolveTruthy();
    });

    it('in non-field', async () => {
        const { enhance } = await loadSchema(
            `
            model User {
                id String @id
                name String
            }

            model Foo {
                id String @id @default(cuid())
                @@allow('all', auth().name in ['abc', 'bcd'])
            }
            `
        );

        await expect(enhance().foo.create({ data: {} })).toBeRejectedByPolicy();
        await expect(enhance({ id: 'user1', name: 'abd' }).foo.create({ data: {} })).toBeRejectedByPolicy();
        await expect(enhance({ id: 'user1', name: 'abc' }).foo.create({ data: {} })).toResolveTruthy();
    });
});
