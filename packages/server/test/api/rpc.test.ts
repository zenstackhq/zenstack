import { ClientContract } from '@zenstackhq/orm';
import { SchemaDef } from '@zenstackhq/orm/schema';
import { createPolicyTestClient, createTestClient } from '@zenstackhq/testtools';
import Decimal from 'decimal.js';
import SuperJSON from 'superjson';
import { beforeAll, describe, expect, it } from 'vitest';
import { RPCApiHandler } from '../../src/api';
import { schema } from '../utils';

describe('RPC API Handler Tests', () => {
    let client: ClientContract<SchemaDef>;
    let rawClient: ClientContract<SchemaDef>;

    beforeAll(async () => {
        client = await createPolicyTestClient(schema);
        rawClient = client.$unuseAll();
    });

    it('crud', async () => {
        const handleRequest = makeHandler();

        let r = await handleRequest({
            method: 'get',
            path: '/post/findMany',
            client: rawClient,
        });
        expect(r.status).toBe(200);
        expect(r.data).toHaveLength(0);

        r = await handleRequest({
            method: 'get',
            path: '/user/exists',
            query: { q: JSON.stringify({ where: { id: 'user1' } }) },
            client: rawClient,
        });
        expect(r.status).toBe(200);
        expect(r.data).toBe(false);

        r = await handleRequest({
            method: 'post',
            path: '/user/create',
            query: {},
            requestBody: {
                include: { posts: true },
                data: {
                    id: 'user1',
                    email: 'user1@abc.com',
                    posts: {
                        create: [
                            { title: 'post1', published: true, viewCount: 1 },
                            { title: 'post2', published: false, viewCount: 2 },
                        ],
                    },
                },
            },
            client: rawClient,
        });
        expect(r.status).toBe(201);
        expect(r.data).toEqual(
            expect.objectContaining({
                email: 'user1@abc.com',
                posts: expect.arrayContaining([
                    expect.objectContaining({ title: 'post1' }),
                    expect.objectContaining({ title: 'post2' }),
                ]),
            }),
        );

        r = await handleRequest({
            method: 'get',
            path: '/user/exists',
            query: { q: JSON.stringify({ where: { id: 'user1' } }) },
            client: rawClient,
        });
        expect(r.status).toBe(200);
        expect(r.data).toBe(true);

        r = await handleRequest({
            method: 'get',
            path: '/post/findMany',
            client: rawClient,
        });
        expect(r.status).toBe(200);
        expect(r.data).toHaveLength(2);

        r = await handleRequest({
            method: 'get',
            path: '/post/findMany',
            query: { q: JSON.stringify({ where: { viewCount: { gt: 1 } } }) },
            client: rawClient,
        });
        expect(r.status).toBe(200);
        expect(r.data).toHaveLength(1);

        r = await handleRequest({
            method: 'put',
            path: '/user/update',
            requestBody: { where: { id: 'user1' }, data: { email: 'user1@def.com' } },
            client: rawClient,
        });
        expect(r.status).toBe(200);
        expect(r.data.email).toBe('user1@def.com');

        r = await handleRequest({
            method: 'get',
            path: '/post/count',
            query: { q: JSON.stringify({ where: { viewCount: { gt: 1 } } }) },
            client: rawClient,
        });
        expect(r.status).toBe(200);
        expect(r.data).toBe(1);

        r = await handleRequest({
            method: 'get',
            path: '/post/aggregate',
            query: { q: JSON.stringify({ _sum: { viewCount: true } }) },
            client: rawClient,
        });
        expect(r.status).toBe(200);
        expect(r.data._sum.viewCount).toBe(3);

        r = await handleRequest({
            method: 'get',
            path: '/post/groupBy',
            query: { q: JSON.stringify({ by: ['published'], _sum: { viewCount: true } }) },
            client: rawClient,
        });
        expect(r.status).toBe(200);
        expect(r.data).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ published: true, _sum: { viewCount: 1 } }),
                expect.objectContaining({ published: false, _sum: { viewCount: 2 } }),
            ]),
        );

        r = await handleRequest({
            method: 'delete',
            path: '/user/deleteMany',
            query: { q: JSON.stringify({ where: { id: 'user1' } }) },
            client: rawClient,
        });
        expect(r.status).toBe(200);
        expect(r.data.count).toBe(1);
    });

    it('procedures', async () => {
        const procSchema = `
model User {
    id String @id @default(cuid())
    email String @unique @email

    @@allow('all', true)
}

procedure echo(input: String): String
mutation procedure createUser(email: String): User
procedure getFalse(): Boolean
procedure getUndefined(): Undefined
`;

        const procClient = await createPolicyTestClient(procSchema, {
            procedures: {
                echo: async ({ args }: any) => args.input,
                createUser: async ({ client, args }: any) => {
                    return client.user.create({ data: { email: args.email } });
                },
                getFalse: async () => false,
                getUndefined: async () => undefined,
            },
        } as any);

        const handler = new RPCApiHandler({ schema: procClient.$schema });
        const handleProcRequest = async (args: any) => {
            const r = await handler.handleRequest({
                ...args,
                client: procClient,
                url: new URL(`http://localhost/${args.path}`),
            });
            return {
                status: r.status,
                body: r.body as any,
                data: (r.body as any).data,
                error: (r.body as any).error,
                meta: (r.body as any).meta,
            };
        };

        // query procedure: GET only, args via q
        let r = await handleProcRequest({
            method: 'get',
            path: '/$procs/echo',
            query: { q: JSON.stringify({ args: { input: 'hello' } }) },
        });
        expect(r.status).toBe(200);
        expect(r.data).toBe('hello');

        r = await handleProcRequest({
            method: 'post',
            path: '/$procs/echo',
            requestBody: { args: { input: 'hello' } },
        });
        expect(r.status).toBe(400);
        expect(r.error?.message).toMatch(/only GET is supported/i);

        // mutation procedure: POST only, args via body
        r = await handleProcRequest({
            method: 'post',
            path: '/$procs/createUser',
            requestBody: { args: { email: 'user1@abc.com' } },
        });
        expect(r.status).toBe(200);
        expect(r.data).toEqual(expect.objectContaining({ email: 'user1@abc.com' }));

        r = await handleProcRequest({
            method: 'get',
            path: '/$procs/createUser',
            query: { q: JSON.stringify({ args: { email: 'user2@abc.com' } }) },
        });
        expect(r.status).toBe(400);
        expect(r.error?.message).toMatch(/only POST is supported/i);

        // falsy/undefined return serialization
        r = await handleProcRequest({ method: 'get', path: '/$procs/getFalse' });
        expect(r.status).toBe(200);
        expect(r.data).toBe(false);

        r = await handleProcRequest({ method: 'get', path: '/$procs/getUndefined' });
        expect(r.status).toBe(200);
        expect(r.data).toBeNull();
        expect(r.meta?.serialization).toBeTruthy();
    });

    it('procedures - edge cases', async () => {
        const procSchema = `
model User {
    id String @id @default(cuid())
    email String @unique @email
}

enum Role {
    ADMIN
    USER
}

type Overview {
    total Int
}

procedure echoInt(x: Int): Int
procedure opt2(a: Int?, b: Int?): Int
procedure sum3(a: Int, b: Int, c: Int): Int
procedure sumIds(ids: Int[]): Int
procedure echoRole(r: Role): Role
procedure echoOverview(o: Overview): Overview
`;

        const procClient = await createPolicyTestClient(procSchema, {
            procedures: {
                echoInt: async ({ args }: any) => args.x,
                opt2: async ({ args }: any) => {
                    const a = args?.a as number | undefined;
                    const b = args?.b as number | undefined;
                    return (a ?? 0) + (b ?? 0);
                },
                sum3: async ({ args }: any) => args.a + args.b + args.c,
                sumIds: async ({ args }: any) => (args.ids as number[]).reduce((acc: number, x: number) => acc + x, 0),
                echoRole: async ({ args }: any) => args.r,
                echoOverview: async ({ args }: any) => args.o,
            },
        } as any);

        const handler = new RPCApiHandler({ schema: procClient.$schema });
        const handleProcRequest = async (args: any) => {
            const r = await handler.handleRequest({
                ...args,
                client: procClient,
                url: new URL(`http://localhost/${args.path}`),
            });
            return {
                status: r.status,
                body: r.body as any,
                data: (r.body as any).data,
                error: (r.body as any).error,
                meta: (r.body as any).meta,
            };
        };

        // > 2 params object mapping
        let r = await handleProcRequest({
            method: 'get',
            path: '/$procs/sum3',
            query: { q: JSON.stringify({ args: { a: 1, b: 2, c: 3 } }) },
        });
        expect(r.status).toBe(200);
        expect(r.data).toBe(6);

        // all optional params can omit payload
        r = await handleProcRequest({ method: 'get', path: '/$procs/opt2' });
        expect(r.status).toBe(200);
        expect(r.data).toBe(0);

        // array-typed single param via q JSON array
        r = await handleProcRequest({
            method: 'get',
            path: '/$procs/sumIds',
            query: { q: JSON.stringify({ args: { ids: [1, 2, 3] } }) },
        });
        expect(r.status).toBe(200);
        expect(r.data).toBe(6);

        // enum param validation
        r = await handleProcRequest({
            method: 'get',
            path: '/$procs/echoRole',
            query: { q: JSON.stringify({ args: { r: 'ADMIN' } }) },
        });
        expect(r.status).toBe(200);
        expect(r.data).toBe('ADMIN');

        // typedef param (object payload)
        r = await handleProcRequest({
            method: 'get',
            path: '/$procs/echoOverview',
            query: { q: JSON.stringify({ args: { o: { total: 123 } } }) },
        });
        expect(r.status).toBe(200);
        expect(r.data).toMatchObject({ total: 123 });

        // wrong type input
        r = await handleProcRequest({
            method: 'get',
            path: '/$procs/echoInt',
            query: { q: JSON.stringify({ args: { x: 'x' } }) },
        });
        expect(r.status).toBe(422);
        expect(r.error?.message).toMatch(/invalid input/i);

        // invalid args payload type
        r = await handleProcRequest({
            method: 'get',
            path: '/$procs/sum3',
            query: { q: JSON.stringify({ args: [1, 2, 3, 4] }) },
        });
        expect(r.status).toBe(400);
        expect(r.error?.message).toMatch(/args/i);

        // unknown keys
        r = await handleProcRequest({
            method: 'get',
            path: '/$procs/sum3',
            query: { q: JSON.stringify({ args: { a: 1, b: 2, c: 3, d: 4 } }) },
        });
        expect(r.status).toBe(400);
        expect(r.error?.message).toMatch(/unknown procedure argument/i);
    });

    it('pagination and ordering', async () => {
        const handleRequest = makeHandler();

        // Clean up any existing data first
        await rawClient.post.deleteMany();
        await rawClient.user.deleteMany();

        // Create test data
        await rawClient.user.create({
            data: {
                id: 'user1',
                email: 'user1@abc.com',
                posts: {
                    create: [
                        { id: '1', title: 'A Post', published: true, viewCount: 5 },
                        { id: '2', title: 'B Post', published: true, viewCount: 3 },
                        { id: '3', title: 'C Post', published: true, viewCount: 7 },
                        { id: '4', title: 'D Post', published: true, viewCount: 1 },
                        { id: '5', title: 'E Post', published: true, viewCount: 9 },
                    ],
                },
            },
        });

        // Test orderBy with title ascending
        let r = await handleRequest({
            method: 'get',
            path: '/post/findMany',
            query: { q: JSON.stringify({ orderBy: { title: 'asc' } }) },
            client: rawClient,
        });
        expect(r.status).toBe(200);
        expect(r.data).toHaveLength(5);
        expect(r.data[0].title).toBe('A Post');
        expect(r.data[4].title).toBe('E Post');

        // Test orderBy with viewCount descending
        r = await handleRequest({
            method: 'get',
            path: '/post/findMany',
            query: { q: JSON.stringify({ orderBy: { viewCount: 'desc' } }) },
            client: rawClient,
        });
        expect(r.status).toBe(200);
        expect(r.data[0].viewCount).toBe(9);
        expect(r.data[4].viewCount).toBe(1);

        // Test multiple orderBy
        r = await handleRequest({
            method: 'get',
            path: '/post/findMany',
            query: { q: JSON.stringify({ orderBy: [{ published: 'desc' }, { title: 'asc' }] }) },
            client: rawClient,
        });
        expect(r.status).toBe(200);
        expect(r.data[0].title).toBe('A Post');

        // Test take (limit)
        r = await handleRequest({
            method: 'get',
            path: '/post/findMany',
            query: { q: JSON.stringify({ take: 3 }) },
            client: rawClient,
        });
        expect(r.status).toBe(200);
        expect(r.data).toHaveLength(3);

        // Test skip (offset)
        r = await handleRequest({
            method: 'get',
            path: '/post/findMany',
            query: { q: JSON.stringify({ skip: 2, take: 2 }) },
            client: rawClient,
        });
        expect(r.status).toBe(200);
        expect(r.data).toHaveLength(2);

        // Test skip and take with orderBy
        r = await handleRequest({
            method: 'get',
            path: '/post/findMany',
            query: { q: JSON.stringify({ orderBy: { title: 'asc' }, skip: 1, take: 3 }) },
            client: rawClient,
        });
        expect(r.status).toBe(200);
        expect(r.data).toHaveLength(3);
        expect(r.data[0].title).toBe('B Post');
        expect(r.data[2].title).toBe('D Post');

        // Test cursor-based pagination
        r = await handleRequest({
            method: 'get',
            path: '/post/findMany',
            query: { q: JSON.stringify({ orderBy: { id: 'asc' }, take: 2 }) },
            client: rawClient,
        });
        expect(r.status).toBe(200);
        expect(r.data).toHaveLength(2);
        const lastId = r.data[1].id;

        // Get next page using cursor
        r = await handleRequest({
            method: 'get',
            path: '/post/findMany',
            query: { q: JSON.stringify({ orderBy: { id: 'asc' }, take: 2, skip: 1, cursor: { id: lastId } }) },
            client: rawClient,
        });
        expect(r.status).toBe(200);
        expect(r.data).toHaveLength(2);
        expect(r.data[0].id).toBe('3');
        expect(r.data[1].id).toBe('4');

        // Clean up
        await rawClient.post.deleteMany();
        await rawClient.user.deleteMany();
    });

    it('policy violation', async () => {
        // Clean up any existing data first
        await rawClient.post.deleteMany();
        await rawClient.user.deleteMany();

        await rawClient.user.create({
            data: {
                id: '1',
                email: 'user1@abc.com',
                posts: { create: { id: '1', title: 'post1', published: true } },
            },
        });

        const handleRequest = makeHandler();

        let r = await handleRequest({
            method: 'post',
            path: '/post/create',
            requestBody: {
                data: { id: '2', title: 'post2', authorId: '1', published: false },
            },
            client,
        });
        expect(r.status).toBe(403);
        expect(r.error.rejectedByPolicy).toBe(true);
        expect(r.error.model).toBe('Post');
        expect(r.error.rejectReason).toBe('no-access');

        r = await handleRequest({
            method: 'put',
            path: '/post/update',
            requestBody: {
                where: { id: '1' },
                data: { title: 'post2' },
            },
            client,
        });
        expect(r.status).toBe(404);
        expect(r.error.model).toBe('Post');
    });

    it('validation error', async () => {
        const handleRequest = makeHandler();

        let r = await handleRequest({
            method: 'get',
            path: '/post/findUnique',
            client: rawClient,
        });
        expect(r.status).toBe(422);
        expect(r.error.message).toContain('Validation error');
        expect(r.error.message).toContain('where');

        r = await handleRequest({
            method: 'post',
            path: '/post/create',
            requestBody: { data: {} },
            client: rawClient,
        });
        expect(r.status).toBe(422);
        expect(r.error.message).toContain('Validation error');
        expect(r.error.message).toContain('data');

        r = await handleRequest({
            method: 'post',
            path: '/user/create',
            requestBody: { data: { email: 'hello' } },
            client: rawClient,
        });
        expect(r.status).toBe(422);
        expect(r.error.message).toContain('Validation error');
        expect(r.error.message).toContain('email');
    });

    it('invalid path or args', async () => {
        const handleRequest = makeHandler();
        let r = await handleRequest({
            method: 'get',
            path: '/post/',
            client: rawClient,
        });
        expect(r.status).toBe(400);
        expect(r.error.message).toContain('invalid request path');

        r = await handleRequest({
            method: 'get',
            path: '/post/findMany/abc',
            client: rawClient,
        });
        expect(r.status).toBe(400);
        expect(r.error.message).toContain('invalid request path');

        r = await handleRequest({
            method: 'get',
            path: '/post/findUnique',
            query: { q: 'abc' },
            client: rawClient,
        });
        expect(r.status).toBe(400);
        expect(r.error.message).toContain('invalid "q" query parameter');

        r = await handleRequest({
            method: 'delete',
            path: '/post/deleteMany',
            query: { q: 'abc' },
            client: rawClient,
        });
        expect(r.status).toBe(400);
        expect(r.error.message).toContain('invalid "q" query parameter');
    });

    it('field types', async () => {
        const schema = `
        model Foo {
            id Int @id
            
            string String
            int Int
            bigInt BigInt
            date DateTime
            float Float
            decimal Decimal
            boolean Boolean
            stringList String[]
            bytes Bytes
            bars Bar[]
        }


        model Bar {
            id Int @id @default(autoincrement())
            bytes Bytes
            foo Foo @relation(fields: [fooId], references: [id])
            fooId Int @unique
        }    
        `;

        const handleRequest = makeHandler();
        const client = await createTestClient(schema, { provider: 'postgresql' });

        const decimalValue = new Decimal('0.046875');
        const bigIntValue = BigInt(534543543534);
        const dateValue = new Date();
        const bytesValue = new Uint8Array([1, 2, 3, 4]);
        const barBytesValue = new Uint8Array([7, 8, 9]);
        const stringListValue = ['a', 'b', 'c'];

        const createData = {
            string: 'string',
            int: 123,
            bigInt: bigIntValue,
            date: dateValue,
            float: 1.23,
            decimal: decimalValue,
            boolean: true,
            bytes: bytesValue,
            stringList: stringListValue,
            bars: {
                create: { bytes: barBytesValue },
            },
        };

        const serialized = SuperJSON.serialize({
            include: { bars: true },
            data: { id: 1, ...createData },
        });

        let r = await handleRequest({
            method: 'post',
            path: '/foo/create',
            query: {},
            client,
            requestBody: {
                ...(serialized.json as any),
                meta: { serialization: serialized.meta },
            },
        });
        expect(r.status).toBe(201);
        expect(r.meta).toBeTruthy();
        const data: any = SuperJSON.deserialize({ json: r.data, meta: r.meta.serialization });
        expect(typeof data.bigInt).toBe('bigint');
        expect(data.bytes).toBeInstanceOf(Uint8Array);
        expect(data.date instanceof Date).toBeTruthy();
        expect(Decimal.isDecimal(data.decimal)).toBeTruthy();
        expect(data.bars[0].bytes).toBeInstanceOf(Uint8Array);
        expect(Array.isArray(data.stringList)).toBeTruthy();
        expect(data.stringList).toEqual(stringListValue);

        // find with filter not found
        const serializedQ = SuperJSON.serialize({
            where: {
                bigInt: {
                    gt: bigIntValue,
                },
            },
        });
        r = await handleRequest({
            method: 'get',
            path: '/foo/findFirst',
            query: {
                q: JSON.stringify(serializedQ.json),
                meta: JSON.stringify({ serialization: serializedQ.meta }),
            },
            client,
        });
        expect(r.status).toBe(200);
        expect(r.data).toBeNull();

        // find with filter found
        const serializedQ1 = SuperJSON.serialize({
            where: {
                bigInt: bigIntValue,
            },
        });
        r = await handleRequest({
            method: 'get',
            path: '/foo/findFirst',
            query: {
                q: JSON.stringify(serializedQ1.json),
                meta: JSON.stringify({ serialization: serializedQ1.meta }),
            },
            client,
        });
        expect(r.status).toBe(200);
        expect(r.data).toBeTruthy();

        // find with filter found
        const serializedQ2 = SuperJSON.serialize({
            where: {
                bars: {
                    some: {
                        bytes: barBytesValue,
                    },
                },
            },
        });
        r = await handleRequest({
            method: 'get',
            path: '/foo/findFirst',
            query: {
                q: JSON.stringify(serializedQ2.json),
                meta: JSON.stringify({ serialization: serializedQ2.meta }),
            },
            client,
        });
        expect(r.status).toBe(200);
        expect(r.data).toBeTruthy();

        // find with filter not found
        const serializedQ3 = SuperJSON.serialize({
            where: {
                bars: {
                    none: {
                        bytes: barBytesValue,
                    },
                },
            },
        });
        r = await handleRequest({
            method: 'get',
            path: '/foo/findFirst',
            query: {
                q: JSON.stringify(serializedQ3.json),
                meta: JSON.stringify({ serialization: serializedQ3.meta }),
            },
            client,
        });
        expect(r.status).toBe(200);
        expect(r.data).toBeNull();

        // validate update on stringList
        const serializedUpdate = SuperJSON.serialize({
            where: { id: 1 },
            data: {
                stringList: ['d', 'e', 'f'],
            },
        });
        r = await handleRequest({
            method: 'patch',
            path: '/foo/update',
            query: {},
            client,
            requestBody: {
                ...(serializedUpdate.json as any),
                meta: { serialization: serializedUpdate.meta },
            },
        });
        expect(r.status).toBe(200);
        expect(r.data).toBeTruthy();
        expect(r.data.stringList).toEqual(['d', 'e', 'f']);
    });

    describe('transaction', () => {
        it('runs sequential operations atomically', async () => {
            const handleRequest = makeHandler();

            // Clean up
            await rawClient.post.deleteMany();
            await rawClient.user.deleteMany();

            const r = await handleRequest({
                method: 'post',
                path: '/$transaction/sequential',
                requestBody: [
                    {
                        model: 'User',
                        op: 'create',
                        args: { data: { id: 'txuser1', email: 'txuser1@abc.com' } },
                    },
                    {
                        model: 'Post',
                        op: 'create',
                        args: { data: { id: 'txpost1', title: 'Tx Post', authorId: 'txuser1' } },
                    },
                    {
                        model: 'Post',
                        op: 'findMany',
                        args: { where: { authorId: 'txuser1' } },
                    },
                ],
                client: rawClient,
            });

            expect(r.status).toBe(200);
            expect(Array.isArray(r.data)).toBe(true);
            expect(r.data).toHaveLength(3);
            expect(r.data[0]).toMatchObject({ id: 'txuser1', email: 'txuser1@abc.com' });
            expect(r.data[1]).toMatchObject({ id: 'txpost1', title: 'Tx Post' });
            expect(r.data[2]).toHaveLength(1);
            expect(r.data[2][0]).toMatchObject({ id: 'txpost1' });

            // Clean up
            await rawClient.post.deleteMany();
            await rawClient.user.deleteMany();
        });

        it('rejects non-POST methods', async () => {
            const handleRequest = makeHandler();

            const r = await handleRequest({
                method: 'get',
                path: '/$transaction/sequential',
                client: rawClient,
            });
            expect(r.status).toBe(400);
            expect(r.error.message).toMatch(/only POST is supported/i);
        });

        it('rejects missing or non-array body', async () => {
            const handleRequest = makeHandler();

            let r = await handleRequest({
                method: 'post',
                path: '/$transaction/sequential',
                client: rawClient,
            });
            expect(r.status).toBe(400);
            expect(r.error.message).toMatch(/non-empty array/i);

            r = await handleRequest({
                method: 'post',
                path: '/$transaction/sequential',
                requestBody: [],
                client: rawClient,
            });
            expect(r.status).toBe(400);
            expect(r.error.message).toMatch(/non-empty array/i);

            r = await handleRequest({
                method: 'post',
                path: '/$transaction/sequential',
                requestBody: { model: 'User', op: 'findMany', args: {} },
                client: rawClient,
            });
            expect(r.status).toBe(400);
            expect(r.error.message).toMatch(/non-empty array/i);
        });

        it('rejects unknown model in operation', async () => {
            const handleRequest = makeHandler();

            const r = await handleRequest({
                method: 'post',
                path: '/$transaction/sequential',
                requestBody: [{ model: 'Ghost', op: 'create', args: { data: {} } }],
                client: rawClient,
            });
            expect(r.status).toBe(400);
            expect(r.error.message).toMatch(/unknown model/i);
        });

        it('rejects invalid op in operation', async () => {
            const handleRequest = makeHandler();

            const r = await handleRequest({
                method: 'post',
                path: '/$transaction/sequential',
                requestBody: [{ model: 'User', op: 'dropTable', args: {} }],
                client: rawClient,
            });
            expect(r.status).toBe(400);
            expect(r.error.message).toMatch(/invalid op/i);
        });

        it('rejects operation missing model or op field', async () => {
            const handleRequest = makeHandler();

            let r = await handleRequest({
                method: 'post',
                path: '/$transaction/sequential',
                requestBody: [{ op: 'create', args: { data: {} } }],
                client: rawClient,
            });
            expect(r.status).toBe(400);
            expect(r.error.message).toMatch(/"model"/i);

            r = await handleRequest({
                method: 'post',
                path: '/$transaction/sequential',
                requestBody: [{ model: 'User', args: { data: {} } }],
                client: rawClient,
            });
            expect(r.status).toBe(400);
            expect(r.error.message).toMatch(/"op"/i);
        });

        it('returns error for invalid args (non-existent field in where clause)', async () => {
            const handleRequest = makeHandler();

            // findMany with a non-existent field in where → ORM validation error
            let r = await handleRequest({
                method: 'post',
                path: '/$transaction/sequential',
                requestBody: [
                    {
                        model: 'User',
                        op: 'findMany',
                        args: { where: { nonExistentField: 'value' } },
                    },
                ],
                client: rawClient,
            });
            expect(r.status).toBe(422);
            expect(r.error.message).toMatch(/validation error/i);

            // findUnique missing required where clause → ORM validation error
            r = await handleRequest({
                method: 'post',
                path: '/$transaction/sequential',
                requestBody: [
                    {
                        model: 'Post',
                        op: 'findUnique',
                        args: {},
                    },
                ],
                client: rawClient,
            });
            expect(r.status).toBe(422);
            expect(r.error.message).toMatch(/validation error/i);

            // create with missing required field → ORM validation error
            r = await handleRequest({
                method: 'post',
                path: '/$transaction/sequential',
                requestBody: [
                    {
                        model: 'Post',
                        op: 'create',
                        // title is required but omitted
                        args: { data: {} },
                    },
                ],
                client: rawClient,
            });
            expect(r.status).toBe(422);
            expect(r.error.message).toMatch(/validation error/i);
        });

        it('deserializes SuperJSON-encoded args per operation', async () => {
            const handleRequest = makeHandler();

            // Clean up
            await rawClient.post.deleteMany();
            await rawClient.user.deleteMany();

            // Serialize args containing a Date so they need SuperJSON deserialization
            const publishedAt = new Date('2025-01-15T00:00:00.000Z');
            const serialized = SuperJSON.serialize({
                data: { id: 'txuser3', email: 'txuser3@abc.com' },
            });
            const serializedPost = SuperJSON.serialize({
                data: { id: 'txpost3', title: 'Dated Post', authorId: 'txuser3', publishedAt },
            });

            const r = await handleRequest({
                method: 'post',
                path: '/$transaction/sequential',
                requestBody: [
                    {
                        model: 'User',
                        op: 'create',
                        args: { ...(serialized.json as any), meta: { serialization: serialized.meta } },
                    },
                    {
                        model: 'Post',
                        op: 'create',
                        args: { ...(serializedPost.json as any), meta: { serialization: serializedPost.meta } },
                    },
                ],
                client: rawClient,
            });

            expect(r.status).toBe(200);
            expect(r.data).toHaveLength(2);
            expect(r.data[0]).toMatchObject({ id: 'txuser3' });
            expect(r.data[1]).toMatchObject({ id: 'txpost3' });

            // Verify the Date was stored correctly
            const post = await (rawClient as any).post.findUnique({ where: { id: 'txpost3' } });
            expect(post?.publishedAt instanceof Date).toBe(true);
            expect((post?.publishedAt as Date)?.toISOString()).toBe(publishedAt.toISOString());

            // Clean up
            await rawClient.post.deleteMany();
            await rawClient.user.deleteMany();
        });

        it('rolls back all operations when one fails', async () => {
            const handleRequest = makeHandler();

            // Ensure no users before
            await rawClient.user.deleteMany();

            const r = await handleRequest({
                method: 'post',
                path: '/$transaction/sequential',
                requestBody: [
                    {
                        model: 'User',
                        op: 'create',
                        args: { data: { id: 'txuser2', email: 'txuser2@abc.com' } },
                    },
                    // duplicate id will cause a DB error → whole tx rolls back
                    {
                        model: 'User',
                        op: 'create',
                        args: { data: { id: 'txuser2', email: 'txuser2@abc.com' } },
                    },
                ],
                client: rawClient,
            });
            expect(r.status).toBeGreaterThanOrEqual(400);

            // User should not have been committed
            const count = await rawClient.user.count();
            expect(count).toBe(0);
        });
    });

    function makeHandler() {
        const handler = new RPCApiHandler({ schema: client.$schema });
        return async (args: any) => {
            const r = await handler.handleRequest({
                ...args,
                url: new URL(`http://localhost/${args.path}`),
            });
            return {
                status: r.status,
                body: r.body as any,
                data: (r.body as any).data,
                error: (r.body as any).error,
                meta: (r.body as any).meta,
            };
        };
    }
});
