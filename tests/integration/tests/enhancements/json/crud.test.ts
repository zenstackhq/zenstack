import { createPostgresDb, dropPostgresDb, loadSchema } from '@zenstackhq/testtools';

describe('Json field CRUD', () => {
    let dbUrl: string;
    let prisma: any;

    beforeEach(async () => {
        dbUrl = await createPostgresDb('json-field-typing');
    });

    afterEach(async () => {
        if (prisma) {
            await prisma.$disconnect();
        }
        await dropPostgresDb(dbUrl);
    });

    it('works with simple cases', async () => {
        const params = await loadSchema(
            `
            type Address {
                city String
            }

            type Profile {
                age Int
                address Address?
            }
            
            model User {
                id Int @id @default(autoincrement())
                profile Profile @json
                posts Post[]
            }

            model Post {
                id Int @id @default(autoincrement())
                title String
                user User @relation(fields: [userId], references: [id])
                userId Int
            }
            `,
            {
                provider: 'postgresql',
                dbUrl,
                enhancements: ['validation'],
            }
        );

        prisma = params.prisma;
        const db = params.enhance();

        // expecting object
        await expect(db.user.create({ data: { profile: 1 } })).toBeRejectedByPolicy();
        await expect(db.user.create({ data: { profile: [{ age: 18 }] } })).toBeRejectedByPolicy();
        await expect(db.user.create({ data: { profile: { myAge: 18 } } })).toBeRejectedByPolicy();
        await expect(db.user.create({ data: { profile: { address: { city: 'NY' } } } })).toBeRejectedByPolicy();
        await expect(db.user.create({ data: { profile: { age: 18, address: { x: 1 } } } })).toBeRejectedByPolicy();

        await expect(
            db.user.create({ data: { profile: { age: 18 }, posts: { create: { title: 'Post1' } } } })
        ).resolves.toMatchObject({
            profile: { age: 18 },
        });
        await expect(
            db.user.create({
                data: { profile: { age: 20, address: { city: 'NY' } }, posts: { create: { title: 'Post1' } } },
            })
        ).resolves.toMatchObject({
            profile: { age: 20, address: { city: 'NY' } },
        });
    });

    it('works with array', async () => {
        const params = await loadSchema(
            `
            type Address {
                city String
            }

            type Profile {
                age Int
                address Address?
            }
            
            model User {
                id Int @id @default(autoincrement())
                profiles Profile[] @json
                @@allow('all', true)
            }
            `,
            {
                provider: 'postgresql',
                dbUrl,
            }
        );

        prisma = params.prisma;
        const db = params.enhance();

        // expecting array
        await expect(
            db.user.create({ data: { profiles: { age: 18, address: { city: 'NY' } } } })
        ).toBeRejectedByPolicy();

        await expect(
            db.user.create({ data: { profiles: [{ age: 18, address: { city: 'NY' } }] } })
        ).resolves.toMatchObject({
            profiles: expect.arrayContaining([expect.objectContaining({ age: 18, address: { city: 'NY' } })]),
        });
    });

    it('respects validation rules', async () => {
        const params = await loadSchema(
            `
            type Address {
                city String @length(2, 10)
            }

            type Profile {
                age Int @gte(18)
                address Address?
            }
            
            model User {
                id Int @id @default(autoincrement())
                profile Profile @json
                foo Foo?
                @@allow('all', true)
            }

            model Foo {
                id Int @id @default(autoincrement())
                user User @relation(fields: [userId], references: [id])
                userId Int @unique
                @@allow('all', true)
            }
            `,
            {
                provider: 'postgresql',
                dbUrl,
            }
        );

        prisma = params.prisma;
        const db = params.enhance();

        // create
        await expect(db.user.create({ data: { profile: { age: 10 } } })).toBeRejectedByPolicy();
        await expect(db.user.create({ data: { profile: { age: 18, address: { city: 'N' } } } })).toBeRejectedByPolicy();
        const u1 = await db.user.create({ data: { profile: { age: 18, address: { city: 'NY' } } } });
        expect(u1).toMatchObject({
            profile: { age: 18, address: { city: 'NY' } },
        });

        // update
        await expect(db.user.update({ where: { id: u1.id }, data: { profile: { age: 10 } } })).toBeRejectedByPolicy();
        await expect(
            db.user.update({ where: { id: u1.id }, data: { profile: { age: 20, address: { city: 'B' } } } })
        ).toBeRejectedByPolicy();
        await expect(
            db.user.update({ where: { id: u1.id }, data: { profile: { age: 20, address: { city: 'BJ' } } } })
        ).resolves.toMatchObject({
            profile: { age: 20, address: { city: 'BJ' } },
        });

        // nested create
        await expect(db.foo.create({ data: { user: { create: { profile: { age: 10 } } } } })).toBeRejectedByPolicy();
        await expect(db.foo.create({ data: { user: { create: { profile: { age: 20 } } } } })).toResolveTruthy();

        // upsert
        await expect(
            db.user.upsert({ where: { id: 10 }, create: { id: 10, profile: { age: 10 } }, update: {} })
        ).toBeRejectedByPolicy();
        await expect(
            db.user.upsert({ where: { id: 10 }, create: { id: 10, profile: { age: 20 } }, update: {} })
        ).toResolveTruthy();
        await expect(
            db.user.upsert({
                where: { id: 10 },
                create: { id: 10, profile: { age: 20 } },
                update: { profile: { age: 10 } },
            })
        ).toBeRejectedByPolicy();
        await expect(
            db.user.upsert({
                where: { id: 10 },
                create: { id: 10, profile: { age: 20 } },
                update: { profile: { age: 20 } },
            })
        ).toResolveTruthy();
    });

    it('respects refine validation rules', async () => {
        const params = await loadSchema(
            `
            type Address {
                city String @length(2, 10)
            }

            type Profile {
                age Int @gte(18)
                address Address?
                @@validate(age > 18 && length(address.city, 2, 2))
            }
            
            model User {
                id Int @id @default(autoincrement())
                profile Profile @json
                @@allow('all', true)
            }
            `,
            {
                provider: 'postgresql',
                dbUrl,
            }
        );

        prisma = params.prisma;
        const schema = params.zodSchemas.models.ProfileSchema;

        expect(schema.safeParse({ age: 10, address: { city: 'NY' } })).toMatchObject({ success: false });
        expect(schema.safeParse({ age: 20, address: { city: 'NYC' } })).toMatchObject({ success: false });
        expect(schema.safeParse({ age: 20, address: { city: 'NY' } })).toMatchObject({ success: true });

        const db = params.enhance();
        await expect(db.user.create({ data: { profile: { age: 10 } } })).toBeRejectedByPolicy();
        await expect(
            db.user.create({ data: { profile: { age: 20, address: { city: 'NYC' } } } })
        ).toBeRejectedByPolicy();
        await expect(db.user.create({ data: { profile: { age: 20, address: { city: 'NY' } } } })).toResolveTruthy();
    });

    it('respects enums used by data models', async () => {
        const params = await loadSchema(
            `
            enum Role {
                USER
                ADMIN
            }

            type Profile {
                role Role
            }
            
            model User {
                id Int @id @default(autoincrement())
                profile Profile @json
                @@allow('all', true)
            }

            model Foo {
                id Int @id @default(autoincrement())
                role Role
            }
            `,
            {
                provider: 'postgresql',
                dbUrl,
            }
        );

        prisma = params.prisma;
        const db = params.enhance();

        await expect(db.user.create({ data: { profile: { role: 'MANAGER' } } })).toBeRejectedByPolicy();
        await expect(db.user.create({ data: { profile: { role: 'ADMIN' } } })).resolves.toMatchObject({
            profile: { role: 'ADMIN' },
        });
        await expect(db.user.findFirst()).resolves.toMatchObject({
            profile: { role: 'ADMIN' },
        });
    });

    it('respects enums unused by data models', async () => {
        const params = await loadSchema(
            `
            enum Role {
                USER
                ADMIN
            }

            type Profile {
                role Role
            }
            
            model User {
                id Int @id @default(autoincrement())
                profile Profile @json
                @@allow('all', true)
            }
            `,
            {
                provider: 'postgresql',
                dbUrl,
            }
        );

        prisma = params.prisma;
        const db = params.enhance();

        await expect(db.user.create({ data: { profile: { role: 'MANAGER' } } })).toBeRejectedByPolicy();
        await expect(db.user.create({ data: { profile: { role: 'ADMIN' } } })).resolves.toMatchObject({
            profile: { role: 'ADMIN' },
        });
        await expect(db.user.findFirst()).resolves.toMatchObject({
            profile: { role: 'ADMIN' },
        });
    });

    it('respects @default', async () => {
        const params = await loadSchema(
            `
            type Address {
                state String
                city String @default('Issaquah')
            }

            type Profile {
                createdAt DateTime @default(now())
                address Address?
            }
            
            model User {
                id Int @id @default(autoincrement())
                profile Profile @json
                @@allow('all', true)
            }
            `,
            {
                provider: 'postgresql',
                dbUrl,
            }
        );

        prisma = params.prisma;
        const db = params.enhance();

        // default value
        await expect(db.user.create({ data: { profile: { address: { state: 'WA' } } } })).resolves.toMatchObject({
            profile: { address: { state: 'WA', city: 'Issaquah' }, createdAt: expect.any(Date) },
        });

        // override default
        await expect(
            db.user.create({ data: { profile: { address: { state: 'WA', city: 'Seattle' } } } })
        ).resolves.toMatchObject({
            profile: { address: { state: 'WA', city: 'Seattle' } },
        });
    });

    it('works auth() in @default', async () => {
        const params = await loadSchema(
            `
            type NestedProfile {
                userId Int @default(auth().id)
            }

            type Profile {
                ownerId Int @default(auth().id)
                nested NestedProfile
            }
            
            model User {
                id Int @id @default(autoincrement())
                profile Profile @json
                @@allow('all', true)
            }
            `,
            {
                provider: 'postgresql',
                dbUrl,
            }
        );

        prisma = params.prisma;

        const db = params.enhance({ id: 1 });
        const u1 = await db.user.create({ data: { profile: { nested: {} } } });
        expect(u1.profile.ownerId).toBe(1);
        expect(u1.profile.nested.userId).toBe(1);

        const u2 = await db.user.create({ data: { profile: { ownerId: 2, nested: { userId: 3 } } } });
        expect(u2.profile.ownerId).toBe(2);
        expect(u2.profile.nested.userId).toBe(3);
    });

    it('works with recursive types', async () => {
        const params = await loadSchema(
            `
            type Content {
                type String
                content Content[]?
                text String?
            }
            
            model Post {
                id Int @id @default(autoincrement())
                content Content @json
                @@allow('all', true)
            }
            `,
            {
                provider: 'postgresql',
                dbUrl,
            }
        );

        prisma = params.prisma;
        const db = params.enhance();
        const post = await db.post.create({
            data: {
                content: {
                    type: 'text',
                    content: [
                        {
                            type: 'text',
                            content: [
                                {
                                    type: 'text',
                                    text: 'hello',
                                },
                            ],
                        },
                    ],
                },
            },
        });

        await expect(post.content.content[0].content[0].text).toBe('hello');
    });
});
