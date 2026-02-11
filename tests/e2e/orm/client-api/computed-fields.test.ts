import { createTestClient } from '@zenstackhq/testtools';
import { sql } from 'kysely';
import { describe, expect, it } from 'vitest';

describe('Computed fields tests', () => {
    it('throws error when computed field configuration is missing', async () => {
        await expect(
            createTestClient(
                `
model User {
    id Int @id @default(autoincrement())
    name String
    upperName String @computed
}
`,
                {
                    // missing computedFields configuration
                } as any,
            ),
        ).rejects.toThrow('Computed field "upperName" in model "User" does not have a configuration');
    });

    it('throws error when computed field is missing from configuration', async () => {
        await expect(
            createTestClient(
                `
model User {
    id Int @id @default(autoincrement())
    name String
    upperName String @computed
    lowerName String @computed
}
`,
                {
                    computedFields: {
                        User: {
                            // only providing one of two computed fields
                            upperName: (eb: any) => eb.fn('upper', ['name']),
                        },
                    },
                } as any,
            ),
        ).rejects.toThrow('Computed field "lowerName" in model "User" does not have a configuration');
    });

    it('throws error when computed field configuration is not a function', async () => {
        await expect(
            createTestClient(
                `
model User {
    id Int @id @default(autoincrement())
    name String
    upperName String @computed
}
`,
                {
                    computedFields: {
                        User: {
                            // providing a string instead of a function
                            upperName: 'not a function' as any,
                        },
                    },
                } as any,
            ),
        ).rejects.toThrow(
            'Computed field "upperName" in model "User" has an invalid configuration: expected a function but received string',
        );
    });

    it('throws error when computed field configuration is a non-function object', async () => {
        await expect(
            createTestClient(
                `
model User {
    id Int @id @default(autoincrement())
    name String
    computed1 String @computed
}
`,
                {
                    computedFields: {
                        User: {
                            // providing an object instead of a function
                            computed1: { key: 'value' } as any,
                        },
                    },
                } as any,
            ),
        ).rejects.toThrow(
            'Computed field "computed1" in model "User" has an invalid configuration: expected a function but received object',
        );
    });

    it('works with non-optional fields', async () => {
        const db = await createTestClient(
            `
model User {
    id Int @id @default(autoincrement())
    firstName String
    lastName String
    fullName String @computed
}
`,
            {
                computedFields: {
                    User: {
                        fullName: (eb: any) => eb.fn('concat', [eb.ref('firstName'), sql.lit(' '), eb.ref('lastName')]),
                    },
                },
            } as any,
        );

        await expect(
            db.user.create({
                data: { id: 1, firstName: 'Alex', lastName: 'Smith' },
            }),
        ).resolves.toMatchObject({
            fullName: 'Alex Smith',
        });

        await expect(
            db.user.findUnique({
                where: { id: 1 },
                select: { fullName: true },
            }),
        ).resolves.toMatchObject({
            fullName: 'Alex Smith',
        });

        await expect(
            db.user.findFirst({
                where: { fullName: 'Alex Smith' },
            }),
        ).resolves.toMatchObject({
            fullName: 'Alex Smith',
        });

        await expect(
            db.user.findFirst({
                where: { fullName: 'Alex' },
            }),
        ).toResolveNull();

        await expect(
            db.user.findFirst({
                orderBy: { fullName: 'desc' },
            }),
        ).resolves.toMatchObject({
            fullName: 'Alex Smith',
        });

        await expect(
            db.user.findFirst({
                orderBy: { fullName: 'desc' },
                take: 1,
            }),
        ).resolves.toMatchObject({
            fullName: 'Alex Smith',
        });

        await expect(
            db.user.aggregate({
                _count: { fullName: true },
            }),
        ).resolves.toMatchObject({
            _count: { fullName: 1 },
        });

        await expect(
            db.user.groupBy({
                by: ['fullName'],
                _count: { fullName: true },
                _max: { fullName: true },
            }),
        ).resolves.toEqual([
            expect.objectContaining({
                _count: { fullName: 1 },
                _max: { fullName: 'Alex Smith' },
            }),
        ]);
    });

    it('is typed correctly for non-optional fields', async () => {
        await createTestClient(
            `
model User {
    id Int @id @default(autoincrement())
    name String
    upperName String @computed
}
`,
            {
                computedFields: {
                    User: {
                        upperName: (eb: any) => eb.fn('upper', ['name']),
                    },
                },
                extraSourceFiles: {
                    main: `
import { ZenStackClient } from '@zenstackhq/orm';
import { schema } from './schema';

async function main() {
    const client = new ZenStackClient(schema, {
        dialect: {} as any,
        computedFields: {
            User: {
                upperName: (eb) => eb.fn('upper', ['name']),
            },
        }
    });

    const user = await client.user.create({
        data: { id: 1, name: 'Alex' }
    });
    console.log(user.upperName);
    // @ts-expect-error
    user.upperName = null;
}

main();
`,
                },
            },
        );
    });

    it('works with optional fields', async () => {
        const db = await createTestClient(
            `
model User {
    id Int @id @default(autoincrement())
    name String
    upperName String? @computed
}
`,
            {
                computedFields: {
                    User: {
                        upperName: (eb: any) => eb.lit(null),
                    },
                },
            } as any,
        );

        await expect(
            db.user.create({
                data: { id: 1, name: 'Alex' },
            }),
        ).resolves.toMatchObject({
            upperName: null,
        });
    });

    it('is typed correctly for optional fields', async () => {
        await createTestClient(
            `
model User {
    id Int @id @default(autoincrement())
    name String
    upperName String? @computed
}
`,
            {
                computedFields: {
                    User: {
                        upperName: (eb: any) => eb.lit(null),
                    },
                },
                extraSourceFiles: {
                    main: `
import { ZenStackClient } from '@zenstackhq/orm';
import { schema } from './schema';

async function main() {
    const client = new ZenStackClient(schema, {
        dialect: {} as any,
        computedFields: {
            User: {
                upperName: (eb) => eb.lit(null),
            },
        }
    });

    const user = await client.user.create({
        data: { id: 1, name: 'Alex' }
    });
    console.log(user.upperName);
    user.upperName = null;
}

main();
`,
                },
            },
        );
    });

    it('works with read from a relation', async () => {
        const db = await createTestClient(
            `
model User {
    id Int @id @default(autoincrement())
    name String
    posts Post[]
    postCount Int @computed
}

model Post {
    id Int @id @default(autoincrement())
    title String
    author User @relation(fields: [authorId], references: [id])
    authorId Int
}
`,
            {
                computedFields: {
                    User: {
                        postCount: (eb: any, context: { modelAlias: string }) =>
                            eb
                                .selectFrom('Post')
                                .whereRef('Post.authorId', '=', eb.ref(`${context.modelAlias}.id`))
                                .select(() => eb.fn.countAll().as('count')),
                    },
                },
            } as any,
        );

        await db.user.create({
            data: { id: 1, name: 'Alex', posts: { create: { title: 'Post1' } } },
        });

        await expect(db.post.findFirst({ select: { id: true, author: true } })).resolves.toMatchObject({
            author: expect.objectContaining({ postCount: 1 }),
        });
    });

    it('allows sub models to use computed fields from delegate base', async () => {
        const db = await createTestClient(
            `
model Content {
    id Int @id @default(autoincrement())
    title String
    isNews Boolean @computed
    contentType String
    @@delegate(contentType)
}

model Post extends Content {
    body String
}
`,
            {
                computedFields: {
                    Content: {
                        isNews: (eb: any) => eb('title', 'like', '%news%'),
                    },
                },
            } as any,
        );

        if (db.$schema.provider.type !== 'mysql') {
            const posts = await db.post.createManyAndReturn({
                data: [
                    { id: 1, title: 'latest news', body: 'some news content' },
                    { id: 2, title: 'random post', body: 'some other content' },
                ],
            });
            expect(posts).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ id: 1, isNews: true }),
                    expect.objectContaining({ id: 2, isNews: false }),
                ]),
            );
        }
    });
});
