import { loadSchema } from '@zenstackhq/testtools';

describe('Permission checker', () => {
    it('empty rules', async () => {
        const { enhance } = await loadSchema(
            `
            model Model {
                id Int @id @default(autoincrement())
                value Int
            }
            `
        );
        const db = enhance();
        await expect(db.model.check('read')).toResolveFalsy();
        await expect(db.model.check('read', { value: 1 })).toResolveFalsy();
    });

    it('unconditional allow', async () => {
        const { enhance } = await loadSchema(
            `
            model Model {
                id Int @id @default(autoincrement())
                value Int
                @@allow('all', true)
            }
            `
        );
        const db = enhance();
        await expect(db.model.check('read')).toResolveTruthy();
        await expect(db.model.check('read', { value: 0 })).toResolveTruthy();
    });

    it('deny rule', async () => {
        const { enhance } = await loadSchema(
            `
            model Model {
                id Int @id @default(autoincrement())
                value Int
                @@allow('all', value > 0)
                @@deny('all', value == 1)
            }
            `
        );
        const db = enhance();
        await expect(db.model.check('read')).toResolveTruthy();
        await expect(db.model.check('read', { value: 0 })).toResolveFalsy();
        await expect(db.model.check('read', { value: 1 })).toResolveFalsy();
        await expect(db.model.check('read', { value: 2 })).toResolveTruthy();
    });

    it('int field condition', async () => {
        const { enhance } = await loadSchema(
            `
            model Model {
                id Int @id @default(autoincrement())
                value Int
                @@allow('read', value == 1)
                @@allow('create', value != 1)
                @@allow('update', value > 1)
                @@allow('delete', value <= 1)
            }
            `
        );

        const db = enhance();
        await expect(db.model.check('read')).toResolveTruthy();
        await expect(db.model.check('read', { value: 0 })).toResolveFalsy();
        await expect(db.model.check('read', { value: 1 })).toResolveTruthy();

        await expect(db.model.check('create')).toResolveTruthy();
        await expect(db.model.check('create', { value: 0 })).toResolveTruthy();
        await expect(db.model.check('create', { value: 1 })).toResolveFalsy();

        await expect(db.model.check('update')).toResolveTruthy();
        await expect(db.model.check('update', { value: 1 })).toResolveFalsy();
        await expect(db.model.check('update', { value: 2 })).toResolveTruthy();

        await expect(db.model.check('delete')).toResolveTruthy();
        await expect(db.model.check('delete', { value: 0 })).toResolveTruthy();
        await expect(db.model.check('delete', { value: 1 })).toResolveTruthy();
        await expect(db.model.check('delete', { value: 2 })).toResolveFalsy();
    });

    it('boolean field toplevel condition', async () => {
        const { enhance } = await loadSchema(
            `
            model Model {
                id Int @id @default(autoincrement())
                value Boolean
                @@allow('read', value)
            }
            `
        );

        const db = enhance();
        await expect(db.model.check('read')).toResolveTruthy();
        await expect(db.model.check('read', { value: false })).toResolveFalsy();
        await expect(db.model.check('read', { value: true })).toResolveTruthy();
    });

    it('boolean field condition', async () => {
        const { enhance } = await loadSchema(
            `
            model Model {
                id Int @id @default(autoincrement())
                value Boolean
                @@allow('read', value == true)
                @@allow('create', value == false)
                @@allow('update', value != true)
                @@allow('delete', value != false)
            }
            `
        );

        const db = enhance();
        await expect(db.model.check('read')).toResolveTruthy();
        await expect(db.model.check('read', { value: false })).toResolveFalsy();
        await expect(db.model.check('read', { value: true })).toResolveTruthy();

        await expect(db.model.check('create')).toResolveTruthy();
        await expect(db.model.check('create', { value: true })).toResolveFalsy();
        await expect(db.model.check('create', { value: false })).toResolveTruthy();

        await expect(db.model.check('update')).toResolveTruthy();
        await expect(db.model.check('update', { value: true })).toResolveFalsy();
        await expect(db.model.check('update', { value: false })).toResolveTruthy();

        await expect(db.model.check('delete')).toResolveTruthy();
        await expect(db.model.check('delete', { value: false })).toResolveFalsy();
        await expect(db.model.check('delete', { value: true })).toResolveTruthy();
    });

    it('string field condition', async () => {
        const { enhance } = await loadSchema(
            `
            model Model {
                id Int @id @default(autoincrement())
                value String
                @@allow('read', value == 'admin')
            }
            `
        );

        const db = enhance();
        await expect(db.model.check('read')).toResolveTruthy();
        await expect(db.model.check('read', { value: 'user' })).toResolveFalsy();
        await expect(db.model.check('read', { value: 'admin' })).toResolveTruthy();
    });

    it('function noop', async () => {
        const { enhance } = await loadSchema(
            `
            model Model {
                id Int @id @default(autoincrement())
                value String
                @@allow('read', startsWith(value, 'admin'))
                @@allow('update', !startsWith(value, 'admin'))
            }
            `
        );

        const db = enhance();
        await expect(db.model.check('read')).toResolveTruthy();
        await expect(db.model.check('read', { value: 'user' })).toResolveTruthy();
        await expect(db.model.check('read', { value: 'admin' })).toResolveTruthy();
        await expect(db.model.check('update')).toResolveTruthy();
        await expect(db.model.check('update', { value: 'user' })).toResolveTruthy();
        await expect(db.model.check('update', { value: 'admin' })).toResolveTruthy();
    });

    it('relation noop', async () => {
        const { enhance } = await loadSchema(
            `
            model Model {
                id Int @id @default(autoincrement())
                value String
                foo Foo?

                @@allow('read', foo.x > 0)
            }

            model Foo {
                id Int @id @default(autoincrement())
                x Int
                modelId Int @unique
                model Model @relation(fields: [modelId], references: [id])
            }
            `
        );

        const db = enhance();
        await expect(db.model.check('read')).toResolveTruthy();
        await expect(db.model.check('read', { foo: { x: 0 } })).rejects.toThrow('Providing filter for field "foo"');
    });

    it('collection predicate noop', async () => {
        const { enhance } = await loadSchema(
            `
            model Model {
                id Int @id @default(autoincrement())
                value String
                foo Foo[]

                @@allow('read', foo?[x > 0])
            }

            model Foo {
                id Int @id @default(autoincrement())
                x Int
                modelId Int
                model Model @relation(fields: [modelId], references: [id])
            }
            `
        );

        const db = enhance();
        await expect(db.model.check('read')).toResolveTruthy();
        await expect(db.model.check('read', { foo: [{ x: 0 }] })).rejects.toThrow('Providing filter for field "foo"');
    });

    it('field complex condition', async () => {
        const { enhance } = await loadSchema(
            `
            model Model {
                id Int @id @default(autoincrement())
                x Int
                y Int
                @@allow('read', x > 0 && x > y)
                @@allow('create', x > 1 || x > y)
                @@allow('update', !(x >= y))
            }
            `
        );

        const db = enhance();
        await expect(db.model.check('read')).toResolveTruthy();
        await expect(db.model.check('read', { x: 0 })).toResolveFalsy();
        await expect(db.model.check('read', { x: 1 })).toResolveTruthy();
        await expect(db.model.check('read', { x: 1, y: 0 })).toResolveTruthy();
        await expect(db.model.check('read', { x: 1, y: 1 })).toResolveFalsy();

        await expect(db.model.check('create')).toResolveTruthy();
        await expect(db.model.check('create', { x: 0 })).toResolveFalsy(); // numbers are non-negative
        await expect(db.model.check('create', { x: 1 })).toResolveTruthy();
        await expect(db.model.check('create', { x: 1, y: 0 })).toResolveTruthy();
        await expect(db.model.check('create', { x: 1, y: 1 })).toResolveFalsy();

        await expect(db.model.check('update')).toResolveTruthy();
        await expect(db.model.check('update', { x: 0 })).toResolveTruthy();
        await expect(db.model.check('update', { y: 0 })).toResolveFalsy(); // numbers are non-negative
        await expect(db.model.check('update', { x: 1, y: 1 })).toResolveFalsy();
    });

    it('field condition unsolvable', async () => {
        const { enhance } = await loadSchema(
            `
            model Model {
                id Int @id @default(autoincrement())
                x Int
                y Int
                @@allow('read', x > 0 && x < y && y <= 1)
            }
            `
        );

        const db = enhance();
        await expect(db.model.check('read')).toResolveFalsy();
        await expect(db.model.check('read', { x: 0 })).toResolveFalsy();
        await expect(db.model.check('read', { x: 1 })).toResolveFalsy();
        await expect(db.model.check('read', { x: 1, y: 2 })).toResolveFalsy();
        await expect(db.model.check('read', { x: 1, y: 1 })).toResolveFalsy();
    });

    it('simple auth condition', async () => {
        const { enhance } = await loadSchema(
            `
            model User {
                id Int @id @default(autoincrement())
                level Int
                admin Boolean
            }

            model Model {
                id Int @id @default(autoincrement())
                value Int
                @@allow('read', auth().level > 0)
                @@allow('create', auth().admin)
                @@allow('update', !auth().admin)
            }
            `
        );

        await expect(enhance().model.check('read')).toResolveFalsy();
        await expect(enhance({ id: 1 }).model.check('read')).toResolveFalsy();
        await expect(enhance({ id: 1, level: 0 }).model.check('read')).toResolveFalsy();
        await expect(enhance({ id: 1, level: 1 }).model.check('read')).toResolveTruthy();

        await expect(enhance().model.check('create')).toResolveFalsy();
        await expect(enhance({ id: 1 }).model.check('create')).toResolveFalsy();
        await expect(enhance({ id: 1, admin: false }).model.check('create')).toResolveFalsy();
        await expect(enhance({ id: 1, admin: true }).model.check('create')).toResolveTruthy();

        await expect(enhance().model.check('update')).toResolveTruthy();
        await expect(enhance({ id: 1 }).model.check('update')).toResolveTruthy();
        await expect(enhance({ id: 1, admin: true }).model.check('update')).toResolveFalsy();
        await expect(enhance({ id: 1, admin: false }).model.check('update')).toResolveTruthy();
    });

    it('auth compared with relation field', async () => {
        const { enhance } = await loadSchema(
            `
            model User {
                id Int @id @default(autoincrement())
                models Model[]
            }

            model Model {
                id Int @id @default(autoincrement())
                owner User @relation(fields: [ownerId], references: [id])
                ownerId Int
                @@allow('read', auth().id == ownerId)
                @@allow('create', auth().id != ownerId)
                @@allow('update', auth() == owner)
                @@allow('delete', auth() != owner)
            }
            `,
            { preserveTsFiles: true }
        );

        await expect(enhance().model.check('read')).toResolveFalsy();
        await expect(enhance({ id: 1 }).model.check('read')).toResolveTruthy();
        await expect(enhance({ id: 1 }).model.check('read', { ownerId: 1 })).toResolveTruthy();
        await expect(enhance({ id: 1 }).model.check('read', { ownerId: 2 })).toResolveFalsy();

        await expect(enhance().model.check('create')).toResolveFalsy();
        await expect(enhance({ id: 1 }).model.check('create')).toResolveTruthy();
        await expect(enhance({ id: 1 }).model.check('create', { ownerId: 1 })).toResolveFalsy();
        await expect(enhance({ id: 1 }).model.check('create', { ownerId: 2 })).toResolveTruthy();

        await expect(enhance().model.check('update')).toResolveFalsy();
        await expect(enhance({ id: 1 }).model.check('update')).toResolveTruthy();
        await expect(enhance({ id: 1 }).model.check('update', { ownerId: 1 })).toResolveTruthy();
        await expect(enhance({ id: 1 }).model.check('update', { ownerId: 2 })).toResolveFalsy();

        await expect(enhance().model.check('delete')).toResolveFalsy();
        await expect(enhance({ id: 1 }).model.check('delete')).toResolveTruthy();
        await expect(enhance({ id: 1 }).model.check('delete', { ownerId: 1 })).toResolveFalsy();
        await expect(enhance({ id: 1 }).model.check('delete', { ownerId: 2 })).toResolveTruthy();
    });

    it('auth null check', async () => {
        const { enhance } = await loadSchema(
            `
            model User {
                id Int @id @default(autoincrement())
                level Int
            }

            model Model {
                id Int @id @default(autoincrement())
                value Int
                @@allow('read', auth() != null)
                @@allow('create', auth() == null)
                @@allow('update', auth().level > 0)
            }
            `
        );

        await expect(enhance().model.check('read')).toResolveFalsy();
        await expect(enhance({ id: 1 }).model.check('read')).toResolveTruthy();

        await expect(enhance().model.check('create')).toResolveTruthy();
        await expect(enhance({ id: 1 }).model.check('create')).toResolveFalsy();

        await expect(enhance().model.check('update')).toResolveFalsy();
        await expect(enhance({ id: 1 }).model.check('update')).toResolveFalsy();
        await expect(enhance({ id: 1, level: 0 }).model.check('update')).toResolveFalsy();
        await expect(enhance({ id: 1, level: 1 }).model.check('update')).toResolveTruthy();
    });

    it('auth with relation access', async () => {
        const { enhance } = await loadSchema(
            `
            model User {
                id Int @id @default(autoincrement())
                profile Profile?
            }

            model Profile {
                id Int @id @default(autoincrement())
                level Int
                user User @relation(fields: [userId], references: [id])
                userId Int @unique
            }

            model Model {
                id Int @id @default(autoincrement())
                value Int
                @@allow('read', auth().profile.level > 0)
            }
            `
        );

        await expect(enhance().model.check('read')).toResolveFalsy();
        await expect(enhance({ id: 1 }).model.check('read')).toResolveFalsy();
        await expect(enhance({ id: 1, profile: { level: 0 } }).model.check('read')).toResolveFalsy();
        await expect(enhance({ id: 1, profile: { level: 1 } }).model.check('read')).toResolveTruthy();
    });

    it('nullable field', async () => {
        const { enhance } = await loadSchema(
            `
            model Model {
                id Int @id @default(autoincrement())
                value Int?
                @@allow('read', value != null)
                @@allow('create', value == null)
            }
            `
        );

        const db = enhance();
        await expect(db.model.check('read')).toResolveTruthy();
        await expect(db.model.check('read', { value: 1 })).toResolveTruthy();
        await expect(db.model.check('create')).toResolveTruthy();
        await expect(db.model.check('create', { value: 1 })).toResolveTruthy();
    });

    it('compilation', async () => {
        await loadSchema(
            `
            model Model {
                id Int @id @default(autoincrement())
                value Int
                @@allow('read', value == 1)
            }
            `,
            {
                compile: true,
                extraSourceFiles: [
                    {
                        name: 'main.ts',
                        content: `
                        import { PrismaClient } from '@prisma/client';
                        import { enhance } from '.zenstack/enhance';

                        const prisma = new PrismaClient();
                        const db = enhance(prisma);
                        db.model.check('read');
                        db.model.check('read', { value: 1 });
                        `,
                    },
                ],
            }
        );
    });

    it('invalid filter', async () => {
        const { enhance } = await loadSchema(
            `
            model Model {
                id Int @id @default(autoincrement())
                value Int
                foo Foo?
                d DateTime
                
                @@allow('read', value == 1)
            }

            model Foo {
                id Int @id @default(autoincrement())
                x Int
                model Model @relation(fields: [modelId], references: [id])
                modelId Int @unique
            }
            `
        );

        const db = enhance();
        await expect(db.model.check('read', { foo: { x: 1 } })).rejects.toThrow(
            `Providing filter for field "foo" is not supported. Only scalar fields are allowed.`
        );
        await expect(db.model.check('read', { d: new Date() })).rejects.toThrow(
            `Providing filter for field "d" is not supported. Only number, string, and boolean fields are allowed.`
        );
        await expect(db.model.check('read', { value: null })).rejects.toThrow(
            `Using "null" as filter value is not supported yet`
        );
        await expect(db.model.check('read', { value: {} })).rejects.toThrow(
            'Invalid value type for field "value". Only number, string or boolean is allowed.'
        );
        await expect(db.model.check('read', { value: 'abc' })).rejects.toThrow(
            'Invalid value type for field "value". Expected "number"'
        );
        await expect(db.model.check('read', { value: -1 })).rejects.toThrow(
            'Invalid value for field "value". Only non-negative integers are allowed.'
        );
    });

    it('float field ignored', async () => {
        const { enhance } = await loadSchema(
            `
            model Model {
                id Int @id @default(autoincrement())
                value Float
                @@allow('read', value == 1.1)
            }
            `
        );
        const db = enhance();
        await expect(db.model.check('read')).toResolveTruthy();
        await expect(db.model.check('read', { value: 1 })).toResolveTruthy();
    });

    it('float value ignored', async () => {
        const { enhance } = await loadSchema(
            `
            model Model {
                id Int @id @default(autoincrement())
                value Int
                @@allow('read', value > 1.1)
            }
            `
        );
        const db = enhance();
        // await expect(db.model.check('read')).toResolveTruthy();
        await expect(db.model.check('read', { value: 1 })).toResolveTruthy();
        await expect(db.model.check('read', { value: 2 })).toResolveTruthy();
    });
});
