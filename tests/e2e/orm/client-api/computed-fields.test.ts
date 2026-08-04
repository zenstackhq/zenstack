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
            data: {
                id: 1,
                name: 'Alice',
                posts: { create: [{ viewCount: 300 }, { viewCount: 50 }, { viewCount: 50 }] },
            },
        });
        await db.user.create({
            data: {
                id: 2,
                name: 'Bob',
                posts: { create: [{ viewCount: 120 }, { viewCount: 120 }, { viewCount: 10 }] },
            },
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
                orderBy: [
                    { recentPostCount: { args: { since: new Date('2024-01-01') }, sort: 'desc' } },
                    { id: 'asc' },
                ],
            }),
        ).resolves.toMatchObject([{ id: 1 }, { id: 2 }]);

        // since 2024-07-01: Alice=0, Bob=1 → desc ⇒ [Bob, Alice] (later `since` flips the order)
        await expect(
            db.user.findMany({
                orderBy: [
                    { recentPostCount: { args: { since: new Date('2024-07-01') }, sort: 'desc' } },
                    { id: 'asc' },
                ],
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
            data: {
                id: 1,
                name: 'Alice',
                posts: { create: [{ viewCount: 300 }, { viewCount: 50 }, { viewCount: 50 }] },
            },
        });
        await db.user.create({
            data: {
                id: 2,
                name: 'Bob',
                posts: { create: [{ viewCount: 120 }, { viewCount: 120 }, { viewCount: 10 }] },
            },
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
model Product {
    id Int @id @default(autoincrement())
    name String
    price Int
    priceTimes(factor: Int) Int @computed
}
`,
            {
                computedFields: {
                    Product: {
                        // a row-local arithmetic expression (price * factor); returns a plain integer
                        // on every dialect, so the selected value is a number (not a bigint string)
                        priceTimes: (_eb: any, ctx: any, args: any) =>
                            sql<number>`${sql.ref(`${ctx.modelAlias}.price`)} * ${args.factor}`,
                    },
                },
            } as any,
        );

        await db.product.create({ data: { id: 1, name: 'Widget', price: 100 } });

        // `select` narrows to the computed value; different args ⇒ different values
        await expect(
            db.product.findUniqueOrThrow({
                where: { id: 1 },
                select: { id: true, priceTimes: { args: { factor: 2 } } },
            }),
        ).resolves.toEqual({ id: 1, priceTimes: 200 });
        await expect(
            db.product.findUniqueOrThrow({
                where: { id: 1 },
                select: { priceTimes: { args: { factor: 3 } } },
            }),
        ).resolves.toEqual({ priceTimes: 300 });

        // `include` returns it alongside the auto-selected scalar fields
        await expect(
            db.product.findUniqueOrThrow({
                where: { id: 1 },
                include: { priceTimes: { args: { factor: 2 } } },
            }),
        ).resolves.toMatchObject({ id: 1, name: 'Widget', price: 100, priceTimes: 200 });

        // still not auto-returned when no args are supplied
        const plain = await db.product.findUniqueOrThrow({ where: { id: 1 } });
        expect(plain).not.toHaveProperty('priceTimes');

        // the boolean shorthand is rejected — args must be supplied
        await expect(
            db.product.findUniqueOrThrow({ where: { id: 1 }, select: { priceTimes: true } as any }),
        ).toBeRejectedByValidation();
    });

    it('works with parameterized computed fields in aggregate (_sum/_max/_count)', async () => {
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

        // Alice: [300, 50, 50] → (>=100)=1, (>=40)=3 ; Bob: [120, 120, 10] → (>=100)=2, (>=40)=2
        await db.user.create({
            data: {
                id: 1,
                name: 'Alice',
                posts: { create: [{ viewCount: 300 }, { viewCount: 50 }, { viewCount: 50 }] },
            },
        });
        await db.user.create({
            data: {
                id: 2,
                name: 'Bob',
                posts: { create: [{ viewCount: 120 }, { viewCount: 120 }, { viewCount: 10 }] },
            },
        });

        // minViews=100 ⇒ Alice=1, Bob=2 ⇒ sum=3, max=2, count(non-null)=2
        await expect(
            db.user.aggregate({
                _sum: { popularPostCount: { args: { minViews: 100 } } },
                _max: { popularPostCount: { args: { minViews: 100 } } },
                _count: { popularPostCount: { args: { minViews: 100 } } },
            }),
        ).resolves.toMatchObject({
            _sum: { popularPostCount: 3 },
            _max: { popularPostCount: 2 },
            _count: { popularPostCount: 2 },
        });

        // minViews=40 ⇒ Alice=3, Bob=2 ⇒ sum=5 (a different arg produces a different aggregate)
        await expect(
            db.user.aggregate({ _sum: { popularPostCount: { args: { minViews: 40 } } } }),
        ).resolves.toMatchObject({ _sum: { popularPostCount: 5 } });

        // the bare-`true` shorthand is rejected — args must be supplied
        await expect(db.user.aggregate({ _sum: { popularPostCount: true } as any })).toBeRejectedByValidation();

        // the field is materialized once, so aggregating it with conflicting args is rejected
        await expect(
            db.user.aggregate({
                _sum: { popularPostCount: { args: { minViews: 100 } } },
                _avg: { popularPostCount: { args: { minViews: 40 } } },
            }),
        ).rejects.toThrow(/conflicting "args"/);
    });

    it('works with parameterized computed fields in groupBy by (keyed entry)', async () => {
        // NOTE: grouping by a *row-local* parameterized computed field works on all dialects.
        // A computed field backed by a *correlated subquery* is subject to the database's own
        // rules for grouping by a correlated expression (Postgres rejects it, SQLite allows it) —
        // that constraint is orthogonal to this feature and applies to any correlated GROUP BY.
        const db = await createTestClient(
            `
model Product {
    id Int @id @default(autoincrement())
    price Int
    priceTier(threshold: Int) Int @computed
}
`,
            {
                computedFields: {
                    Product: {
                        // price tier via a row-local CASE expression (deterministic integer, no
                        // float-division / cast-rounding differences across dialects)
                        priceTier: (_eb: any, ctx: any, args: any) =>
                            sql<number>`case when ${sql.ref(`${ctx.modelAlias}.price`)} >= ${args.threshold} then 1 else 0 end`,
                    },
                },
            } as any,
        );

        // prices [10, 25, 30, 55]; priceTier(threshold=30) = [0, 0, 1, 1]
        await db.product.createMany({
            data: [{ price: 10 }, { price: 25 }, { price: 30 }, { price: 55 }],
        });

        // group by the computed tier: 0→{10,25}, 1→{30,55}
        const groups = await db.product.groupBy({
            by: [{ field: 'priceTier', args: { threshold: 30 } }],
            _count: { _all: true },
        });
        expect(groups.sort((a: any, b: any) => a.priceTier - b.priceTier)).toEqual([
            { priceTier: 0, _count: { _all: 2 } },
            { priceTier: 1, _count: { _all: 2 } },
        ]);
    });

    it('works with parameterized computed fields in groupBy orderBy aggregations', async () => {
        const db = await createTestClient(
            `
model Product {
    id Int @id @default(autoincrement())
    category String
    price Int
    discounted(off: Int) Int @computed
}
`,
            {
                computedFields: {
                    Product: {
                        // price minus a query-time discount, as a row-local expression
                        discounted: (_eb: any, ctx: any, args: any) =>
                            sql<number>`${sql.ref(`${ctx.modelAlias}.price`)} - ${args.off}`,
                    },
                },
            } as any,
        );

        // A: prices [30, 30]; B: prices [50]
        await db.product.createMany({
            data: [
                { category: 'A', price: 30 },
                { category: 'A', price: 30 },
                { category: 'B', price: 50 },
            ],
        });

        // off=0 ⇒ sum A=60, B=50 ⇒ desc [A, B]
        await expect(
            db.product.groupBy({
                by: ['category'],
                orderBy: { _sum: { discounted: { args: { off: 0 }, sort: 'desc' } } },
            }),
        ).resolves.toMatchObject([{ category: 'A' }, { category: 'B' }]);

        // off=25 ⇒ sum A=10, B=25 ⇒ desc [B, A] (a different arg produces a different order)
        await expect(
            db.product.groupBy({
                by: ['category'],
                orderBy: { _sum: { discounted: { args: { off: 25 }, sort: 'desc' } } },
            }),
        ).resolves.toMatchObject([{ category: 'B' }, { category: 'A' }]);

        // _min with asc: min A=30, B=50 ⇒ [A, B]
        await expect(
            db.product.groupBy({
                by: ['category'],
                orderBy: { _min: { discounted: { args: { off: 0 }, sort: 'asc' } } },
            }),
        ).resolves.toMatchObject([{ category: 'A' }, { category: 'B' }]);

        // omitting `sort` is rejected by input validation
        await expect(
            db.product.groupBy({
                by: ['category'],
                orderBy: { _sum: { discounted: { args: { off: 0 } } } } as any,
            }),
        ).toBeRejectedByValidation();
    });

    it('works with parameterized computed fields in a nested include/select', async () => {
        const db = await createTestClient(
            `
model User {
    id Int @id @default(autoincrement())
    name String
    posts Post[]
}

model Post {
    id Int @id @default(autoincrement())
    viewCount Int @default(0)
    author User @relation(fields: [authorId], references: [id])
    authorId Int
    weightedViews(factor: Int) Int @computed
}
`,
            {
                computedFields: {
                    Post: {
                        // viewCount * factor, correlated to the row via ctx.modelAlias
                        weightedViews: (_eb: any, ctx: any, args: any) =>
                            sql<number>`${sql.ref(`${ctx.modelAlias}.viewCount`)} * ${args.factor}`,
                    },
                },
            } as any,
        );

        await db.user.create({
            data: {
                id: 1,
                name: 'Alice',
                posts: {
                    create: [
                        { id: 1, viewCount: 300 },
                        { id: 2, viewCount: 50 },
                    ],
                },
            },
        });

        // nested `include` of a parameterized computed field on the related model
        const u1 = await db.user.findFirstOrThrow({
            where: { id: 1 },
            include: { posts: { include: { weightedViews: { args: { factor: 10 } } }, orderBy: { id: 'asc' } } },
        });
        expect(u1.posts.map((p: any) => p.weightedViews)).toEqual([3000, 500]);

        // a different arg yields different nested values
        const u2 = await db.user.findFirstOrThrow({
            where: { id: 1 },
            include: { posts: { include: { weightedViews: { args: { factor: 2 } } }, orderBy: { id: 'asc' } } },
        });
        expect(u2.posts.map((p: any) => p.weightedViews)).toEqual([600, 100]);

        // nested `select` narrows to the computed value
        const u3 = await db.user.findFirstOrThrow({
            where: { id: 1 },
            include: {
                posts: { select: { id: true, weightedViews: { args: { factor: 2 } } }, orderBy: { id: 'asc' } },
            },
        });
        expect(u3.posts).toEqual([
            { id: 1, weightedViews: 600 },
            { id: 2, weightedViews: 100 },
        ]);
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

        // `distinct` and `omit` have no `args` slot, so a parameterized computed field is rejected
        // by input validation there (it's usable via orderBy, where, select/include, the aggregate
        // inputs, and groupBy `by`). `as any` bypasses the matching compile-time exclusions.
        await expect(db.user.findMany({ distinct: ['popularPostCount'] as any })).toBeRejectedByValidation();
        await expect(db.user.findMany({ omit: { popularPostCount: true } as any })).toBeRejectedByValidation();
        // groupBy `by` requires the keyed `{ field, args }` entry — the bare name is rejected
        await expect(db.user.groupBy({ by: ['popularPostCount'], _count: true } as any)).toBeRejectedByValidation();
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

    it('provides the client in the computed field context', async () => {
        const db = await createTestClient(
            `
model Post {
    id Int @id @default(autoincrement())
    authorId Int
    isMine Boolean @computed
}
`,
            {
                computedFields: {
                    Post: {
                        // parenthesized: the expression gets embedded into larger ones
                        // (e.g. `where: { isMine: true }` wraps it with `= true`), and an
                        // unparenthesized chained comparison is a syntax error on postgres
                        isMine: (eb: any, { client }: any) => eb.parens(eb('authorId', '=', client?.$auth?.id ?? -1)),
                    },
                },
            } as any,
        );

        await db.post.create({ data: { id: 1, authorId: 1 } });
        await db.post.create({ data: { id: 2, authorId: 2 } });

        // no auth set: nothing is mine
        await expect(db.post.findUnique({ where: { id: 1 } })).resolves.toMatchObject({ isMine: false });

        // the client derived with $setAuth carries its auth into the computed field
        const authedDb = db.$setAuth({ id: 1 });
        await expect(authedDb.post.findUnique({ where: { id: 1 } })).resolves.toMatchObject({ isMine: true });
        await expect(authedDb.post.findUnique({ where: { id: 2 } })).resolves.toMatchObject({ isMine: false });
        await expect(authedDb.post.findMany({ where: { isMine: true } })).resolves.toHaveLength(1);

        // the original client is unaffected
        await expect(db.post.findUnique({ where: { id: 1 } })).resolves.toMatchObject({ isMine: false });
    });
});
