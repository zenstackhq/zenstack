/* eslint-disable @typescript-eslint/no-explicit-any */
/// <reference types="@types/jest" />

import { CrudFailureReason, type ZodSchemas } from '@zenstackhq/runtime';
import { loadSchema } from '@zenstackhq/testtools';
import { Decimal } from 'decimal.js';
import SuperJSON from 'superjson';
import RPCAPIHandler from '../../src/api/rpc';
import { schema } from '../utils';

describe('RPC API Handler Tests', () => {
    let prisma: any;
    let enhance: any;
    let modelMeta: any;
    let zodSchemas: any;

    beforeAll(async () => {
        const params = await loadSchema(schema, { fullZod: true });
        prisma = params.prisma;
        enhance = params.enhance;
        modelMeta = params.modelMeta;
        zodSchemas = params.zodSchemas;
    });

    it('crud', async () => {
        const handleRequest = makeHandler();

        let r = await handleRequest({
            method: 'get',
            path: '/post/findMany',
            prisma,
        });
        expect(r.status).toBe(200);
        expect(r.data).toHaveLength(0);

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
            prisma,
        });
        expect(r.status).toBe(201);
        expect(r.data).toEqual(
            expect.objectContaining({
                email: 'user1@abc.com',
                posts: expect.arrayContaining([
                    expect.objectContaining({ title: 'post1' }),
                    expect.objectContaining({ title: 'post2' }),
                ]),
            })
        );

        r = await handleRequest({
            method: 'get',
            path: '/post/findMany',
            prisma,
        });
        expect(r.status).toBe(200);
        expect(r.data).toHaveLength(2);

        r = await handleRequest({
            method: 'get',
            path: '/post/findMany',
            query: { q: JSON.stringify({ where: { viewCount: { gt: 1 } } }) },
            prisma,
        });
        expect(r.status).toBe(200);
        expect(r.data).toHaveLength(1);

        r = await handleRequest({
            method: 'put',
            path: '/user/update',
            requestBody: { where: { id: 'user1' }, data: { email: 'user1@def.com' } },
            prisma,
        });
        expect(r.status).toBe(200);
        expect(r.data.email).toBe('user1@def.com');

        r = await handleRequest({
            method: 'get',
            path: '/post/count',
            query: { q: JSON.stringify({ where: { viewCount: { gt: 1 } } }) },
            prisma,
        });
        expect(r.status).toBe(200);
        expect(r.data).toBe(1);

        r = await handleRequest({
            method: 'get',
            path: '/post/aggregate',
            query: { q: JSON.stringify({ _sum: { viewCount: true } }) },
            prisma,
        });
        expect(r.status).toBe(200);
        expect(r.data._sum.viewCount).toBe(3);

        r = await handleRequest({
            method: 'get',
            path: '/post/groupBy',
            query: { q: JSON.stringify({ by: ['published'], _sum: { viewCount: true } }) },
            prisma,
        });
        expect(r.status).toBe(200);
        expect(r.data).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ published: true, _sum: { viewCount: 1 } }),
                expect.objectContaining({ published: false, _sum: { viewCount: 2 } }),
            ])
        );

        r = await handleRequest({
            method: 'delete',
            path: '/user/deleteMany',
            query: { q: JSON.stringify({ where: { id: 'user1' } }) },
            prisma,
        });
        expect(r.status).toBe(200);
        expect(r.data.count).toBe(1);
    });

    it('policy violation', async () => {
        await prisma.user.create({
            data: {
                id: '1',
                email: 'user1@abc.com',
                posts: { create: { id: '1', title: 'post1', published: true } },
            },
        });

        const handleRequest = makeHandler();

        const r = await handleRequest({
            method: 'put',
            path: '/post/update',
            requestBody: {
                where: { id: '1' },
                data: { title: 'post2' },
            },
            prisma: enhance(),
        });
        expect(r.status).toBe(403);
        expect(r.error.rejectedByPolicy).toBeTruthy();
        expect(r.error.reason).toBe(CrudFailureReason.ACCESS_POLICY_VIOLATION);
    });

    it('validation error', async () => {
        let handleRequest = makeHandler();

        // without validation
        let r = await handleRequest({
            method: 'get',
            path: '/post/findUnique',
            prisma,
        });
        expect(r.status).toBe(400);
        expect(r.error.message).toMatch(/Argument.+missing/);

        handleRequest = makeHandler(zodSchemas);

        // with validation
        r = await handleRequest({
            method: 'get',
            path: '/post/findUnique',
            prisma,
        });
        expect(r.status).toBe(400);
        expect(r.error.message).toContain('Validation error');
        expect(r.error.message).toContain('where');

        r = await handleRequest({
            method: 'post',
            path: '/post/create',
            requestBody: { data: {} },
            prisma,
            zodSchemas,
        });
        expect(r.status).toBe(400);
        expect(r.error.message).toContain('Validation error');
        expect(r.error.message).toContain('data');
    });

    it('invalid path or args', async () => {
        const handleRequest = makeHandler();
        let r = await handleRequest({
            method: 'get',
            path: '/post/',
            prisma,
        });
        expect(r.status).toBe(400);
        expect(r.error.message).toContain('invalid request path');

        r = await handleRequest({
            method: 'get',
            path: '/post/findMany/abc',
            prisma,
        });
        expect(r.status).toBe(400);
        expect(r.error.message).toContain('invalid request path');

        r = await handleRequest({
            method: 'get',
            path: '/post/findUnique',
            query: { q: 'abc' },
            prisma,
        });
        expect(r.status).toBe(400);
        expect(r.error.message).toContain('invalid "q" query parameter');

        r = await handleRequest({
            method: 'delete',
            path: '/post/deleteMany',
            query: { q: 'abc' },
            prisma,
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
            bytes Bytes
            bars Bar[]
        
            @@allow('all', true)
        }


        model Bar {
            id Int @id @default(autoincrement())
            bytes Bytes
            foo Foo @relation(fields: [fooId], references: [id])
            fooId Int @unique
        }    
        `;

        const handleRequest = makeHandler();
        const { prisma, zodSchemas, modelMeta } = await loadSchema(schema);

        const decimalValue = new Decimal('0.046875');
        const bigIntValue = BigInt(534543543534);
        const dateValue = new Date();
        const bufferValue = Buffer.from([1, 2, 3, 4]);
        const barBufferValue = Buffer.from([7, 8, 9]);

        const createData = {
            string: 'string',
            int: 123,
            bigInt: bigIntValue,
            date: dateValue,
            float: 1.23,
            decimal: decimalValue,
            boolean: true,
            bytes: bufferValue,
            bars: {
                create: { bytes: barBufferValue },
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
            prisma,
            zodSchemas,
            modelMeta,
            requestBody: {
                ...(serialized.json as any),
                meta: { serialization: serialized.meta },
            },
        });
        expect(r.status).toBe(201);
        expect(r.meta).toBeTruthy();
        const data: any = SuperJSON.deserialize({ json: r.data, meta: r.meta.serialization });
        expect(typeof data.bigInt).toBe('bigint');
        expect(Buffer.isBuffer(data.bytes)).toBeTruthy();
        expect(data.date instanceof Date).toBeTruthy();
        expect(Decimal.isDecimal(data.decimal)).toBeTruthy();
        expect(Buffer.isBuffer(data.bars[0].bytes)).toBeTruthy();

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
            prisma,
            zodSchemas,
            modelMeta,
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
            prisma,
            zodSchemas,
            modelMeta,
        });
        expect(r.status).toBe(200);
        expect(r.data).toBeTruthy();

        // find with filter found
        const serializedQ2 = SuperJSON.serialize({
            where: {
                bars: {
                    some: {
                        bytes: barBufferValue,
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
            prisma,
            zodSchemas,
            modelMeta,
        });
        expect(r.status).toBe(200);
        expect(r.data).toBeTruthy();

        // find with filter not found
        const serializedQ3 = SuperJSON.serialize({
            where: {
                bars: {
                    none: {
                        bytes: barBufferValue,
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
            prisma,
            zodSchemas,
            modelMeta,
        });
        expect(r.status).toBe(200);
        expect(r.data).toBeNull();
    });

    function makeHandler(zodSchemas?: ZodSchemas) {
        const _handler = RPCAPIHandler();
        return async (args: any) => {
            const r = await _handler({ ...args, url: new URL(`http://localhost/${args.path}`), modelMeta, zodSchemas });
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
