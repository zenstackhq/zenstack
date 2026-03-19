import { ZenStackClient } from '@zenstackhq/orm';
import { PolicyPlugin } from '@zenstackhq/plugin-policy';
import SQLite from 'better-sqlite3';
import { sql, SqliteDialect } from 'kysely';
import { schema } from './zenstack/schema';

async function main() {
    const db = new ZenStackClient(schema, {
        dialect: new SqliteDialect({ database: new SQLite('./zenstack/dev.db') }),
        computedFields: {
            user: {
                postCount: (eb, { modelAlias }) =>
                    eb
                        .selectFrom('Post')
                        .whereRef('Post.authorId', '=', sql.ref(`${modelAlias}.id`))
                        .select(({ fn }) => fn.countAll<number>().as('postCount')),
            },
        },
        procedures: {
            signUp: ({ client, args }) =>
                client.user.create({
                    data: { ...args },
                }),
            listPublicPosts: ({}) => [],
        },
    }).$use({
        id: 'cost-logger',
        onQuery: async ({ model, operation, args, proceed }) => {
            const start = Date.now();
            const result = await proceed(args as any);
            console.log(`[cost] ${model} ${operation} took ${Date.now() - start}ms`);
            return result;
        },
    });

    // clean up existing data
    await db.post.deleteMany();
    await db.profile.deleteMany();
    await db.user.deleteMany();

    db.user.findMany({ where: { id: '1' } });

    // create users and some posts
    const user1 = await db.user.create({
        data: {
            email: 'yiming@gmail.com',
            role: 'ADMIN',
            posts: {
                create: [
                    {
                        title: 'Post1',
                        content: 'An unpublished post',
                        published: false,
                    },
                    {
                        title: 'Post2',
                        content: 'A published post',
                        published: true,
                    },
                ],
            },
        },
        include: { posts: true },
    });
    console.log('User created:', user1);

    const user2 = await db.user.create({
        data: {
            email: 'jiasheng@zenstack.dev',
            role: 'USER',
            posts: {
                create: {
                    title: 'Post3',
                    content: 'Another unpublished post',
                    published: false,
                },
            },
        },
        include: { posts: true },
    });
    console.log('User created:', user2);

    // find with where conditions mixed with low-level Kysely expression builder
    const userWithProperDomain = await db.user.findMany({
        where: {
            role: 'USER',
            $expr: (eb) => eb('email', 'like', '%@zenstack.dev'),
        },
    });
    console.log('User found with mixed filter:', userWithProperDomain);

    // filter with computed field
    const userWithMorePosts = await db.user.findMany({
        where: {
            role: 'ADMIN',
            postCount: {
                gt: 1,
            },
        },
    });
    console.log('User found with computed field:', userWithMorePosts);

    // policy-enabled read
    const authDb = db.$use(new PolicyPlugin());
    const user1Db = authDb.$setAuth({ id: user1.id });
    const user2Db = authDb.$setAuth({ id: user2.id });

    console.log('Posts readable to', user1.email);
    console.table(await user1Db.post.findMany({ select: { title: true, published: true } }));

    console.log('Posts readable to', user2.email);
    console.table(await user2Db.post.findMany({ select: { title: true, published: true } }));

    const newUser = await authDb.$procs.signUp({ args: { email: 'new@zenstack.dev', name: 'New User' } });
    console.log('New user signed up via procedure:', newUser);

    const publicPosts = await authDb.$procs.listPublicPosts();
    console.log('Public posts via procedure:', publicPosts);
}

main();
