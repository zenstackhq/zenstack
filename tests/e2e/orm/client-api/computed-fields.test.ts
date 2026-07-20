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

    it('works with parameterized computed fields in orderBy', async () => {
        const db = await createTestClient(
            `
model User {
    id Int @id @default(autoincrement())
    name String
    posts Post[]
    popularPostCount(minViews: Int) Int @computed
}

model Post {
    id Int @id @default(autoincrement())
    viewCount Int @default(0)
    author User @relation(fields: [authorId], references: [id])
    authorId Int
}
`,
            {
                computedFields: {
                    User: {
                        // counts the user's posts whose viewCount >= the query-time `minViews` arg
                        popularPostCount: (eb: any, ctx: any, args: any) =>
                            eb
                                .selectFrom('Post')
                                .whereRef('Post.authorId', '=', sql.ref(`${ctx.modelAlias}.id`))
                                .where('Post.viewCount', '>=', args.minViews)
                                .select(({ fn }: any) => fn.countAll().as('cnt')),
                    },
                },
            } as any,
        );

        // Alice: posts [300, 50, 50]  → (>=100)=1, (>=250)=1
        // Bob:   posts [120, 120, 10] → (>=100)=2, (>=250)=0
        await db.user.create({
            data: { id: 1, name: 'Alice', posts: { create: [{ viewCount: 300 }, { viewCount: 50 }, { viewCount: 50 }] } },
        });
        await db.user.create({
            data: { id: 2, name: 'Bob', posts: { create: [{ viewCount: 120 }, { viewCount: 120 }, { viewCount: 10 }] } },
        });

        // minViews=100: Alice=1, Bob=2 → desc ⇒ [Bob, Alice]
        await expect(
            db.user.findMany({
                orderBy: [{ popularPostCount: { args: { minViews: 100 }, sort: 'desc' } }, { id: 'asc' }],
            }),
        ).resolves.toMatchObject([{ id: 2 }, { id: 1 }]);

        // minViews=250: Alice=1, Bob=0 → desc ⇒ [Alice, Bob] (different arg ⇒ different order)
        await expect(
            db.user.findMany({
                orderBy: [{ popularPostCount: { args: { minViews: 250 }, sort: 'desc' } }, { id: 'asc' }],
            }),
        ).resolves.toMatchObject([{ id: 1 }, { id: 2 }]);

        // ascending flips the minViews=100 ordering
        await expect(
            db.user.findMany({
                orderBy: [{ popularPostCount: { args: { minViews: 100 }, sort: 'asc' } }, { id: 'asc' }],
            }),
        ).resolves.toMatchObject([{ id: 1 }, { id: 2 }]);

        // a parameterized computed field is not auto-returned (it needs args)
        const plain = await db.user.findFirstOrThrow({ where: { id: 1 } });
        expect(plain).not.toHaveProperty('popularPostCount');

        // cursor pagination can't be combined with a parameterized computed sort
        // (its sort key is not a real column)
        await expect(
            db.user.findMany({
                orderBy: { popularPostCount: { args: { minViews: 100 }, sort: 'desc' } },
                cursor: { id: 1 },
            } as any),
        ).rejects.toThrow(/cursor pagination cannot be combined/);
    });

    it('works with a DateTime-parameterized computed field', async () => {
        const db = await createTestClient(
            `
model User {
    id Int @id @default(autoincrement())
    name String
    posts Post[]
    recentPostCount(since: DateTime) Int @computed
}

model Post {
    id Int @id @default(autoincrement())
    createdAt DateTime
    author User @relation(fields: [authorId], references: [id])
    authorId Int
}
`,
            {
                computedFields: {
                    User: {
                        // counts the user's posts created on/after the query-time `since` arg.
                        // (a computed-field impl writes raw Kysely, so it binds the dialect's
                        // native value — SQLite stores DateTime as an ISO string)
                        recentPostCount: (eb: any, ctx: any, args: any) =>
                            eb
                                .selectFrom('Post')
                                .whereRef('Post.authorId', '=', sql.ref(`${ctx.modelAlias}.id`))
                                .where('Post.createdAt', '>=', args.since.toISOString())
                                .select(({ fn }: any) => fn.countAll().as('cnt')),
                    },
                },
            } as any,
        );

        // Alice: 3 posts in early 2024; Bob: 1 post in Aug 2024
        await db.user.create({
            data: {
                id: 1,
                name: 'Alice',
                posts: {
                    create: [
                        { createdAt: new Date('2024-01-01') },
                        { createdAt: new Date('2024-02-01') },
                        { createdAt: new Date('2024-03-01') },
                    ],
                },
            },
        });
        await db.user.create({
            data: { id: 2, name: 'Bob', posts: { create: [{ createdAt: new Date('2024-08-01') }] } },
        });

        // since 2024-01-01: Alice=3, Bob=1 → desc ⇒ [Alice, Bob]
        await expect(
            db.user.findMany({
                orderBy: [{ recentPostCount: { args: { since: new Date('2024-01-01') }, sort: 'desc' } }, { id: 'asc' }],
            }),
        ).resolves.toMatchObject([{ id: 1 }, { id: 2 }]);

        // since 2024-07-01: Alice=0, Bob=1 → desc ⇒ [Bob, Alice] (later `since` flips the order)
        await expect(
            db.user.findMany({
                orderBy: [{ recentPostCount: { args: { since: new Date('2024-07-01') }, sort: 'desc' } }, { id: 'asc' }],
            }),
        ).resolves.toMatchObject([{ id: 2 }, { id: 1 }]);
    });

    it('works with parameterized computed fields in where (args alongside operators)', async () => {
        const db = await createTestClient(
            `
model User {
    id Int @id @default(autoincrement())
    name String
    posts Post[]
    popularPostCount(minViews: Int) Int @computed
}

model Post {
    id Int @id @default(autoincrement())
    viewCount Int @default(0)
    author User @relation(fields: [authorId], references: [id])
    authorId Int
}
`,
            {
                computedFields: {
                    User: {
                        popularPostCount: (eb: any, ctx: any, args: any) =>
                            eb
                                .selectFrom('Post')
                                .whereRef('Post.authorId', '=', sql.ref(`${ctx.modelAlias}.id`))
                                .where('Post.viewCount', '>=', args.minViews)
                                .select(({ fn }: any) => fn.countAll().as('cnt')),
                    },
                },
            } as any,
        );

        // Alice: posts [300, 50, 50]  → (>=100)=1, (>=40)=3
        // Bob:   posts [120, 120, 10] → (>=100)=2, (>=40)=2
        await db.user.create({
            data: { id: 1, name: 'Alice', posts: { create: [{ viewCount: 300 }, { viewCount: 50 }, { viewCount: 50 }] } },
        });
        await db.user.create({
            data: { id: 2, name: 'Bob', posts: { create: [{ viewCount: 120 }, { viewCount: 120 }, { viewCount: 10 }] } },
        });

        // minViews=100, count >= 2 ⇒ only Bob (Alice=1, Bob=2)
        await expect(
            db.user.findMany({
                where: { popularPostCount: { args: { minViews: 100 }, gte: 2 } },
                orderBy: { id: 'asc' },
            }),
        ).resolves.toMatchObject([{ id: 2 }]);

        // minViews=40, count >= 3 ⇒ only Alice (Alice=3, Bob=2) — a different arg selects a different row
        await expect(
            db.user.findMany({
                where: { popularPostCount: { args: { minViews: 40 }, gte: 3 } },
                orderBy: { id: 'asc' },
            }),
        ).resolves.toMatchObject([{ id: 1 }]);

        // composes with AND and other fields
        await expect(
            db.user.findMany({
                where: { AND: [{ popularPostCount: { args: { minViews: 100 }, gte: 1 } }, { name: 'Alice' }] },
            }),
        ).resolves.toMatchObject([{ id: 1 }]);

        // the bare-value shorthand is rejected — args must be supplied
        await expect(db.user.findMany({ where: { popularPostCount: 2 } as any })).toBeRejectedByValidation();
    });

    it('works with parameterized computed fields in select and include', async () => {
        const db = await createTestClient(
            `
model User {
    id Int @id @default(autoincrement())
    name String
    posts Post[]
    popularPostCount(minViews: Int) Int @computed
}

model Post {
    id Int @id @default(autoincrement())
    viewCount Int @default(0)
    author User @relation(fields: [authorId], references: [id])
    authorId Int
}
`,
            {
                computedFields: {
                    User: {
                        popularPostCount: (eb: any, ctx: any, args: any) =>
                            eb
                                .selectFrom('Post')
                                .whereRef('Post.authorId', '=', sql.ref(`${ctx.modelAlias}.id`))
                                .where('Post.viewCount', '>=', args.minViews)
                                .select(({ fn }: any) => fn.countAll().as('cnt')),
                    },
                },
            } as any,
        );

        // Alice: posts [300, 50, 50] → (>=100)=1, (>=40)=3
        await db.user.create({
            data: { id: 1, name: 'Alice', posts: { create: [{ viewCount: 300 }, { viewCount: 50 }, { viewCount: 50 }] } },
        });

        // `select` narrows to the computed value; different args ⇒ different values
        await expect(
            db.user.findUniqueOrThrow({
                where: { id: 1 },
                select: { id: true, popularPostCount: { args: { minViews: 100 } } },
            }),
        ).resolves.toEqual({ id: 1, popularPostCount: 1 });
        await expect(
            db.user.findUniqueOrThrow({
                where: { id: 1 },
                select: { popularPostCount: { args: { minViews: 40 } } },
            }),
        ).resolves.toEqual({ popularPostCount: 3 });

        // `include` returns it alongside the auto-selected scalar fields
        await expect(
            db.user.findUniqueOrThrow({
                where: { id: 1 },
                include: { popularPostCount: { args: { minViews: 100 } } },
            }),
        ).resolves.toMatchObject({ id: 1, name: 'Alice', popularPostCount: 1 });

        // still not auto-returned when no args are supplied
        const plain = await db.user.findUniqueOrThrow({ where: { id: 1 } });
        expect(plain).not.toHaveProperty('popularPostCount');

        // the boolean shorthand is rejected — args must be supplied
        await expect(
            db.user.findUniqueOrThrow({ where: { id: 1 }, select: { popularPostCount: true } as any }),
        ).toBeRejectedByValidation();
    });

    it('excludes parameterized computed fields from contexts that cannot supply args', async () => {
        const db = await createTestClient(
            `
model User {
    id Int @id @default(autoincrement())
    name String
    posts Post[]
    popularPostCount(minViews: Int) Int @computed
}

model Post {
    id Int @id @default(autoincrement())
    viewCount Int @default(0)
    author User @relation(fields: [authorId], references: [id])
    authorId Int
}
`,
            {
                computedFields: {
                    User: {
                        popularPostCount: (eb: any, ctx: any, args: any) =>
                            eb
                                .selectFrom('Post')
                                .whereRef('Post.authorId', '=', sql.ref(`${ctx.modelAlias}.id`))
                                .where('Post.viewCount', '>=', args.minViews)
                                .select(({ fn }: any) => fn.countAll().as('cnt')),
                    },
                },
            } as any,
        );

        await db.user.create({ data: { id: 1, name: 'Alice' } });

        // these contexts can't carry `args`, so a parameterized computed field is rejected by
        // input validation (it's usable via `orderBy`, `where`, `select`/`include`). `as any`
        // bypasses the matching compile-time exclusions in the query input types.
        await expect(db.user.findMany({ distinct: ['popularPostCount'] as any })).toBeRejectedByValidation();
        await expect(db.user.findMany({ omit: { popularPostCount: true } as any })).toBeRejectedByValidation();
        await expect(db.user.aggregate({ _count: { popularPostCount: true } as any })).toBeRejectedByValidation();
        await expect(db.user.aggregate({ _sum: { popularPostCount: true } as any })).toBeRejectedByValidation();
        await expect(
            db.user.groupBy({ by: ['popularPostCount'], _count: true } as any),
        ).toBeRejectedByValidation();
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
                    user: {
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
            user: {
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
                    user: {
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
            user: {
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

    it('rejects creating or updating computed fields', async () => {
        const db = await createTestClient(
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
            } as any,
        );

        await expect(
            db.user.create({
                data: { id: 1, name: 'Alex', upperName: 'SHOULD NOT WORK' },
            }),
        ).toBeRejectedByValidation(['upperName']);

        await db.user.create({
            data: { id: 1, name: 'Alex' },
        });

        await expect(
            db.user.update({
                where: { id: 1 },
                data: { upperName: 'STILL SHOULD NOT WORK' },
            }),
        ).toBeRejectedByValidation(['upperName']);
    });
});
