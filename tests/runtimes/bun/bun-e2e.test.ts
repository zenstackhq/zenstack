import { clone } from '@zenstackhq/common-helpers';
import { ZenStackClient } from '@zenstackhq/orm';
import { PostgresDialect } from '@zenstackhq/orm/dialects/postgres';
import { PolicyPlugin } from '@zenstackhq/plugin-policy';
import { TEST_PG_URL } from '@zenstackhq/testtools';
import { Database } from 'bun:sqlite';
import { afterEach, describe, expect, it } from 'bun:test';
import type { Dialect } from 'kysely';
// use explicit .js import to avoid bun test loading cjs version of the module
import { BunSqliteDialect } from 'kysely-bun-sqlite/dist/index.js';
import { Client, Pool } from 'pg';
import { schema } from './schemas/schema';

describe('Bun e2e tests', () => {
    const provider = (process.env['TEST_DB_PROVIDER'] ?? 'sqlite') as 'sqlite' | 'postgresql' | 'mysql';

    let _db: any;

    afterEach(async () => {
        await _db?.$disconnect();
    });

    it('works with simple CRUD', async () => {
        const db = (_db = await createClient(provider, 'bun-e2e-crud'));

        const user = await db.user.create({
            data: {
                id: '1',
                email: 'u1@example.com',
                name: 'Test User',
            },
        });
        expect(user).toMatchObject({
            id: '1',
            email: 'u1@example.com',
            name: 'Test User',
        });

        let found = await db.user.findUnique({
            where: { id: '1' },
        });
        expect(found).toMatchObject(user);

        await db.user.update({ where: { id: '1' }, data: { name: 'Updated Name' } });
        found = await db.user.findFirst();
        expect(found).toMatchObject({ name: 'Updated Name' });

        await db.user.delete({ where: { id: '1' } });
        const count = await db.user.count();
        expect(count).toBe(0);
    });

    it('enforces policies', async () => {
        const db = (_db = await createClient(provider, 'bun-e2e-policies'));
        const authDb = db.$use(new PolicyPlugin());

        // create a user
        await db.user.create({
            data: {
                id: '1',
                email: 'u1@example.com',
                name: 'Test User',
                posts: {
                    create: [
                        {
                            id: 'p1',
                            title: 'First Post',
                            published: true,
                        },
                        {
                            id: 'p2',
                            title: 'Second Post',
                            published: false,
                        },
                    ],
                },
            },
        });

        const anonCount = await authDb.post.count();
        expect(anonCount).toBe(0);

        const user1DbCount = await authDb.$setAuth({ id: '1' }).post.count();
        expect(user1DbCount).toBe(2);

        const user2DbCount = await authDb.$setAuth({ id: '2' }).post.count();
        expect(user2DbCount).toBe(1);
    });
});

async function createClient(provider: 'sqlite' | 'postgresql' | 'mysql', dbName: string) {
    const _schema = clone(schema);
    let dialect: Dialect;
    if (provider === 'sqlite') {
        (_schema as any).provider.type = 'sqlite';
        dialect = new BunSqliteDialect({
            database: new Database(':memory:'),
        });
    } else {
        (_schema as any).provider.type = 'postgresql';
        const pgClient = new Client({
            connectionString: TEST_PG_URL,
        });
        await pgClient.connect();
        await pgClient.query(`DROP DATABASE IF EXISTS "${dbName}"`);
        await pgClient.query(`CREATE DATABASE "${dbName}"`);
        await pgClient.end();
        dialect = new PostgresDialect({
            pool: new Pool({
                connectionString: `${TEST_PG_URL}/${dbName}`,
            }),
        });
    }

    const db = new ZenStackClient(_schema, { dialect });
    await db.$pushSchema();
    return db;
}
