import { loadSchema } from '@zenstackhq/testtools';

describe('JSON field typing', () => {
    it('works with simple field', async () => {
        await loadSchema(
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
                pushDb: false,
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
    });

    it('works with optional field', async () => {
        await loadSchema(
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
                pushDb: false,
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
    });

    it('works with array field', async () => {
        await loadSchema(
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
                pushDb: false,
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
    });

    it('works with type nesting', async () => {
        await loadSchema(
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
                pushDb: false,
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
    });

    it('works with enums used in models', async () => {
        await loadSchema(
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
                pushDb: false,
                compile: true,
                extraSourceFiles: [
                    {
                        name: 'main.ts',
                        content: `
import type { Profile } from '.zenstack/models';
import { enhance } from '.zenstack/enhance';
import { PrismaClient } from '@prisma/client';
import { Role } from '@prisma/client';
const prisma = new PrismaClient();
const db = enhance(prisma);

async function main() {
    const profile: Profile = {
        role: Role.ADMIN,
    }

    await db.user.create({ data: { profile: { role: Role.ADMIN } } });
    const user = await db.user.findFirstOrThrow();
    console.log(user.profile.role === Role.ADMIN);
}
`,
                    },
                ],
            }
        );
    });

    it('works with enums unused in models', async () => {
        await loadSchema(
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
                pushDb: false,
                compile: true,
                extraSourceFiles: [
                    {
                        name: 'main.ts',
                        content: `
import type { Profile } from '.zenstack/models';
import { enhance } from '.zenstack/enhance';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const db = enhance(prisma);

async function main() {
    const profile: Profile = {
        role: 'ADMIN',
    }

    await db.user.create({ data: { profile: { role: 'ADMIN' } } });
    const user = await db.user.findFirstOrThrow();
    console.log(user.profile.role === 'ADMIN');
}
`,
                    },
                ],
            }
        );
    });

    it('type coverage', async () => {
        await loadSchema(
            `
            type Profile {
                boolean Boolean
                bigint BigInt
                int Int
                float Float
                decimal Decimal
                string String
                bytes Bytes
                dateTime DateTime
                json Json
            }

            model User {
                id Int @id @default(autoincrement())
                profile Profile @json
                @@allow('all', true)
            }
            `,
            {
                provider: 'postgresql',
                pushDb: false,
                compile: true,
                extraSourceFiles: [
                    {
                        name: 'main.ts',
                        content: `
import type { Profile } from '.zenstack/models';
import { Prisma } from '@prisma/client';

async function main() {
    const profile: Profile = {
        boolean: true,
        bigint: BigInt(9007199254740991),
        int: 100,
        float: 1.23,
        decimal: new Prisma.Decimal(1.2345),
        string: 'string',
        bytes: new Uint8Array([0, 1, 2, 3]),
        dateTime: new Date(),
        json: { a: 1 },
    }
}
                `,
                    },
                ],
            }
        );
    });
});
