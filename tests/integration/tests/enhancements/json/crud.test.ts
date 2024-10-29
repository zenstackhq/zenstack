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
                @@allow('all', true)
            }

            model Post {
                id Int @id @default(autoincrement())
                title String
                user User @relation(fields: [userId], references: [id])
                userId Int
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
        await expect(
            db.user.create({ data: { profile: { age: 18 }, posts: { create: { title: 'Post1' } } } })
        ).toResolveTruthy();
        await expect(
            db.user.create({
                data: { profile: { age: 20, address: { city: 'NY' } }, posts: { create: { title: 'Post1' } } },
            })
        ).toResolveTruthy();
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
});
