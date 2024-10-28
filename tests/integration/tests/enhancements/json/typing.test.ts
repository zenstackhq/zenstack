import { createPostgresDb, dropPostgresDb, loadModelWithError, loadSchema } from '@zenstackhq/testtools';

describe('JSON field typing', () => {
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

    it('is only supported by postgres', async () => {
        await expect(
            loadModelWithError(
                `
            type Profile {
                age Int @gt(0)
            }
            
            model User {
                id Int @id @default(autoincrement())
                profile Profile @json
                @@allow('all', true)
            }
            `
            )
        ).resolves.toContain('Custom-typed field is only supported with "postgresql" provider');
    });

    it('requires field to have @json attribute', async () => {
        await expect(
            loadModelWithError(
                `
            type Profile {
                age Int @gt(0)
            }
            
            model User {
                id Int @id @default(autoincrement())
                profile Profile
                @@allow('all', true)
            }
            `
            )
        ).resolves.toContain('Custom-typed field must have @json attribute');
    });

    it('works with simple field', async () => {
        const params = await loadSchema(
            `
            type Profile {
                age Int @gt(0)
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
            }
            `,
            {
                provider: 'postgresql',
                dbUrl,
                compile: true,
                extraSourceFiles: [
                    {
                        name: 'main.ts',
                        content: `
import { enhance } from '.zenstack/enhance';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const db = enhance(prisma);

async function main() {
    const u = await db.user.create({ data: { profile: { age: 18 }, posts: { create: { title: 'Post1' }} } });
    console.log(u.profile.age);
    const u1 = await db.user.findUnique({ where: { id: u.id } });
    console.log(u1?.profile.age);
    const u2 = await db.user.findMany({include: { posts: true }});
    console.log(u2[0].profile.age);
}
                `,
                    },
                ],
            }
        );

        prisma = params.prisma;
        const db = params.enhance();
        await expect(db.user.create({ data: { profile: { age: 18 } } })).toResolveTruthy();
    });

    it('works with optional field', async () => {
        const params = await loadSchema(
            `
            type Profile {
                age Int @gt(0)
            }
            
            model User {
                id Int @id @default(autoincrement())
                profile Profile? @json
                @@allow('all', true)
            }
            `,
            {
                provider: 'postgresql',
                dbUrl,
                compile: true,
                extraSourceFiles: [
                    {
                        name: 'main.ts',
                        content: `
import { enhance } from '.zenstack/enhance';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const db = enhance(prisma);

async function main() {
    const u = await db.user.create({ data: { profile: { age: 18 } } });
    console.log(u.profile?.age);
    const u1 = await db.user.findUnique({ where: { id: u.id } });
    console.log(u1?.profile?.age);
    const u2 = await db.user.findMany();
    console.log(u2[0].profile?.age);
}
                `,
                    },
                ],
            }
        );

        prisma = params.prisma;
        const db = params.enhance();
        await expect(db.user.create({ data: { profile: { age: 18 } } })).toResolveTruthy();
    });

    it('works with array field', async () => {
        const params = await loadSchema(
            `
            type Profile {
                age Int @gt(0)
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
                compile: true,
                extraSourceFiles: [
                    {
                        name: 'main.ts',
                        content: `
import { enhance } from '.zenstack/enhance';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const db = enhance(prisma);

async function main() {
    const u = await db.user.create({ data: { profiles: [{ age: 18 }] } });
    console.log(u.profiles[0].age);
    const u1 = await db.user.findUnique({ where: { id: u.id } });
    console.log(u1?.profiles[0].age);
    const u2 = await db.user.findMany();
    console.log(u2[0].profiles[0].age);
}
                `,
                    },
                ],
            }
        );

        prisma = params.prisma;
        const db = params.enhance();
        await expect(db.user.create({ data: { profiles: [{ age: 18 }] } })).toResolveTruthy();
    });

    it('works with type nesting', async () => {
        const params = await loadSchema(
            `
            type Profile {
                age Int @gt(0)
                address Address?
            }

            type Address {
                city String
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
                compile: true,
                extraSourceFiles: [
                    {
                        name: 'main.ts',
                        content: `
import { enhance } from '.zenstack/enhance';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const db = enhance(prisma);

async function main() {
    const u = await db.user.create({ data: { profile: { age: 18, address: { city: 'Issaquah' } } } });
    console.log(u.profile.address?.city);
    const u1 = await db.user.findUnique({ where: { id: u.id } });
    console.log(u1?.profile.address?.city);
    const u2 = await db.user.findMany();
    console.log(u2[0].profile.address?.city);
    await db.user.create({ data: { profile: { age: 20 } } });
}
                `,
                    },
                ],
            }
        );

        prisma = params.prisma;
        const db = params.enhance();
        await expect(
            db.user.create({ data: { profile: { age: 18, address: { city: 'Issaquah' } } } })
        ).toResolveTruthy();

        await expect(db.user.create({ data: { profile: { age: 20 } } })).toResolveTruthy();
    });
});
