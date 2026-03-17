import { ZenStackClient, type FindManyArgs } from '@zenstackhq/orm';
import SQLite from 'better-sqlite3';
import { SqliteDialect } from 'kysely';
import { Role, Status, type Identity, type IdentityProvider } from './models';
import { schema } from './schema';

const client = new ZenStackClient(schema, {
    dialect: new SqliteDialect({ database: new SQLite('./zenstack/test.db') }),
    computedFields: {
        User: {
            postCount: (eb) =>
                eb
                    .selectFrom('Post')
                    .whereRef('Post.authorId', '=', 'id')
                    .select(({ fn }) => fn.countAll<number>().as('postCount')),
        },
    },
});

async function main() {
    await find();
    await create();
    await update();
    await del();
    await count();
    await aggregate();
    await groupBy();
    await queryBuilder();
    enums();
    typeDefs();
}

async function find() {
    const user1 = await client.user.findFirst({
        where: {
            name: 'Alex',
            role: Role.USER,
            status: {
                has: Status.ACTIVE,
            },
        },
    });
    console.log(user1?.name);
    console.log(user1?.postCount);
    console.log(user1?.identity?.providers[0]?.name);

    const users = await client.user.findMany({
        include: { posts: true },
        omit: { email: true, postCount: true },
    });
    console.log(users.length);
    console.log(users[0]?.name);
    console.log(users[0]?.posts.length);
    // @ts-expect-error
    console.log(users[0]?.email);
    // @ts-expect-error
    console.log(users[0]?.postCount);

    // @ts-expect-error select/omit are not allowed together
    await client.user.findMany({
        select: { posts: true },
        omit: { email: true },
    });

    // @ts-expect-error select/include are not allowed together
    await client.user.findMany({
        select: { email: true },
        include: { posts: true },
    });

    const user2 = await client.user.findUniqueOrThrow({
        where: { email: 'alex@zenstack.dev', postCount: { gt: 0 } },
        select: { email: true, profile: true },
    });
    console.log(user2.email);
    console.log(user2.profile?.age);

    await client.user.findUnique({
        // @ts-expect-error expect unique filter
        where: { name: 'Alex' },
    });

    // enum array
    await client.user.findFirst({
        where: { status: { equals: [Status.ACTIVE] } },
    });
    await client.user.findFirst({
        where: { status: { has: Status.ACTIVE } },
    });
    await client.user.findFirst({
        where: { status: { hasEvery: [Status.ACTIVE] } },
    });

    await client.user.findMany({
        skip: 1,
        take: 1,
        orderBy: {
            email: 'asc',
            name: 'desc',
        },
        cursor: { id: 1 },
    });

    const user3 = await client.user.findFirstOrThrow({
        select: {
            _count: true,
            posts: {
                select: { _count: true },
            },
        },
    });
    console.log(user3._count.posts);
    console.log(user3.posts[0]?._count.tags);

    (
        await client.user.findFirstOrThrow({
            select: {
                _count: {
                    select: { posts: true },
                },
            },
        })
    )._count.posts;

    (
        await client.user.findFirstOrThrow({
            select: {
                _count: {
                    select: {
                        posts: {
                            where: { title: { contains: 'Hello' } },
                        },
                    },
                },
            },
        })
    )._count.posts;

    (
        await client.user.findFirstOrThrow({
            select: {
                posts: {
                    select: {
                        _count: {
                            select: { tags: true },
                        },
                    },
                },
            },
        })
    ).posts[0]?._count.tags;

    (
        await client.user.findFirstOrThrow({
            select: {
                profile: {
                    include: {
                        region: true,
                    },
                },
            },
        })
    ).profile?.region?.city;

    // _count inside include should be properly typed
    const includeWithCount = await client.user.findFirst({
        include: {
            posts: { select: { title: true } },
            _count: { select: { posts: true } },
        },
    });
    console.log(includeWithCount?.posts[0]?.title);
    console.log(includeWithCount?._count.posts);

    const includeWithCountTrue = await client.user.findFirst({
        include: {
            posts: true,
            _count: true,
        },
    });
    console.log(includeWithCountTrue?.posts[0]?.title);
    console.log(includeWithCountTrue?._count.posts);

    (
        await client.user.findFirstOrThrow({
            select: {
                posts: {
                    where: { title: 'Foo' },
                    take: 1,
                    select: {
                        author: {
                            select: {
                                id: true,
                            },
                        },
                    },
                },
            },
        })
    ).posts[0]?.author?.id;

    const u = await client.user.findFirstOrThrow({
        select: {
            posts: {
                where: { title: 'Foo' },
                select: {
                    author: {
                        include: {
                            profile: true,
                        },
                        omit: {
                            email: true,
                        },
                    },
                },
            },
        },
    });
    console.log(u.posts[0]?.author?.profile?.age);
    console.log(u.posts[0]?.author?.role);
    // @ts-expect-error
    console.log(u.posts[0]?.author?.email);
}

async function create() {
    await client.user.create({
        // @ts-expect-error email is required
        data: { name: 'Alex' },
    });

    await client.user.create({
        data: {
            name: 'Alex',
            email: 'alex@zenstack.dev',
            profile: {
                create: {
                    age: 20,
                    // @ts-expect-error userId is not allowed
                    userId: 1,
                },
            },
            identity: {
                providers: [
                    {
                        id: '123',
                        name: 'GitHub',
                        // undeclared fields are allowed
                        otherField: 123,
                    },
                    {
                        id: '234',
                        // name is optional
                    },
                    // @ts-expect-error id is required
                    {
                        name: 'Google',
                    },
                ],
            },
        },
    });

    // createMany
    const { count: createCount } = await client.user.createMany({
        data: [
            {
                name: 'Alex3',
                email: 'alex3@zenstack.dev',
            },
            {
                name: 'Alex4',
                email: 'alex4@zenstack.dev',
            },
        ],
    });
    console.log(createCount);

    // createManyAndReturn
    await client.user.createManyAndReturn({
        data: [
            {
                name: 'Alex5',
                email: 'alex5@zenstack.dev',
            },
        ],
        // @ts-expect-error include is not allowed
        include: { posts: true },
    });
    await client.user.createManyAndReturn({
        data: [
            {
                name: 'Alex5',
                email: 'alex5@zenstack.dev',
            },
        ],
        // @ts-expect-error selecting relation is not allowed
        select: { posts: true },
    });
    const createdUsers = await client.user.createManyAndReturn({
        data: [
            {
                name: 'Alex5',
                email: 'alex5@zenstack.dev',
            },
        ],
        select: { email: true },
    });
    console.log(createdUsers.length);
    console.log(createdUsers[0]?.email);
    // @ts-expect-error
    console.log(createdUsers[0]?.name);

    // connect
    const region = await client.region.create({
        data: {
            country: 'US',
            city: 'Seattle',
        },
    });

    await client.profile.create({
        data: {
            age: 20,
            user: { connect: { id: 1 } },
            region: {
                connect: {
                    country_city: {
                        country: region.country,
                        city: region.city,
                    },
                },
            },
        },
    });
    await client.profile.create({
        data: {
            age: 20,
            user: { connect: { id: 1 } },
            region: {
                connect: {
                    // @ts-expect-error city is required
                    country_city: {
                        country: region.country,
                    },
                },
            },
        },
    });
    await client.profile.create({
        data: {
            age: 20,
            userId: 1,
            regionCountry: region.country,
            regionCity: region.city,
        },
    });

    // many-to-many
    await client.post.create({
        data: {
            title: 'Hello World',
            content: 'This is a test post',
            author: { connect: { id: 1 } },
            tags: { create: { name: 'tag1' } },
        },
    });
    await client.post.create({
        data: {
            title: 'Hello World',
            content: 'This is a test post',
            author: { connect: { id: 1 } },
            tags: { create: [{ name: 'tag2' }, { name: 'tag3' }] },
        },
    });
    await client.tag.create({
        data: {
            name: 'tag4',
            posts: {
                connectOrCreate: {
                    where: { id: 1 },
                    create: {
                        title: 'Hello World',
                        content: 'This is a test post',
                        author: { connect: { id: 1 } },
                    },
                },
            },
        },
    });
}

async function update() {
    // @ts-expect-error where is required
    await client.user.update({
        data: {
            name: 'Alex',
            email: 'alex@zenstack.dev',
        },
    });

    await client.user.update({
        where: { id: 1, AND: [{ name: 'Alex' }] },
        data: {
            name: 'Alex',
            email: 'alex@zenstack.dev',
        },
    });

    await client.user.update({
        where: { id: 1 },
        data: {
            posts: {
                create: {
                    title: 'Hello World',
                    content: 'This is a test post',
                },
                createMany: {
                    data: [
                        {
                            title: 'Hello World',
                            content: 'This is a test post',
                        },
                    ],
                    skipDuplicates: true,
                },
                connect: { id: 1 },
                connectOrCreate: {
                    where: { id: 1 },
                    create: {
                        title: 'Hello World',
                        content: 'This is a test post',
                    },
                },
                set: [{ id: 1 }],
                disconnect: [{ id: 1 }],
                delete: [{ id: 1 }],
                deleteMany: [{ id: 1 }],
                update: {
                    where: { id: 1 },
                    data: {
                        title: 'Hello World',
                        content: 'This is a test post',
                    },
                },
                upsert: {
                    where: { id: 1 },
                    create: {
                        title: 'Hello World',
                        content: 'This is a test post',
                    },
                    update: {
                        title: 'Hello World',
                        content: 'This is a test post',
                    },
                },
                updateMany: {
                    where: { id: 1 },
                    data: {
                        title: 'Hello World',
                        content: 'This is a test post',
                    },
                },
            },
        },
    });

    await client.user.update({
        where: { id: 1 },
        data: {
            profile: {
                connect: { id: 1 },
                connectOrCreate: {
                    where: { id: 1 },
                    create: { age: 20 },
                },
                create: { age: 20 },
                delete: true,
                disconnect: true,
                update: {
                    age: 30,
                },
                upsert: {
                    where: { id: 1 },
                    create: { age: 20 },
                    update: { age: 30 },
                },
            },
        },
    });

    await client.user.update({
        where: { id: 1 },
        data: {
            profile: {
                delete: { age: { gt: 10 } },
                disconnect: { age: { gt: 10 } },
            },
        },
    });

    await client.profile.update({
        where: { id: 1 },
        data: {
            user: {
                // @ts-expect-error delete is not allowed
                delete: true,
            },
        },
    });

    await client.profile.update({
        where: { id: 1 },
        data: {
            user: {
                // @ts-expect-error disconnect is not allowed
                disconnect: true,
            },
        },
    });

    // many-to-many
    await client.post.update({
        where: { id: 1 },
        data: {
            tags: {
                connect: { id: 1 },
            },
        },
    });

    // compound id
    await client.profile.update({
        where: { id: 1 },
        data: {
            region: {
                connect: {
                    country_city: {
                        country: 'US',
                        city: 'Seattle',
                    },
                },
            },
        },
    });

    await client.user.upsert({
        where: { id: 1 },
        create: {
            name: 'Alex',
            email: 'alex@zenstack.dev',
        },
        update: {
            name: 'Alex New',
            email: 'alex@zenstack.dev',
        },
    });
}

async function del() {
    // @ts-expect-error where is required
    await client.user.delete({});

    // @ts-expect-error unique filter is required
    await client.user.delete({ where: { name: 'Alex' } });

    (
        await client.user.delete({
            where: { id: 1 },
        })
    ).email;

    (await client.user.deleteMany({})).count;
}

async function count() {
    await client.user.count();
    await client.user.count({
        where: {
            name: 'Alex',
        },
    });

    const r = await client.user.count({
        select: {
            _all: true,
            email: true,
        },
    });
    console.log(r._all);
    console.log(r.email);
}

async function aggregate() {
    const r = await client.profile.aggregate({
        _count: true,
        _avg: { age: true },
        _sum: { age: true },
        _min: { age: true },
        _max: { age: true },
        skip: 1,
        take: 1,
        orderBy: {
            age: 'asc',
        },
    });
    console.log(r._count);
    console.log(r._avg.age);

    const r1 = await client.profile.aggregate({
        _count: {
            _all: true,
            regionCity: true,
        },
    });
    console.log(r1._count._all);
    console.log(r1._count.regionCity);
}

async function groupBy() {
    const r = await client.profile.groupBy({
        by: ['regionCountry', 'regionCity'],
        _count: true,
        _avg: { age: true },
        _sum: { age: true },
        _min: { age: true },
        _max: { age: true },
        skip: 1,
        take: 1,
        orderBy: {
            age: 'asc',
        },
        having: {
            regionCity: { not: 'Seattle' },
        },
    });
    console.log(r[0]?._count);
    console.log(r[0]?._avg.age);
    console.log(r[0]?._sum.age);
    console.log(r[0]?._min.age);
    console.log(r[0]?._max.age);
    console.log(r[0]?.regionCountry);
    console.log(r[0]?.regionCity);
    // @ts-expect-error age is not in the groupBy
    console.log(r[0]?.age);
}

async function queryBuilder() {
    const r = await client.$qb
        .selectFrom('User')
        .where('name', '=', 'Alex')
        .select(['id', 'email'])
        .executeTakeFirstOrThrow();
    console.log(r.id);
    console.log(r.email);
    // @ts-expect-error
    console.log(r.name);
}

function enums() {
    const a: Role = 'ADMIN';
    console.log(a);
    let b = Role.ADMIN;
    b = a;
    console.log(b);
}

function typeDefs() {
    const identityProvider: IdentityProvider = {
        id: '123',
        name: 'GitHub',
    };
    console.log(identityProvider.id);
    console.log(identityProvider.name);

    const identity: Identity = {
        providers: [identityProvider],
    };
    console.log(identity.providers[0]?.name);
}

main();

// Type test: `include` should not be allowed for models without relations
{
    type NoRelationsSchema = {
        provider: { type: 'sqlite' };
        models: {
            Dummy: {
                name: 'Dummy';
                fields: {
                    id: { name: 'id'; type: 'Int'; id: true };
                    name: { name: 'name'; type: 'String' };
                };
                idFields: ['id'];
                uniqueFields: { id: { type: 'Int' } };
            };
        };
        enums: {};
        typeDefs: {};
        plugins: {};
    };
    type DummyFindManyArgs = FindManyArgs<NoRelationsSchema, 'Dummy'>;
    // @ts-expect-error include should not be allowed for models without relations
    const _testIncludeNotAllowed: DummyFindManyArgs = { include: { abcdefg: true } };
    void _testIncludeNotAllowed;
}
