import { ClientContract } from '@zenstackhq/orm';
import { SchemaDef } from '@zenstackhq/orm/schema';
import { createPolicyTestClient, createTestClient } from '@zenstackhq/testtools';
import { Decimal } from 'decimal.js';
import SuperJSON from 'superjson';
import { beforeEach, describe, expect, it } from 'vitest';
import { RestApiHandler } from '../../src/api/rest';

const idDivider = '_';

describe('REST server tests', () => {
    let client: ClientContract<SchemaDef>;
    let handler: (any: any) => Promise<{ status: number; body: any }>;

    describe('REST server tests - regular client', () => {
        const schema = `
    type Address {
        city String
    }

    model User {
        myId String @id @default(cuid())
        createdAt DateTime @default (now())
        updatedAt DateTime @updatedAt
        email String @unique @email
        posts Post[]
        likes PostLike[]
        profile Profile?
        address Address? @json
        someJson Json?
    }
    
    model Profile {
        id Int @id @default(autoincrement())
        gender String
        user User @relation(fields: [userId], references: [myId])
        userId String @unique
    }
    
    model Post {
        id Int @id @default(autoincrement())
        createdAt DateTime @default (now())
        updatedAt DateTime @updatedAt
        title String @length(1, 10)
        author User? @relation(fields: [authorId], references: [myId])
        authorId String?
        published Boolean @default(false)
        publishedAt DateTime?
        viewCount Int @default(0)
        comments Comment[]
        likes PostLike[]
        setting Setting?
    }
    
    model Comment {
        id Int @id @default(autoincrement())
        post Post @relation(fields: [postId], references: [id])
        postId Int
        content String
    }
    
    model Setting {
        id Int @id @default(autoincrement())
        boost Int
        post Post @relation(fields: [postId], references: [id])
        postId Int @unique
    }

    model PostLike {
        postId Int
        userId String
        superLike Boolean
        post Post @relation(fields: [postId], references: [id])
        user User @relation(fields: [userId], references: [myId])
        likeInfos PostLikeInfo[]
        @@id([postId, userId])
    }

    model PostLikeInfo {
        id Int @id @default(autoincrement())
        text String
        postId Int
        userId String
        postLike PostLike @relation(fields: [postId, userId], references: [postId, userId])
    }
    `;

        beforeEach(async () => {
            client = await createTestClient(schema);
            const _handler = new RestApiHandler({
                schema: client.$schema,
                endpoint: 'http://localhost/api',
                pageSize: 5,
            });
            handler = (args) => _handler.handleRequest({ ...args, url: new URL(`http://localhost/${args.path}`) });
        });

        describe('CRUD', () => {
            describe('GET', () => {
                it('invalid type, id, relationship', async () => {
                    let r = await handler({
                        method: 'get',
                        path: '/foo',
                        client,
                    });
                    expect(r.status).toBe(404);

                    r = await handler({
                        method: 'get',
                        path: '/user/user1/posts',
                        client,
                    });
                    expect(r.status).toBe(404);

                    await client.user.create({
                        data: {
                            myId: 'user1',
                            email: 'user1@abc.com',
                            posts: {
                                create: { title: 'Post1' },
                            },
                        },
                    });

                    r = await handler({
                        method: 'get',
                        path: '/user/user1/relationships/foo',
                        client,
                    });
                    expect(r.status).toBe(404);

                    r = await handler({
                        method: 'get',
                        path: '/user/user1/foo',
                        client,
                    });
                    expect(r.status).toBe(404);
                });

                it('returns an empty array when no item exists', async () => {
                    const r = await handler({
                        method: 'get',
                        path: '/user',
                        client,
                    });

                    expect(r.status).toBe(200);
                    expect(r.body).toMatchObject({
                        data: [],
                        links: {
                            self: 'http://localhost/api/user',
                        },
                    });
                });

                it('returns all items when there are some in the database', async () => {
                    // Create users first
                    await client.user.create({
                        data: {
                            myId: 'user1',
                            email: 'user1@abc.com',
                            posts: {
                                create: { title: 'Post1' },
                            },
                        },
                    });
                    await client.user.create({
                        data: {
                            myId: 'user2',
                            email: 'user2@abc.com',
                            posts: {
                                create: { title: 'Post2' },
                            },
                        },
                    });

                    const r = await handler({
                        method: 'get',
                        path: '/user',
                        client,
                    });

                    expect(r.status).toBe(200);
                    expect(r.body).toMatchObject({
                        links: {
                            self: 'http://localhost/api/user',
                        },
                        meta: {
                            total: 2,
                        },
                        data: [
                            {
                                type: 'User',
                                id: 'user1',
                                attributes: { email: 'user1@abc.com' },
                                links: {
                                    self: 'http://localhost/api/user/user1',
                                },
                                relationships: {
                                    posts: {
                                        links: {
                                            self: 'http://localhost/api/user/user1/relationships/posts',
                                            related: 'http://localhost/api/user/user1/posts',
                                        },
                                        data: [{ type: 'Post', id: 1 }],
                                    },
                                },
                            },
                            {
                                type: 'User',
                                id: 'user2',
                                attributes: { email: 'user2@abc.com' },
                                links: {
                                    self: 'http://localhost/api/user/user2',
                                },
                                relationships: {
                                    posts: {
                                        links: {
                                            self: 'http://localhost/api/user/user2/relationships/posts',
                                            related: 'http://localhost/api/user/user2/posts',
                                        },
                                        data: [{ type: 'Post', id: 2 }],
                                    },
                                },
                            },
                        ],
                    });
                });

                it('returns a single item when the ID is specified', async () => {
                    // Create a user first
                    await client.user.create({
                        data: { myId: 'user1', email: 'user1@abc.com', posts: { create: { title: 'Post1' } } },
                    });

                    const r = await handler({
                        method: 'get',
                        path: '/user/user1',
                        client,
                    });

                    expect(r.status).toBe(200);
                    expect(r.body).toMatchObject({
                        data: {
                            type: 'User',
                            id: 'user1',
                            attributes: { email: 'user1@abc.com' },
                            links: {
                                self: 'http://localhost/api/user/user1',
                            },
                            relationships: {
                                posts: {
                                    links: {
                                        self: 'http://localhost/api/user/user1/relationships/posts',
                                        related: 'http://localhost/api/user/user1/posts',
                                    },
                                    data: [{ type: 'Post', id: 1 }],
                                },
                            },
                        },
                    });
                });

                it('fetch a related resource', async () => {
                    // Create a user first
                    await client.user.create({
                        data: {
                            myId: 'user1',
                            email: 'user1@abc.com',
                            posts: {
                                create: { id: 1, title: 'Post1' },
                            },
                        },
                    });

                    const r = await handler({
                        method: 'get',
                        path: '/user/user1/posts',
                        client,
                    });

                    expect(r.status).toBe(200);
                    expect(r.body).toMatchObject({
                        links: {
                            self: 'http://localhost/api/user/user1/posts',
                        },
                        data: [
                            {
                                type: 'Post',
                                id: 1,
                                attributes: {
                                    title: 'Post1',
                                    authorId: 'user1',
                                    published: false,
                                    viewCount: 0,
                                },
                                links: {
                                    self: 'http://localhost/api/post/1',
                                },
                                relationships: {
                                    author: {
                                        links: {
                                            self: 'http://localhost/api/post/1/relationships/author',
                                            related: 'http://localhost/api/post/1/author',
                                        },
                                    },
                                },
                            },
                        ],
                    });
                });

                it('returns an empty data array when loading empty related resources', async () => {
                    // Create a user first
                    await client.user.create({
                        data: { myId: 'user1', email: 'user1@abc.com' },
                    });

                    const r = await handler({
                        method: 'get',
                        path: '/user/user1',
                        client,
                    });

                    expect(r.status).toBe(200);
                    expect(r.body).toMatchObject({
                        data: {
                            type: 'User',
                            id: 'user1',
                            attributes: { email: 'user1@abc.com' },
                            links: {
                                self: 'http://localhost/api/user/user1',
                            },
                            relationships: {
                                posts: {
                                    links: {
                                        self: 'http://localhost/api/user/user1/relationships/posts',
                                        related: 'http://localhost/api/user/user1/posts',
                                    },
                                    data: [],
                                },
                            },
                        },
                    });
                });

                it('fetches a related resource with a compound ID', async () => {
                    await client.user.create({
                        data: {
                            myId: 'user1',
                            email: 'user1@abc.com',
                            posts: {
                                create: { id: 1, title: 'Post1' },
                            },
                        },
                    });
                    await client.postLike.create({
                        data: { postId: 1, userId: 'user1', superLike: true },
                    });

                    const r = await handler({
                        method: 'get',
                        path: '/post/1/relationships/likes',
                        client,
                    });

                    expect(r.status).toBe(200);
                    expect(r.body).toMatchObject({
                        links: {
                            self: 'http://localhost/api/post/1/relationships/likes',
                        },
                        data: [{ type: 'PostLike', id: `1${idDivider}user1` }],
                    });
                });

                it('fetch a relationship', async () => {
                    // Create a user first
                    await client.user.create({
                        data: {
                            myId: 'user1',
                            email: 'user1@abc.com',
                            posts: {
                                create: { id: 1, title: 'Post1' },
                            },
                        },
                    });

                    const r = await handler({
                        method: 'get',
                        path: '/user/user1/relationships/posts',
                        client,
                    });

                    expect(r.status).toBe(200);
                    expect(r.body).toMatchObject({
                        links: {
                            self: 'http://localhost/api/user/user1/relationships/posts',
                        },
                        data: [{ type: 'Post', id: 1 }],
                    });
                });

                it('returns 404 if the specified ID does not exist', async () => {
                    const r = await handler({
                        method: 'get',
                        path: '/user/nonexistentuser',
                        client,
                    });

                    expect(r.status).toBe(404);
                    expect(r.body).toEqual({
                        errors: [
                            {
                                code: 'not-found',
                                status: 404,
                                title: 'Resource not found',
                            },
                        ],
                    });
                });

                it('toplevel filtering', async () => {
                    const now = new Date();
                    const past = new Date(now.getTime() - 1);
                    await client.user.create({
                        data: {
                            myId: 'user1',
                            email: 'user1@abc.com',
                            address: { city: 'Seattle' },
                            someJson: 'foo',
                            posts: {
                                create: { id: 1, title: 'Post1' },
                            },
                        },
                    });
                    await client.user.create({
                        data: {
                            myId: 'user2',
                            email: 'user2@abc.com',
                            posts: {
                                create: { id: 2, title: 'Post2', viewCount: 1, published: true, publishedAt: now },
                            },
                        },
                    });

                    // id filter
                    let r = await handler({
                        method: 'get',
                        path: '/user',
                        query: { ['filter[id]']: 'user2' },
                        client,
                    });
                    expect(r.status).toBe(200);
                    expect(r.body.data).toHaveLength(1);
                    expect(r.body.data[0]).toMatchObject({ id: 'user2' });

                    // multi-id filter
                    r = await handler({
                        method: 'get',
                        path: '/user',
                        query: { ['filter[id]']: 'user1,user2' },
                        client,
                    });
                    expect(r.status).toBe(200);
                    expect(r.body.data).toHaveLength(2);

                    // String filter
                    r = await handler({
                        method: 'get',
                        path: '/user',
                        query: { ['filter[email]']: 'user1@abc.com' },
                        client,
                    });
                    expect(r.body.data).toHaveLength(1);
                    expect(r.body.data[0]).toMatchObject({ id: 'user1' });

                    r = await handler({
                        method: 'get',
                        path: '/user',
                        query: { ['filter[email$contains]']: '1@abc' },
                        client,
                    });
                    expect(r.body.data).toHaveLength(1);
                    expect(r.body.data[0]).toMatchObject({ id: 'user1' });

                    r = await handler({
                        method: 'get',
                        path: '/user',
                        query: { ['filter[email$contains]']: '1@bc' },
                        client,
                    });
                    expect(r.body.data).toHaveLength(0);

                    r = await handler({
                        method: 'get',
                        path: '/user',
                        query: { ['filter[email$startsWith]']: 'user1' },
                        client,
                    });
                    expect(r.body.data).toHaveLength(1);
                    expect(r.body.data[0]).toMatchObject({ id: 'user1' });

                    r = await handler({
                        method: 'get',
                        path: '/user',
                        query: { ['filter[email$startsWith]']: 'ser1' },
                        client,
                    });
                    expect(r.body.data).toHaveLength(0);

                    r = await handler({
                        method: 'get',
                        path: '/user',
                        query: { ['filter[email$endsWith]']: '1@abc.com' },
                        client,
                    });
                    expect(r.body.data).toHaveLength(1);
                    expect(r.body.data[0]).toMatchObject({ id: 'user1' });

                    r = await handler({
                        method: 'get',
                        path: '/user',
                        query: { ['filter[email$endsWith]']: '1@abc' },
                        client,
                    });
                    expect(r.body.data).toHaveLength(0);

                    r = await handler({
                        method: 'get',
                        path: '/user',
                        query: { ['filter[email$between]']: ',user1@abc.com' },
                        client,
                    });
                    expect(r.body.data).toHaveLength(1);

                    r = await handler({
                        method: 'get',
                        path: '/user',
                        query: { ['filter[email$between]']: 'user1@abc.com,' },
                        client,
                    });
                    expect(r.body.data).toHaveLength(0);

                    r = await handler({
                        method: 'get',
                        path: '/user',
                        query: { ['filter[email$between]']: ',user2@abc.com' },
                        client,
                    });
                    expect(r.body.data).toHaveLength(2);

                    r = await handler({
                        method: 'get',
                        path: '/user',
                        query: { ['filter[email$between]']: 'user1@abc.com,user2@abc.com' },
                        client,
                    });
                    expect(r.body.data).toHaveLength(2);

                    // Int filter
                    r = await handler({
                        method: 'get',
                        path: '/post',
                        query: { ['filter[viewCount]']: '1' },
                        client,
                    });
                    expect(r.body.data).toHaveLength(1);
                    expect(r.body.data[0]).toMatchObject({ id: 2 });

                    r = await handler({
                        method: 'get',
                        path: '/post',
                        query: { ['filter[viewCount$gt]']: '0' },
                        client,
                    });
                    expect(r.body.data).toHaveLength(1);
                    expect(r.body.data[0]).toMatchObject({ id: 2 });

                    r = await handler({
                        method: 'get',
                        path: '/post',
                        query: { ['filter[viewCount$gte]']: '1' },
                        client,
                    });
                    expect(r.body.data).toHaveLength(1);
                    expect(r.body.data[0]).toMatchObject({ id: 2 });

                    r = await handler({
                        method: 'get',
                        path: '/post',
                        query: { ['filter[viewCount$lt]']: '0' },
                        client,
                    });
                    expect(r.body.data).toHaveLength(0);

                    r = await handler({
                        method: 'get',
                        path: '/post',
                        query: { ['filter[viewCount$lte]']: '0' },
                        client,
                    });
                    expect(r.body.data).toHaveLength(1);
                    expect(r.body.data[0]).toMatchObject({ id: 1 });

                    r = await handler({
                        method: 'get',
                        path: '/post',
                        query: { ['filter[viewCount$between]']: '1,2' },
                        client,
                    });
                    expect(r.body.data).toHaveLength(1);
                    expect(r.body.data[0]).toMatchObject({ id: 2 });

                    r = await handler({
                        method: 'get',
                        path: '/post',
                        query: { ['filter[viewCount$between]']: '2,1' },
                        client,
                    });
                    expect(r.body.data).toHaveLength(0);

                    r = await handler({
                        method: 'get',
                        path: '/post',
                        query: { ['filter[viewCount$between]']: '0,2' },
                        client,
                    });
                    expect(r.body.data).toHaveLength(2);

                    // DateTime filter
                    r = await handler({
                        method: 'get',
                        path: '/post',
                        query: { ['filter[publishedAt$between]']: `${now.toISOString()},${now.toISOString()}` },
                        client,
                    });
                    expect(r.body.data).toHaveLength(1);
                    expect(r.body.data[0]).toMatchObject({ id: 2 });

                    r = await handler({
                        method: 'get',
                        path: '/post',
                        query: { ['filter[publishedAt$between]']: `${past.toISOString()},${now.toISOString()}` },
                        client,
                    });
                    expect(r.body.data).toHaveLength(1);
                    expect(r.body.data[0]).toMatchObject({ id: 2 });

                    r = await handler({
                        method: 'get',
                        path: '/post',
                        query: { ['filter[publishedAt$between]']: `${now.toISOString()},${past.toISOString()}` },
                        client,
                    });
                    expect(r.body.data).toHaveLength(0);

                    // Boolean filter
                    r = await handler({
                        method: 'get',
                        path: '/post',
                        query: { ['filter[published]']: 'true' },
                        client,
                    });
                    expect(r.body.data).toHaveLength(1);
                    expect(r.body.data[0]).toMatchObject({ id: 2 });

                    // deep to-one filter
                    r = await handler({
                        method: 'get',
                        path: '/post',
                        query: { ['filter[author][email]']: 'user1@abc.com' },
                        client,
                    });
                    expect(r.body.data).toHaveLength(1);

                    // deep to-many filter
                    r = await handler({
                        method: 'get',
                        path: '/user',
                        query: { ['filter[posts][published]']: 'true' },
                        client,
                    });
                    expect(r.body.data).toHaveLength(1);

                    // filter to empty
                    r = await handler({
                        method: 'get',
                        path: '/user',
                        query: { ['filter[id]']: 'user3' },
                        client,
                    });
                    expect(r.body.data).toHaveLength(0);

                    // to-many relation collection filter
                    r = await handler({
                        method: 'get',
                        path: '/user',
                        query: { ['filter[posts]']: '2' },
                        client,
                    });
                    expect(r.body.data).toHaveLength(1);
                    expect(r.body.data[0]).toMatchObject({ id: 'user2' });

                    r = await handler({
                        method: 'get',
                        path: '/user',
                        query: { ['filter[posts]']: '1,2,3' },
                        client,
                    });
                    expect(r.body.data).toHaveLength(2);

                    // multi filter
                    r = await handler({
                        method: 'get',
                        path: '/user',
                        query: { ['filter[id]']: 'user1', ['filter[posts]']: '2' },
                        client,
                    });
                    expect(r.body.data).toHaveLength(0);
                    r = await handler({
                        method: 'get',
                        path: '/post',
                        query: {
                            ['filter[author][email]']: 'user1@abc.com',
                            ['filter[title]']: 'Post1',
                        },
                        client,
                    });
                    expect(r.body.data).toHaveLength(1);
                    r = await handler({
                        method: 'get',
                        path: '/post',
                        query: {
                            ['filter[author][email]']: 'user1@abc.com',
                            ['filter[title]']: 'Post2',
                        },
                        client,
                    });
                    expect(r.body.data).toHaveLength(0);

                    // to-one relation filter
                    r = await handler({
                        method: 'get',
                        path: '/post',
                        query: { ['filter[author]']: 'user1' },
                        client,
                    });
                    expect(r.body.data).toHaveLength(1);
                    expect(r.body.data[0]).toMatchObject({ id: 1 });

                    // relation filter with multiple values
                    r = await handler({
                        method: 'get',
                        path: '/post',
                        query: { ['filter[author]']: 'user1,user2' },
                        client,
                    });
                    expect(r.body.data).toHaveLength(2);

                    // invalid filter field
                    r = await handler({
                        method: 'get',
                        path: '/user',
                        query: { ['filter[foo]']: '1' },
                        client,
                    });
                    expect(r.body).toMatchObject({
                        errors: [
                            {
                                status: 400,
                                code: 'invalid-filter',
                                title: 'Invalid filter',
                            },
                        ],
                    });

                    // invalid filter value
                    r = await handler({
                        method: 'get',
                        path: '/post',
                        query: { ['filter[viewCount]']: 'a' },
                        client,
                    });
                    expect(r.body).toMatchObject({
                        errors: [
                            {
                                status: 400,
                                code: 'invalid-value',
                                title: 'Invalid value for type',
                            },
                        ],
                    });

                    // invalid filter operation
                    r = await handler({
                        method: 'get',
                        path: '/user',
                        query: { ['filter[email$foo]']: '1' },
                        client,
                    });
                    expect(r.body).toMatchObject({
                        errors: [
                            {
                                status: 400,
                                code: 'invalid-filter',
                                title: 'Invalid filter',
                            },
                        ],
                    });

                    // TODO: JSON filter
                    // // typedef equality filter
                    // r = await handler({
                    //     method: 'get',
                    //     path: '/user',
                    //     query: { ['filter[address]']: JSON.stringify({ city: 'Seattle' }) },
                    //     client,
                    // });
                    // expect(r.body.data).toHaveLength(1);
                    // r = await handler({
                    //     method: 'get',
                    //     path: '/user',
                    //     query: { ['filter[address]']: JSON.stringify({ city: 'Tokyo' }) },
                    //     client,
                    // });
                    // expect(r.body.data).toHaveLength(0);

                    // // plain json equality filter
                    // r = await handler({
                    //     method: 'get',
                    //     path: '/user',
                    //     query: { ['filter[someJson]']: JSON.stringify('foo') },
                    //     client,
                    // });
                    // expect(r.body.data).toHaveLength(1);
                    // r = await handler({
                    //     method: 'get',
                    //     path: '/user',
                    //     query: { ['filter[someJson]']: JSON.stringify('bar') },
                    //     client,
                    // });
                    // expect(r.body.data).toHaveLength(0);

                    // // invalid json
                    // r = await handler({
                    //     method: 'get',
                    //     path: '/user',
                    //     query: { ['filter[someJson]']: '{ hello: world }' },
                    //     client,
                    // });
                    // expect(r.body).toMatchObject({
                    //     errors: [
                    //         {
                    //             status: 400,
                    //             code: 'invalid-value',
                    //             title: 'Invalid value for type',
                    //         },
                    //     ],
                    // });
                });

                it('related data filtering', async () => {
                    await client.user.create({
                        data: {
                            myId: 'user1',
                            email: 'user1@abc.com',
                            posts: {
                                create: { id: 1, title: 'Post1' },
                            },
                        },
                    });
                    await client.user.create({
                        data: {
                            myId: 'user2',
                            email: 'user2@abc.com',
                            posts: {
                                create: { id: 2, title: 'Post2', viewCount: 1, published: true },
                            },
                        },
                    });

                    let r = await handler({
                        method: 'get',
                        path: '/user/user1/posts',
                        query: { ['filter[viewCount]']: '1' },
                        client,
                    });
                    expect(r.body.data).toHaveLength(0);

                    r = await handler({
                        method: 'get',
                        path: '/user/user2/posts',
                        query: { ['filter[viewCount]']: '1' },
                        client,
                    });
                    expect(r.body.data).toHaveLength(1);
                });

                it('relationship filtering', async () => {
                    await client.user.create({
                        data: {
                            myId: 'user1',
                            email: 'user1@abc.com',
                            posts: {
                                create: { id: 1, title: 'Post1' },
                            },
                        },
                    });
                    await client.user.create({
                        data: {
                            myId: 'user2',
                            email: 'user2@abc.com',
                            posts: {
                                create: { id: 2, title: 'Post2', viewCount: 1, published: true },
                            },
                        },
                    });

                    let r = await handler({
                        method: 'get',
                        path: '/user/user1/relationships/posts',
                        query: { ['filter[viewCount]']: '1' },
                        client,
                    });
                    expect(r.body.data).toHaveLength(0);

                    r = await handler({
                        method: 'get',
                        path: '/user/user2/relationships/posts',
                        query: { ['filter[viewCount]']: '1' },
                        client,
                    });
                    expect(r.body.data).toHaveLength(1);
                });

                it('toplevel sorting', async () => {
                    await client.user.create({
                        data: {
                            myId: 'user1',
                            email: 'user1@abc.com',
                            posts: {
                                create: { id: 1, title: 'Post1', viewCount: 1, published: true },
                            },
                        },
                    });
                    await client.user.create({
                        data: {
                            myId: 'user2',
                            email: 'user2@abc.com',
                            posts: {
                                create: { id: 2, title: 'Post2', viewCount: 2, published: false },
                            },
                        },
                    });

                    // basic sorting
                    let r = await handler({
                        method: 'get',
                        path: '/post',
                        query: { sort: 'viewCount' },
                        client,
                    });
                    expect(r.status).toBe(200);
                    expect(r.body.data[0]).toMatchObject({ id: 1 });

                    // basic sorting desc
                    r = await handler({
                        method: 'get',
                        path: '/post',
                        query: { sort: '-viewCount' },
                        client,
                    });
                    expect(r.status).toBe(200);
                    expect(r.body.data[0]).toMatchObject({ id: 2 });

                    // by relation id
                    r = await handler({
                        method: 'get',
                        path: '/post',
                        query: { sort: '-author' },
                        client,
                    });
                    expect(r.status).toBe(200);
                    expect(r.body.data[0]).toMatchObject({ id: 2 });

                    // by relation field
                    r = await handler({
                        method: 'get',
                        path: '/post',
                        query: { sort: '-author.email' },
                        client,
                    });
                    expect(r.status).toBe(200);
                    expect(r.body.data[0]).toMatchObject({ id: 2 });

                    // multi-field sorting
                    r = await handler({
                        method: 'get',
                        path: '/post',
                        query: { sort: 'published,viewCount' },
                        client,
                    });
                    expect(r.status).toBe(200);
                    expect(r.body.data[0]).toMatchObject({ id: 2 });

                    r = await handler({
                        method: 'get',
                        path: '/post',
                        query: { sort: 'viewCount,published' },
                        client,
                    });
                    expect(r.status).toBe(200);
                    expect(r.body.data[0]).toMatchObject({ id: 1 });

                    r = await handler({
                        method: 'get',
                        path: '/post',
                        query: { sort: '-viewCount,-published' },
                        client,
                    });
                    expect(r.status).toBe(200);
                    expect(r.body.data[0]).toMatchObject({ id: 2 });

                    // invalid field
                    r = await handler({
                        method: 'get',
                        path: '/post',
                        query: { sort: 'foo' },
                        client,
                    });
                    expect(r.status).toBe(400);
                    expect(r.body).toMatchObject({
                        errors: [
                            {
                                status: 400,
                                code: 'invalid-sort',
                            },
                        ],
                    });

                    // sort with collection
                    r = await handler({
                        method: 'get',
                        path: '/post',
                        query: { sort: 'comments' },
                        client,
                    });
                    expect(r.status).toBe(400);
                    expect(r.body).toMatchObject({
                        errors: [
                            {
                                status: 400,
                                code: 'invalid-sort',
                            },
                        ],
                    });

                    // sort with regular field in the middle
                    r = await handler({
                        method: 'get',
                        path: '/post',
                        query: { sort: 'viewCount.foo' },
                        client,
                    });
                    expect(r.status).toBe(400);
                    expect(r.body).toMatchObject({
                        errors: [
                            {
                                status: 400,
                                code: 'invalid-sort',
                            },
                        ],
                    });
                });

                it('related data sorting', async () => {
                    await client.user.create({
                        data: {
                            myId: 'user1',
                            email: 'user1@abc.com',
                            posts: {
                                create: [
                                    {
                                        id: 1,
                                        title: 'Post1',
                                        viewCount: 1,
                                        published: true,
                                        setting: { create: { boost: 1 } },
                                    },
                                    {
                                        id: 2,
                                        title: 'Post2',
                                        viewCount: 2,
                                        published: false,
                                        setting: { create: { boost: 2 } },
                                    },
                                ],
                            },
                        },
                    });

                    // asc
                    let r = await handler({
                        method: 'get',
                        path: '/user/user1/posts',
                        query: { sort: 'viewCount' },
                        client,
                    });
                    expect(r.status).toBe(200);
                    expect(r.body.data[0]).toMatchObject({ id: 1 });

                    // desc
                    r = await handler({
                        method: 'get',
                        path: '/user/user1/posts',
                        query: { sort: '-viewCount' },
                        client,
                    });
                    expect(r.status).toBe(200);
                    expect(r.body.data[0]).toMatchObject({ id: 2 });

                    // relation field
                    r = await handler({
                        method: 'get',
                        path: '/user/user1/posts',
                        query: { sort: '-setting.boost' },
                        client,
                    });
                    expect(r.status).toBe(200);
                    expect(r.body.data[0]).toMatchObject({ id: 2 });
                });

                it('relationship sorting', async () => {
                    await client.user.create({
                        data: {
                            myId: 'user1',
                            email: 'user1@abc.com',
                            posts: {
                                create: [
                                    {
                                        id: 1,
                                        title: 'Post1',
                                        viewCount: 1,
                                        published: true,
                                        setting: { create: { boost: 1 } },
                                    },
                                    {
                                        id: 2,
                                        title: 'Post2',
                                        viewCount: 2,
                                        published: false,
                                        setting: { create: { boost: 2 } },
                                    },
                                ],
                            },
                        },
                    });

                    // asc
                    let r = await handler({
                        method: 'get',
                        path: '/user/user1/relationships/posts',
                        query: { sort: 'viewCount' },
                        client,
                    });
                    expect(r.status).toBe(200);
                    expect(r.body.data[0]).toMatchObject({ id: 1 });

                    // desc
                    r = await handler({
                        method: 'get',
                        path: '/user/user1/relationships/posts',
                        query: { sort: '-viewCount' },
                        client,
                    });
                    expect(r.status).toBe(200);
                    expect(r.body.data[0]).toMatchObject({ id: 2 });

                    // relation field
                    r = await handler({
                        method: 'get',
                        path: '/user/user1/relationships/posts',
                        query: { sort: '-setting.boost' },
                        client,
                    });
                    expect(r.status).toBe(200);
                    expect(r.body.data[0]).toMatchObject({ id: 2 });
                });

                it('including', async () => {
                    await client.user.create({
                        data: {
                            myId: 'user1',
                            email: 'user1@abc.com',
                            posts: {
                                create: { id: 1, title: 'Post1', comments: { create: { content: 'Comment1' } } },
                            },
                            profile: {
                                create: { gender: 'male' },
                            },
                        },
                    });
                    await client.user.create({
                        data: {
                            myId: 'user2',
                            email: 'user2@abc.com',
                            posts: {
                                create: {
                                    id: 2,
                                    title: 'Post2',
                                    viewCount: 1,
                                    published: true,
                                    comments: { create: { content: 'Comment2' } },
                                },
                            },
                        },
                    });

                    // collection query include
                    let r = await handler({
                        method: 'get',
                        path: '/user',
                        query: { include: 'posts' },
                        client,
                    });
                    expect(r.body.included).toHaveLength(2);
                    expect(r.body.included[0]).toMatchObject({
                        type: 'Post',
                        id: 1,
                        attributes: { title: 'Post1' },
                    });

                    // single query include
                    r = await handler({
                        method: 'get',
                        path: '/user/user1',
                        query: { include: 'posts' },
                        client,
                    });
                    expect(r.body.included).toHaveLength(1);
                    expect(r.body.included[0]).toMatchObject({
                        type: 'Post',
                        id: 1,
                        attributes: { title: 'Post1' },
                    });

                    // related query include
                    r = await handler({
                        method: 'get',
                        path: '/user/user1/posts',
                        query: { include: 'posts.comments' },
                        client,
                    });
                    expect(r.body.included).toHaveLength(1);
                    expect(r.body.included[0]).toMatchObject({
                        type: 'Comment',
                        attributes: { content: 'Comment1' },
                    });

                    // related query include with filter
                    r = await handler({
                        method: 'get',
                        path: '/user/user1/posts',
                        query: { include: 'posts.comments', ['filter[published]']: 'true' },
                        client,
                    });
                    expect(r.body.data).toHaveLength(0);

                    // deep include
                    r = await handler({
                        method: 'get',
                        path: '/user',
                        query: { include: 'posts.comments' },
                        client,
                    });
                    expect(r.body.included).toHaveLength(4);
                    expect(r.body.included[2]).toMatchObject({
                        type: 'Comment',
                        attributes: { content: 'Comment1' },
                    });

                    // multiple include
                    r = await handler({
                        method: 'get',
                        path: '/user',
                        query: { include: 'posts.comments,profile' },
                        client,
                    });
                    expect(r.body.included).toHaveLength(5);
                    const profile = r.body.included.find((item: any) => item.type === 'Profile');
                    expect(profile).toMatchObject({
                        type: 'Profile',
                        attributes: { gender: 'male' },
                    });

                    // invalid include
                    r = await handler({
                        method: 'get',
                        path: '/user',
                        query: { include: 'foo' },
                        client,
                    });
                    expect(r.status).toBe(400);
                    expect(r.body).toMatchObject({
                        errors: [{ status: 400, code: 'unsupported-relationship' }],
                    });
                });

                it('toplevel pagination', async () => {
                    for (const i of Array(5).keys()) {
                        await client.user.create({
                            data: {
                                myId: `user${i}`,
                                email: `user${i}@abc.com`,
                            },
                        });
                    }

                    // limit only
                    let r = await handler({
                        method: 'get',
                        path: '/user',
                        query: { ['page[limit]']: '3' },
                        client,
                    });
                    expect(r.body.data).toHaveLength(3);
                    expect(r.body.meta.total).toBe(5);
                    expect(r.body.links).toMatchObject({
                        first: 'http://localhost/api/user?page%5Blimit%5D=3',
                        last: 'http://localhost/api/user?page%5Boffset%5D=3',
                        prev: null,
                        next: 'http://localhost/api/user?page%5Boffset%5D=3&page%5Blimit%5D=3',
                    });

                    // limit & offset
                    r = await handler({
                        method: 'get',
                        path: '/user',
                        query: { ['page[limit]']: '3', ['page[offset]']: '3' },
                        client,
                    });
                    expect(r.body.data).toHaveLength(2);
                    expect(r.body.meta.total).toBe(5);
                    expect(r.body.links).toMatchObject({
                        first: 'http://localhost/api/user?page%5Blimit%5D=3',
                        last: 'http://localhost/api/user?page%5Boffset%5D=3',
                        prev: 'http://localhost/api/user?page%5Boffset%5D=0&page%5Blimit%5D=3',
                        next: null,
                    });

                    // limit trimmed
                    r = await handler({
                        method: 'get',
                        path: '/user',
                        query: { ['page[limit]']: '10' },
                        client,
                    });
                    expect(r.body.data).toHaveLength(5);
                    expect(r.body.links).toMatchObject({
                        first: 'http://localhost/api/user?page%5Blimit%5D=5',
                        last: 'http://localhost/api/user?page%5Boffset%5D=0',
                        prev: null,
                        next: null,
                    });

                    // offset overflow
                    r = await handler({
                        method: 'get',
                        path: '/user',
                        query: { ['page[offset]']: '10' },
                        client,
                    });
                    expect(r.body.data).toHaveLength(0);
                    expect(r.body.links).toMatchObject({
                        first: 'http://localhost/api/user?page%5Blimit%5D=5',
                        last: 'http://localhost/api/user?page%5Boffset%5D=0',
                        prev: null,
                        next: null,
                    });

                    // minus offset
                    r = await handler({
                        method: 'get',
                        path: '/user',
                        query: { ['page[offset]']: '-1' },
                        client,
                    });
                    expect(r.body.data).toHaveLength(5);
                    expect(r.body.links).toMatchObject({
                        first: 'http://localhost/api/user?page%5Blimit%5D=5',
                        last: 'http://localhost/api/user?page%5Boffset%5D=0',
                        prev: null,
                        next: null,
                    });

                    // zero limit
                    r = await handler({
                        method: 'get',
                        path: '/user',
                        query: { ['page[limit]']: '0' },
                        client,
                    });
                    expect(r.body.data).toHaveLength(5);
                    expect(r.body.links).toMatchObject({
                        first: 'http://localhost/api/user?page%5Blimit%5D=5',
                        last: 'http://localhost/api/user?page%5Boffset%5D=0',
                        prev: null,
                        next: null,
                    });
                });

                it('related data pagination', async () => {
                    await client.user.create({
                        data: {
                            myId: `user1`,
                            email: `user1@abc.com`,
                            posts: {
                                create: [...Array(10).keys()].map((i) => ({
                                    id: i + 1,
                                    title: `Post${i + 1}`,
                                })),
                            },
                        },
                    });

                    // default limiting
                    let r = await handler({
                        method: 'get',
                        path: '/user/user1/posts',
                        client,
                    });
                    expect(r.body.data).toHaveLength(5);
                    expect(r.body.links).toMatchObject({
                        self: 'http://localhost/api/user/user1/posts',
                        first: 'http://localhost/api/user/user1/posts?page%5Blimit%5D=5',
                        last: 'http://localhost/api/user/user1/posts?page%5Boffset%5D=5',
                        prev: null,
                        next: 'http://localhost/api/user/user1/posts?page%5Boffset%5D=5&page%5Blimit%5D=5',
                    });

                    // explicit limiting
                    r = await handler({
                        method: 'get',
                        path: '/user/user1/posts',
                        query: { ['page[limit]']: '3' },
                        client,
                    });
                    expect(r.body.data).toHaveLength(3);
                    expect(r.body.links).toMatchObject({
                        self: 'http://localhost/api/user/user1/posts',
                        first: 'http://localhost/api/user/user1/posts?page%5Blimit%5D=3',
                        last: 'http://localhost/api/user/user1/posts?page%5Boffset%5D=9',
                        prev: null,
                        next: 'http://localhost/api/user/user1/posts?page%5Boffset%5D=3&page%5Blimit%5D=3',
                    });

                    // offset
                    r = await handler({
                        method: 'get',
                        path: '/user/user1/posts',
                        query: { ['page[limit]']: '3', ['page[offset]']: '8' },
                        client,
                    });
                    expect(r.body.data).toHaveLength(2);
                    expect(r.body.links).toMatchObject({
                        self: 'http://localhost/api/user/user1/posts',
                        first: 'http://localhost/api/user/user1/posts?page%5Blimit%5D=3',
                        last: 'http://localhost/api/user/user1/posts?page%5Boffset%5D=9',
                        prev: 'http://localhost/api/user/user1/posts?page%5Boffset%5D=5&page%5Blimit%5D=3',
                        next: null,
                    });
                });

                it('relationship pagination', async () => {
                    await client.user.create({
                        data: {
                            myId: `user1`,
                            email: `user1@abc.com`,
                            posts: {
                                create: [...Array(10).keys()].map((i) => ({
                                    id: i + 1,
                                    title: `Post${i + 1}`,
                                })),
                            },
                        },
                    });

                    // default limiting
                    let r = await handler({
                        method: 'get',
                        path: '/user/user1/relationships/posts',
                        client,
                    });
                    expect(r.body.data).toHaveLength(5);
                    expect(r.body.links).toMatchObject({
                        self: 'http://localhost/api/user/user1/relationships/posts',
                        first: 'http://localhost/api/user/user1/relationships/posts?page%5Blimit%5D=5',
                        last: 'http://localhost/api/user/user1/relationships/posts?page%5Boffset%5D=5',
                        prev: null,
                        next: 'http://localhost/api/user/user1/relationships/posts?page%5Boffset%5D=5&page%5Blimit%5D=5',
                    });

                    // explicit limiting
                    r = await handler({
                        method: 'get',
                        path: '/user/user1/relationships/posts',
                        query: { ['page[limit]']: '3' },
                        client,
                    });
                    expect(r.body.data).toHaveLength(3);
                    expect(r.body.links).toMatchObject({
                        self: 'http://localhost/api/user/user1/relationships/posts',
                        first: 'http://localhost/api/user/user1/relationships/posts?page%5Blimit%5D=3',
                        last: 'http://localhost/api/user/user1/relationships/posts?page%5Boffset%5D=9',
                        prev: null,
                        next: 'http://localhost/api/user/user1/relationships/posts?page%5Boffset%5D=3&page%5Blimit%5D=3',
                    });

                    // offset
                    r = await handler({
                        method: 'get',
                        path: '/user/user1/relationships/posts',
                        query: { ['page[limit]']: '3', ['page[offset]']: '8' },
                        client,
                    });
                    expect(r.body.data).toHaveLength(2);
                    expect(r.body.links).toMatchObject({
                        self: 'http://localhost/api/user/user1/relationships/posts',
                        first: 'http://localhost/api/user/user1/relationships/posts?page%5Blimit%5D=3',
                        last: 'http://localhost/api/user/user1/relationships/posts?page%5Boffset%5D=9',
                        prev: 'http://localhost/api/user/user1/relationships/posts?page%5Boffset%5D=5&page%5Blimit%5D=3',
                        next: null,
                    });
                });

                describe('compound id', () => {
                    beforeEach(async () => {
                        await client.user.create({
                            data: { myId: 'user1', email: 'user1@abc.com', posts: { create: { title: 'Post1' } } },
                        });
                        await client.user.create({
                            data: { myId: 'user2', email: 'user2@abc.com' },
                        });
                        await client.postLike.create({
                            data: { userId: 'user2', postId: 1, superLike: false },
                        });
                    });

                    it('get all', async () => {
                        const r = await handler({
                            method: 'get',
                            path: '/postLike',
                            client,
                        });

                        expect(r.status).toBe(200);
                        expect(r.body).toMatchObject({
                            data: [
                                {
                                    type: 'PostLike',
                                    id: `1${idDivider}user2`,
                                    attributes: { userId: 'user2', postId: 1, superLike: false },
                                },
                            ],
                        });
                    });

                    it('get single', async () => {
                        const r = await handler({
                            method: 'get',
                            path: `/postLike/1${idDivider}user2`, // Order of ids is same as in the model @@id
                            client,
                        });

                        expect(r.status).toBe(200);
                        expect(r.body).toMatchObject({
                            data: {
                                type: 'PostLike',
                                id: `1${idDivider}user2`,
                                attributes: { userId: 'user2', postId: 1, superLike: false },
                            },
                        });
                    });

                    it('get as relationship', async () => {
                        const r = await handler({
                            method: 'get',
                            path: `/post/1`,
                            query: { include: 'likes' },
                            client,
                        });

                        expect(r.status).toBe(200);
                        expect(r.body).toMatchObject({
                            data: {
                                relationships: {
                                    likes: {
                                        data: [{ type: 'PostLike', id: `1${idDivider}user2` }],
                                    },
                                },
                            },
                            included: [
                                expect.objectContaining({
                                    type: 'PostLike',
                                    id: '1_user2',
                                    attributes: {
                                        postId: 1,
                                        userId: 'user2',
                                        superLike: false,
                                    },
                                    links: {
                                        self: 'http://localhost/api/postLike/1_user2',
                                    },
                                }),
                            ],
                        });
                    });
                });
            });

            describe('POST', () => {
                it('creates an item without relation', async () => {
                    const r = await handler({
                        method: 'post',
                        path: '/user',
                        query: {},
                        requestBody: {
                            data: { type: 'User', attributes: { myId: 'user1', email: 'user1@abc.com' } },
                        },
                        client,
                    });

                    expect(r.status).toBe(201);
                    expect(r.body).toMatchObject({
                        jsonapi: { version: '1.1' },
                        data: {
                            type: 'User',
                            id: 'user1',
                            attributes: { email: 'user1@abc.com' },
                            relationships: {
                                posts: {
                                    links: {
                                        self: 'http://localhost/api/user/user1/relationships/posts',
                                        related: 'http://localhost/api/user/user1/posts',
                                    },
                                    data: [],
                                },
                            },
                            links: { self: 'http://localhost/api/user/user1' },
                        },
                    });
                });

                it('creates an item with date coercion', async () => {
                    const r = await handler({
                        method: 'post',
                        path: '/post',
                        query: {},
                        requestBody: {
                            data: {
                                type: 'Post',
                                attributes: {
                                    id: 1,
                                    title: 'Post1',
                                    published: true,
                                    publishedAt: '2024-03-02T05:00:00.000Z',
                                },
                            },
                        },
                        client,
                    });

                    expect(r.status).toBe(201);
                });

                it('creates an item with zod violation', async () => {
                    const r = await handler({
                        method: 'post',
                        path: '/post',
                        query: {},
                        requestBody: {
                            data: {
                                type: 'Post',
                                attributes: {
                                    id: 1,
                                    title: 'a very very long long title',
                                },
                            },
                        },
                        client,
                    });

                    expect(r.status).toBe(422);
                    expect(r.body.errors[0].code).toBe('validation-error');
                });

                it('creates an item with collection relations', async () => {
                    await client.post.create({
                        data: { id: 1, title: 'Post1' },
                    });
                    await client.post.create({
                        data: { id: 2, title: 'Post2' },
                    });

                    const r = await handler({
                        method: 'post',
                        path: '/user',
                        query: {},
                        requestBody: {
                            data: {
                                type: 'User',
                                attributes: { myId: 'user1', email: 'user1@abc.com' },
                                relationships: {
                                    posts: {
                                        data: [
                                            { type: 'Post', id: 1 },
                                            { type: 'Post', id: 2 },
                                        ],
                                    },
                                },
                            },
                        },
                        client,
                    });

                    expect(r.status).toBe(201);
                    expect(r.body).toMatchObject({
                        jsonapi: { version: '1.1' },
                        data: {
                            type: 'User',
                            id: 'user1',
                            attributes: {
                                email: 'user1@abc.com',
                            },
                            links: {
                                self: 'http://localhost/api/user/user1',
                            },
                            relationships: {
                                posts: {
                                    links: {
                                        self: 'http://localhost/api/user/user1/relationships/posts',
                                        related: 'http://localhost/api/user/user1/posts',
                                    },
                                    data: [
                                        { type: 'Post', id: 1 },
                                        { type: 'Post', id: 2 },
                                    ],
                                },
                            },
                        },
                    });
                });

                it('creates an item with single relation', async () => {
                    await client.user.create({
                        data: { myId: 'user1', email: 'user1@abc.com' },
                    });

                    const r = await handler({
                        method: 'post',
                        path: '/post',
                        query: {},
                        requestBody: {
                            data: {
                                type: 'Post',
                                attributes: { title: 'Post1' },
                                relationships: {
                                    author: {
                                        data: { type: 'User', id: 'user1' },
                                    },
                                },
                            },
                        },
                        client,
                    });

                    expect(r.status).toBe(201);
                    expect(r.body).toMatchObject({
                        links: {
                            self: 'http://localhost/api/post/1',
                        },
                        data: {
                            type: 'Post',
                            id: 1,
                            attributes: {
                                title: 'Post1',
                                authorId: 'user1',
                                published: false,
                                viewCount: 0,
                            },
                            links: {
                                self: 'http://localhost/api/post/1',
                            },
                            relationships: {
                                author: {
                                    links: {
                                        self: 'http://localhost/api/post/1/relationships/author',
                                        related: 'http://localhost/api/post/1/author',
                                    },
                                    data: { type: 'User', id: 'user1' },
                                },
                            },
                        },
                    });
                });

                it('create single relation disallowed', async () => {
                    await client.user.create({ data: { myId: 'user1', email: 'user1@abc.com' } });
                    await client.post.create({
                        data: { id: 1, title: 'Post1' },
                    });

                    const r = await handler({
                        method: 'post',
                        path: '/post/1/relationships/author',
                        query: {},
                        requestBody: {
                            data: { type: 'User', id: 'user1' },
                        },
                        client,
                    });

                    expect(r.status).toBe(400);
                    expect(r.body).toMatchObject({
                        errors: [
                            {
                                status: 400,
                                code: 'invalid-verb',
                                title: 'The HTTP verb is not supported',
                            },
                        ],
                    });
                });

                it('create a collection of relations', async () => {
                    await client.user.create({ data: { myId: 'user1', email: 'user1@abc.com' } });
                    await client.post.create({
                        data: { id: 1, title: 'Post1' },
                    });
                    await client.post.create({
                        data: { id: 2, title: 'Post2' },
                    });

                    const r = await handler({
                        method: 'post',
                        path: '/user/user1/relationships/posts',
                        query: {},
                        requestBody: {
                            data: [
                                { type: 'Post', id: 1 },
                                { type: 'Post', id: 2 },
                            ],
                        },
                        client,
                    });

                    expect(r.status).toBe(200);
                    expect(r.body).toMatchObject({
                        links: {
                            self: 'http://localhost/api/user/user1/relationships/posts',
                        },
                        data: [
                            { type: 'Post', id: 1 },
                            { type: 'Post', id: 2 },
                        ],
                    });
                });

                it('create relation for nonexistent entity', async () => {
                    let r = await handler({
                        method: 'post',
                        path: '/user/user1/relationships/posts',
                        query: {},
                        requestBody: {
                            data: [{ type: 'Post', id: 1 }],
                        },
                        client,
                    });

                    expect(r.status).toBe(404);

                    await client.user.create({
                        data: { myId: 'user1', email: 'user1@abc.com' },
                    });

                    r = await handler({
                        method: 'post',
                        path: '/user/user1/relationships/posts',
                        query: {},
                        requestBody: { data: [{ type: 'Post', id: 1 }] },
                        client,
                    });

                    expect(r.status).toBe(404);
                });

                it('create relation with compound id', async () => {
                    await client.user.create({ data: { myId: 'user1', email: 'user1@abc.com' } });
                    await client.post.create({ data: { id: 1, title: 'Post1' } });

                    const r = await handler({
                        method: 'post',
                        path: '/postLike',
                        query: {},
                        requestBody: {
                            data: {
                                type: 'postLike',
                                attributes: { userId: 'user1', postId: 1, superLike: false },
                            },
                        },
                        client,
                    });

                    expect(r.status).toBe(201);
                });

                it('compound id create single', async () => {
                    await client.user.create({ data: { myId: 'user1', email: 'user1@abc.com' } });
                    await client.post.create({
                        data: { id: 1, title: 'Post1' },
                    });

                    const r = await handler({
                        method: 'post',
                        path: '/postLike',
                        query: {},
                        requestBody: {
                            data: {
                                type: 'postLike',
                                id: `1${idDivider}user1`,
                                attributes: { userId: 'user1', postId: 1, superLike: false },
                            },
                        },
                        client,
                    });

                    expect(r.status).toBe(201);
                });

                it('create an entity related to an entity with compound id', async () => {
                    await client.user.create({ data: { myId: 'user1', email: 'user1@abc.com' } });
                    await client.post.create({ data: { id: 1, title: 'Post1' } });
                    await client.postLike.create({ data: { userId: 'user1', postId: 1, superLike: false } });

                    const r = await handler({
                        method: 'post',
                        path: '/postLikeInfo',
                        query: {},
                        requestBody: {
                            data: {
                                type: 'postLikeInfo',
                                attributes: { text: 'LikeInfo1' },
                                relationships: {
                                    postLike: {
                                        data: { type: 'postLike', id: `1${idDivider}user1` },
                                    },
                                },
                            },
                        },
                        client,
                    });

                    expect(r.status).toBe(201);
                });

                it('upsert a new entity', async () => {
                    const r = await handler({
                        method: 'post',
                        path: '/user',
                        query: {},
                        requestBody: {
                            data: {
                                type: 'User',
                                attributes: { myId: 'user1', email: 'user1@abc.com' },
                            },
                            meta: {
                                operation: 'upsert',
                                matchFields: ['myId'],
                            },
                        },
                        client,
                    });

                    expect(r.status).toBe(201);
                    expect(r.body).toMatchObject({
                        jsonapi: { version: '1.1' },
                        data: {
                            type: 'User',
                            id: 'user1',
                            attributes: { email: 'user1@abc.com' },
                            relationships: {
                                posts: {
                                    links: {
                                        self: 'http://localhost/api/user/user1/relationships/posts',
                                        related: 'http://localhost/api/user/user1/posts',
                                    },
                                    data: [],
                                },
                            },
                        },
                    });
                });

                it('upsert an existing entity', async () => {
                    await client.user.create({
                        data: { myId: 'user1', email: 'user1@abc.com' },
                    });

                    const r = await handler({
                        method: 'post',
                        path: '/user',
                        query: {},
                        requestBody: {
                            data: {
                                type: 'User',
                                attributes: { myId: 'user1', email: 'user2@abc.com' },
                            },
                            meta: {
                                operation: 'upsert',
                                matchFields: ['myId'],
                            },
                        },
                        client,
                    });

                    expect(r.status).toBe(201);
                    expect(r.body).toMatchObject({
                        jsonapi: { version: '1.1' },
                        data: {
                            type: 'User',
                            id: 'user1',
                            attributes: { email: 'user2@abc.com' },
                        },
                    });
                });

                it('upsert fails if matchFields are not unique', async () => {
                    await client.user.create({
                        data: { myId: 'user1', email: 'user1@abc.com' },
                    });

                    const r = await handler({
                        method: 'post',
                        path: '/profile',
                        query: {},
                        requestBody: {
                            data: {
                                type: 'profile',
                                attributes: { gender: 'male' },
                                relationships: {
                                    user: {
                                        data: { type: 'User', id: 'user1' },
                                    },
                                },
                            },
                            meta: {
                                operation: 'upsert',
                                matchFields: ['gender'],
                            },
                        },
                        client,
                    });

                    expect(r.status).toBe(400);
                    expect(r.body).toMatchObject({
                        errors: [
                            {
                                status: 400,
                                code: 'invalid-payload',
                            },
                        ],
                    });
                });

                it('upsert works with compound id', async () => {
                    await client.user.create({ data: { myId: 'user1', email: 'user1@abc.com' } });
                    await client.post.create({ data: { id: 1, title: 'Post1' } });

                    const r = await handler({
                        method: 'post',
                        path: '/postLike',
                        query: {},
                        requestBody: {
                            data: {
                                type: 'postLike',
                                id: `1${idDivider}user1`,
                                attributes: { userId: 'user1', postId: 1, superLike: false },
                            },
                            meta: {
                                operation: 'upsert',
                                matchFields: ['userId', 'postId'],
                            },
                        },
                        client,
                    });

                    expect(r.status).toBe(201);
                });
            });

            describe('PUT', () => {
                it('updates an item if it exists', async () => {
                    await client.user.create({
                        data: {
                            myId: 'user1',
                            email: 'user1@abc.com',
                        },
                    });
                    await client.post.create({
                        data: { id: 1, title: 'Post1' },
                    });
                    await client.post.create({
                        data: { id: 2, title: 'Post2' },
                    });

                    const r = await handler({
                        method: 'put',
                        path: '/user/user1',
                        query: {},
                        requestBody: {
                            data: {
                                type: 'User',
                                attributes: { email: 'user2@abc.com' },
                                relationships: {
                                    posts: {
                                        data: [
                                            { type: 'Post', id: 1 },
                                            { type: 'Post', id: 2 },
                                        ],
                                    },
                                },
                            },
                        },
                        client,
                    });

                    expect(r.status).toBe(200);
                    expect(r.body).toMatchObject({
                        links: {
                            self: 'http://localhost/api/user/user1',
                        },
                        data: {
                            type: 'User',
                            id: 'user1',
                            attributes: {
                                email: 'user2@abc.com',
                            },
                            links: {
                                self: 'http://localhost/api/user/user1',
                            },
                            relationships: {
                                posts: {
                                    links: {
                                        self: 'http://localhost/api/user/user1/relationships/posts',
                                        related: 'http://localhost/api/user/user1/posts',
                                    },
                                    data: [
                                        { type: 'Post', id: 1 },
                                        { type: 'Post', id: 2 },
                                    ],
                                },
                            },
                        },
                    });
                });

                it("returns an empty data list in relationships if it's empty", async () => {
                    await client.user.create({
                        data: {
                            myId: 'user1',
                            email: 'user1@abc.com',
                        },
                    });

                    const r = await handler({
                        method: 'put',
                        path: '/user/user1',
                        query: {},
                        requestBody: {
                            data: {
                                type: 'User',
                                attributes: { email: 'user2@abc.com' },
                            },
                        },
                        client,
                    });

                    expect(r.status).toBe(200);
                    expect(r.body).toMatchObject({
                        links: {
                            self: 'http://localhost/api/user/user1',
                        },
                        data: {
                            type: 'User',
                            id: 'user1',
                            attributes: {
                                email: 'user2@abc.com',
                            },
                            links: {
                                self: 'http://localhost/api/user/user1',
                            },
                            relationships: {
                                posts: {
                                    links: {
                                        self: 'http://localhost/api/user/user1/relationships/posts',
                                        related: 'http://localhost/api/user/user1/posts',
                                    },
                                    data: [],
                                },
                            },
                        },
                    });
                });

                it('returns 404 if the user does not exist', async () => {
                    const r = await handler({
                        method: 'put',
                        path: '/user/nonexistentuser',
                        query: {},
                        requestBody: {
                            data: {
                                type: 'User',
                                attributes: { email: 'user2@abc.com' },
                            },
                        },
                        client,
                    });

                    expect(r.status).toBe(404);
                    expect(r.body).toEqual({
                        errors: [
                            expect.objectContaining({
                                code: 'not-found',
                                status: 404,
                                title: 'Resource not found',
                            }),
                        ],
                    });
                });

                it('update an item with date coercion', async () => {
                    await client.post.create({ data: { id: 1, title: 'Post1' } });

                    const r = await handler({
                        method: 'put',
                        path: '/post/1',
                        query: {},
                        requestBody: {
                            data: {
                                type: 'Post',
                                attributes: {
                                    published: true,
                                    publishedAt: '2024-03-02T05:00:00.000Z',
                                },
                            },
                        },
                        client,
                    });

                    expect(r.status).toBe(200);
                });

                it('update an item with zod violation', async () => {
                    await client.post.create({ data: { id: 1, title: 'Post1' } });

                    const r = await handler({
                        method: 'put',
                        path: '/post/1',
                        query: {},
                        requestBody: {
                            data: {
                                type: 'Post',
                                attributes: {
                                    publishedAt: '2024-13-01',
                                },
                            },
                        },
                        client,
                    });

                    expect(r.status).toBe(422);
                    expect(r.body.errors[0].code).toBe('validation-error');
                });

                it('update item with compound id', async () => {
                    await client.user.create({ data: { myId: 'user1', email: 'user1@abc.com' } });
                    await client.post.create({ data: { id: 1, title: 'Post1' } });
                    await client.postLike.create({ data: { userId: 'user1', postId: 1, superLike: false } });

                    const r = await handler({
                        method: 'put',
                        path: `/postLike/1${idDivider}user1`,
                        query: {},
                        requestBody: {
                            data: {
                                type: 'PostLike',
                                attributes: { superLike: true },
                            },
                        },
                        client,
                    });

                    expect(r.status).toBe(200);
                });

                it('update the id of an item with compound id', async () => {
                    await client.user.create({ data: { myId: 'user1', email: 'user1@abc.com' } });
                    await client.post.create({ data: { id: 1, title: 'Post1' } });
                    await client.post.create({ data: { id: 2, title: 'Post2' } });
                    await client.postLike.create({ data: { userId: 'user1', postId: 1, superLike: false } });

                    const r = await handler({
                        method: 'put',
                        path: `/postLike/1${idDivider}user1`,
                        query: {},
                        requestBody: {
                            data: {
                                type: 'PostLike',
                                relationships: {
                                    post: { data: { type: 'Post', id: 2 } },
                                },
                            },
                        },
                        client,
                    });

                    expect(r.status).toBe(200);
                    expect(r.body.data.id).toBe(`2${idDivider}user1`);
                });

                it('update a single relation', async () => {
                    await client.user.create({ data: { myId: 'user1', email: 'user1@abc.com' } });
                    await client.post.create({
                        data: { id: 1, title: 'Post1' },
                    });

                    const r = await handler({
                        method: 'patch',
                        path: '/post/1/relationships/author',
                        query: {},
                        requestBody: {
                            data: {
                                type: 'User',
                                id: 'user1',
                            },
                        },
                        client,
                    });

                    expect(r.status).toBe(200);
                    expect(r.body).toMatchObject({
                        jsonapi: {
                            version: '1.1',
                        },
                        links: {
                            self: 'http://localhost/api/post/1/relationships/author',
                        },
                        data: {
                            type: 'User',
                            id: 'user1',
                        },
                    });
                });

                it('remove a single relation', async () => {
                    await client.user.create({
                        data: { myId: 'user1', email: 'user1@abc.com', posts: { create: { id: 1, title: 'Post1' } } },
                    });

                    const r = await handler({
                        method: 'patch',
                        path: '/post/1/relationships/author',
                        query: {},
                        requestBody: { data: null },
                        client,
                    });

                    expect(r.status).toBe(200);
                    expect(r.body).toMatchObject({
                        links: {
                            self: 'http://localhost/api/post/1/relationships/author',
                        },
                        data: null,
                    });
                });

                it('update a collection of relations', async () => {
                    await client.user.create({
                        data: { myId: 'user1', email: 'user1@abc.com', posts: { create: { id: 1, title: 'Post1' } } },
                    });
                    await client.post.create({
                        data: { id: 2, title: 'Post2' },
                    });

                    const r = await handler({
                        method: 'patch',
                        path: '/user/user1/relationships/posts',
                        query: {},
                        requestBody: {
                            data: [{ type: 'Post', id: 2 }],
                        },
                        client,
                    });

                    expect(r.status).toBe(200);
                    expect(r.body).toMatchObject({
                        links: {
                            self: 'http://localhost/api/user/user1/relationships/posts',
                        },
                        data: [{ type: 'Post', id: 2 }],
                    });
                });

                it('update a collection of relations with compound id', async () => {
                    await client.user.create({ data: { myId: 'user1', email: 'user1@abc.com' } });
                    await client.post.create({ data: { id: 1, title: 'Post1' } });
                    await client.postLike.create({ data: { userId: 'user1', postId: 1, superLike: false } });

                    const r = await handler({
                        method: 'patch',
                        path: '/post/1/relationships/likes',
                        query: {},
                        requestBody: {
                            data: [{ type: 'PostLike', id: `1${idDivider}user1`, attributes: { superLike: true } }],
                        },
                        client,
                    });

                    expect(r.status).toBe(200);
                });

                it('update a collection of relations to empty', async () => {
                    await client.user.create({
                        data: { myId: 'user1', email: 'user1@abc.com', posts: { create: { id: 1, title: 'Post1' } } },
                    });

                    const r = await handler({
                        method: 'patch',
                        path: '/user/user1/relationships/posts',
                        query: {},
                        requestBody: { data: [] },
                        client,
                    });

                    expect(r.status).toBe(200);
                    expect(r.body).toMatchObject({
                        links: {
                            self: 'http://localhost/api/user/user1/relationships/posts',
                        },
                        data: [],
                    });
                });

                it('update relation for nonexistent entity', async () => {
                    let r = await handler({
                        method: 'patch',
                        path: '/post/1/relationships/author',
                        query: {},
                        requestBody: {
                            data: {
                                type: 'User',
                                id: 'user1',
                            },
                        },
                        client,
                    });
                    expect(r.status).toBe(404);

                    await client.post.create({
                        data: { id: 1, title: 'Post1' },
                    });

                    r = await handler({
                        method: 'patch',
                        path: '/post/1/relationships/author',
                        query: {},
                        requestBody: {
                            data: {
                                type: 'User',
                                id: 'user1',
                            },
                        },
                        client,
                    });

                    expect(r.status).toBe(404);
                });
            });

            describe('DELETE', () => {
                it('deletes an item if it exists', async () => {
                    // Create a user first
                    await client.user.create({
                        data: {
                            myId: 'user1',
                            email: 'user1@abc.com',
                        },
                    });

                    const r = await handler({
                        method: 'delete',
                        path: '/user/user1',
                        client,
                    });

                    expect(r.status).toBe(200);
                    expect(r.body).toMatchObject({ meta: {} });
                });

                it('deletes an item with compound id', async () => {
                    await client.user.create({
                        data: { myId: 'user1', email: 'user1@abc.com', posts: { create: { id: 1, title: 'Post1' } } },
                    });
                    await client.postLike.create({ data: { userId: 'user1', postId: 1, superLike: false } });

                    const r = await handler({
                        method: 'delete',
                        path: `/postLike/1${idDivider}user1`,
                        client,
                    });
                    expect(r.status).toBe(200);
                    expect(r.body).toMatchObject({ meta: {} });
                });

                it('returns 404 if the user does not exist', async () => {
                    const r = await handler({
                        method: 'delete',
                        path: '/user/nonexistentuser',
                        client,
                    });

                    expect(r.status).toBe(404);
                    expect(r.body).toEqual({
                        errors: [
                            expect.objectContaining({
                                code: 'not-found',
                                status: 404,
                                title: 'Resource not found',
                            }),
                        ],
                    });
                });

                it('delete single relation disallowed', async () => {
                    await client.user.create({
                        data: { myId: 'user1', email: 'user1@abc.com', posts: { create: { id: 1, title: 'Post1' } } },
                    });

                    const r = await handler({
                        method: 'delete',
                        path: '/post/1/relationships/author',
                        query: {},
                        client,
                    });

                    expect(r.status).toBe(400);
                    expect(r.body).toMatchObject({
                        errors: [
                            {
                                status: 400,
                                code: 'invalid-verb',
                                title: 'The HTTP verb is not supported',
                            },
                        ],
                    });
                });

                it('delete a collection of relations', async () => {
                    await client.user.create({
                        data: {
                            myId: 'user1',
                            email: 'user1@abc.com',
                            posts: {
                                create: [
                                    { id: 1, title: 'Post1' },
                                    { id: 2, title: 'Post2' },
                                ],
                            },
                        },
                    });

                    const r = await handler({
                        method: 'delete',
                        path: '/user/user1/relationships/posts',
                        query: {},
                        requestBody: {
                            data: [{ type: 'Post', id: 1 }],
                        },
                        client,
                    });

                    expect(r.status).toBe(200);
                    expect(r.body).toMatchObject({
                        jsonapi: {
                            version: '1.1',
                        },
                        links: {
                            self: 'http://localhost/api/user/user1/relationships/posts',
                        },
                        data: [{ type: 'Post', id: 2 }],
                    });
                });

                it('delete relations for nonexistent entity', async () => {
                    const r = await handler({
                        method: 'delete',
                        path: '/user/user1/relationships/posts',
                        query: {},
                        requestBody: {
                            data: [{ type: 'Post', id: 1 }],
                        },
                        client,
                    });
                    expect(r.status).toBe(404);
                });
            });

            describe('validation error', () => {
                it('creates an item without relation', async () => {
                    const r = await handler({
                        method: 'post',
                        path: '/user',
                        query: {},
                        requestBody: {
                            data: { type: 'User', attributes: { myId: 'user1', email: 'user1.com' } },
                        },
                        client,
                    });

                    expect(r.status).toBe(422);
                    expect(r.body.errors[0].code).toBe('validation-error');
                    expect(r.body.errors[0].detail).toContain('Invalid email');
                });
            });
        });
    });

    describe('REST server tests - access policy', () => {
        const schema = `
    model Foo {
        id Int @id
        value Int
    
        @@allow('create,read', true)
        @@allow('update', value > 0)
    }

    model Bar {
        id Int @id
        value Int

        @@allow('create', true)
    }
    `;

        beforeEach(async () => {
            client = await createPolicyTestClient(schema);

            const _handler = new RestApiHandler({
                schema: client.$schema,
                endpoint: 'http://localhost/api',
                pageSize: 5,
            });
            handler = (args) => _handler.handleRequest({ ...args, url: new URL(`http://localhost/${args.path}`) });
        });

        it('update policy rejection test', async () => {
            let r = await handler({
                method: 'post',
                path: '/foo',
                query: {},
                requestBody: {
                    data: { type: 'foo', attributes: { id: 1, value: 0 } },
                },
                client,
            });
            expect(r.status).toBe(201);

            r = await handler({
                method: 'put',
                path: '/foo/1',
                query: {},
                requestBody: {
                    data: { type: 'foo', attributes: { value: 1 } },
                },
                client,
            });
            expect(r.status).toBe(404);
            expect(r.body.errors[0].code).toBe('not-found');
        });

        it('read-back policy rejection test', async () => {
            const r = await handler({
                method: 'post',
                path: '/bar',
                query: {},
                requestBody: {
                    data: { type: 'bar', attributes: { id: 1, value: 0 } },
                },
                client,
            });
            expect(r.status).toBe(403);
            expect(r.body.errors[0].reason).toBe('cannot-read-back');
        });
    });

    describe('REST server tests - NextAuth project regression', () => {
        const schema = `
    model Post {
        id      String @id @default(cuid())
        title   String
        content String
    
        // full access for all
        @@allow('all', true)
    }
    
    model Account {
        id                String  @id @default(cuid())
        userId            String
        type              String
        provider          String
        providerAccountId String
        refresh_token     String?
        access_token      String?
        expires_at        Int?
        token_type        String?
        scope             String?
        id_token          String?
        session_state     String?
        user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)
    
        @@unique([provider, providerAccountId])
    }
    
    model Session {
        id           String   @id @default(cuid())
        sessionToken String   @unique
        userId       String
        expires      DateTime
        user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
    }
    
    model User {
        id            String    @id @default(cuid())
        name          String?
        email         String    @email @unique
        emailVerified DateTime?
        image         String?
        accounts      Account[]
        sessions      Session[]
    
        @@allow('create,read', true)
        @@allow('delete,update', auth() != null)
    }
    
    model VerificationToken {
        identifier String
        token      String   @unique
        expires    DateTime
    
        @@unique([identifier, token])
    }
    `;

        beforeEach(async () => {
            client = await createPolicyTestClient(schema);

            const _handler = new RestApiHandler({
                schema: client.$schema,
                endpoint: 'http://localhost/api',
                pageSize: 5,
            });
            handler = (args) => _handler.handleRequest({ ...args, url: new URL(`http://localhost/${args.path}`) });
        });

        it('crud test', async () => {
            let r = await handler({
                method: 'get',
                path: '/user',
                client,
            });
            expect(r.status).toBe(200);
            expect(r.body.data).toHaveLength(0);

            r = await handler({
                method: 'post',
                path: '/user',
                query: {},
                requestBody: {
                    data: { type: 'User', attributes: { email: 'user1@abc.com' } },
                },
                client,
            });
            expect(r.status).toBe(201);

            r = await handler({
                method: 'get',
                path: '/user',
                client,
            });
            expect(r.status).toBe(200);
            expect(r.body.data).toHaveLength(1);

            r = await handler({
                method: 'post',
                path: '/user',
                query: {},
                requestBody: {
                    data: { type: 'User', attributes: { email: 'user1@abc.com' } },
                },
                client,
            });
            expect(r.status).toBe(400);
            expect(r.body.errors[0].code).toBe('query-error');
        });
    });

    describe('REST server tests - field type coverage', () => {
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
    }

    model Bar {
        id Int @id
        bytes Bytes
        foo Foo? @relation(fields: [fooId], references: [id])
        fooId Int? @unique
    }
    `;

        it('field types', async () => {
            const client = await createTestClient(schema, { provider: 'postgresql' });

            const _handler = new RestApiHandler({
                schema: client.$schema,
                endpoint: 'http://localhost/api',
                pageSize: 5,
            });
            handler = (args) => _handler.handleRequest({ ...args, url: new URL(`http://localhost/${args.path}`) });

            await client.bar.create({ data: { id: 1, bytes: Buffer.from([7, 8, 9]) } });

            const decimalValue1 = new Decimal('0.046875');
            const decimalValue2 = new Decimal('0.0146875');

            const createAttrs = {
                string: 'string',
                int: 123,
                bigInt: BigInt(534543543534),
                date: new Date(),
                float: 1.23,
                decimal: decimalValue1,
                boolean: true,
                bytes: new Uint8Array([1, 2, 3, 4]),
            };

            const { json: createPayload, meta: createMeta } = SuperJSON.serialize({
                data: {
                    type: 'foo',
                    attributes: { id: 1, ...createAttrs },
                    relationships: {
                        bars: {
                            data: [{ type: 'bar', id: 1 }],
                        },
                    },
                },
            });

            let r = await handler({
                method: 'post',
                path: '/foo',
                query: {},
                requestBody: {
                    ...(createPayload as any),
                    meta: {
                        serialization: createMeta,
                    },
                },
                client,
            });
            expect(r.status).toBe(201);
            // result is serializable
            expect(JSON.stringify(r.body)).toBeTruthy();
            let serializationMeta = r.body.meta.serialization;
            expect(serializationMeta).toBeTruthy();
            let deserialized: any = SuperJSON.deserialize({ json: r.body, meta: serializationMeta });
            let data = deserialized.data.attributes;
            expect(typeof data.bigInt).toBe('bigint');
            expect(data.bytes).toBeInstanceOf(Uint8Array);
            expect(data.date instanceof Date).toBeTruthy();
            expect(Decimal.isDecimal(data.decimal)).toBeTruthy();

            const updateAttrs = {
                bigInt: BigInt(1534543543534),
                date: new Date(),
                decimal: decimalValue2,
                bytes: new Uint8Array([5, 2, 3, 4]),
            };
            const { json: updatePayload, meta: updateMeta } = SuperJSON.serialize({
                data: {
                    type: 'foo',
                    attributes: updateAttrs,
                },
            });

            r = await handler({
                method: 'put',
                path: '/foo/1',
                query: {},
                requestBody: {
                    ...(updatePayload as any),
                    meta: {
                        serialization: updateMeta,
                    },
                },
                client,
            });
            expect(r.status).toBe(200);
            // result is serializable
            expect(JSON.stringify(r.body)).toBeTruthy();

            serializationMeta = r.body.meta.serialization;
            expect(serializationMeta).toBeTruthy();
            deserialized = SuperJSON.deserialize({ json: r.body, meta: serializationMeta });
            data = deserialized.data.attributes;
            expect(data.bigInt).toEqual(updateAttrs.bigInt);
            expect(data.date).toEqual(updateAttrs.date);
            expect(data.decimal.equals(updateAttrs.decimal)).toBeTruthy();
            expect(data.bytes.toString()).toEqual(updateAttrs.bytes.toString());

            r = await handler({
                method: 'get',
                path: '/foo/1',
                query: {},
                client,
            });
            // result is serializable
            expect(JSON.stringify(r.body)).toBeTruthy();
            serializationMeta = r.body.meta.serialization;
            expect(serializationMeta).toBeTruthy();
            deserialized = SuperJSON.deserialize({ json: r.body, meta: serializationMeta });
            data = deserialized.data.attributes;
            expect(typeof data.bigInt).toBe('bigint');
            expect(data.bytes).toBeInstanceOf(Uint8Array);
            expect(data.date instanceof Date).toBeTruthy();
            expect(Decimal.isDecimal(data.decimal)).toBeTruthy();

            r = await handler({
                method: 'get',
                path: '/foo',
                query: { include: 'bars' },
                client,
            });
            // result is serializable
            expect(JSON.stringify(r.body)).toBeTruthy();
            serializationMeta = r.body.meta.serialization;
            expect(serializationMeta).toBeTruthy();
            deserialized = SuperJSON.deserialize({ json: r.body, meta: serializationMeta });
            const included = deserialized.included[0];
            expect(included.attributes.bytes).toBeInstanceOf(Uint8Array);
        });
    });

    describe('REST server tests - compound id with custom separator', () => {
        const schema = `
    enum Role {
        COMMON_USER
        ADMIN_USER
    }

    model User {
        email String
        role Role
        enabled Boolean @default(true)

        @@id([email, role])
    }
    `;
        const idDivider = ':';

        beforeEach(async () => {
            client = await createTestClient(schema);

            const _handler = new RestApiHandler({
                schema: client.$schema,
                endpoint: 'http://localhost/api',
                pageSize: 5,
                idDivider,
                urlSegmentCharset: 'a-zA-Z0-9-_~ %@.:',
            });
            handler = (args) => _handler.handleRequest({ ...args, url: new URL(`http://localhost/${args.path}`) });
        });

        it('POST', async () => {
            const r = await handler({
                method: 'post',
                path: '/user',
                query: {},
                requestBody: {
                    data: {
                        type: 'User',
                        attributes: { email: 'user1@abc.com', role: 'COMMON_USER' },
                    },
                },
                client,
            });

            expect(r.status).toBe(201);
        });

        it('GET', async () => {
            await client.user.create({
                data: { email: 'user1@abc.com', role: 'COMMON_USER' },
            });

            const r = await handler({
                method: 'get',
                path: '/user',
                query: {},
                client,
            });

            expect(r.status).toBe(200);
            expect(r.body.data).toHaveLength(1);
        });

        it('GET single', async () => {
            await client.user.create({
                data: { email: 'user1@abc.com', role: 'COMMON_USER' },
            });

            const r = await handler({
                method: 'get',
                path: '/user/user1@abc.com:COMMON_USER',
                query: {},
                client,
            });

            expect(r.status).toBe(200);
            expect(r.body.data.attributes.email).toBe('user1@abc.com');
        });

        it('PUT', async () => {
            await client.user.create({
                data: { email: 'user1@abc.com', role: 'COMMON_USER' },
            });

            const r = await handler({
                method: 'put',
                path: '/user/user1@abc.com:COMMON_USER',
                query: {},
                requestBody: {
                    data: {
                        type: 'User',
                        attributes: { enabled: false },
                    },
                },
                client,
            });

            expect(r.status).toBe(200);
            expect(r.body.data.attributes.enabled).toBe(false);
        });
    });

    describe('REST server tests - model name mapping', () => {
        const schema = `
    model User {
        id String @id @default(cuid())
        name String
        posts Post[]
    }
    
    model Post {
        id String @id @default(cuid())
        title String
        author User? @relation(fields: [authorId], references: [id])
        authorId String?
    }
    `;
        beforeEach(async () => {
            client = await createTestClient(schema);

            const _handler = new RestApiHandler({
                schema: client.$schema,
                endpoint: 'http://localhost/api',
                modelNameMapping: {
                    User: 'myUser',
                },
            });
            handler = (args) => _handler.handleRequest({ ...args, url: new URL(`http://localhost/${args.path}`) });
        });

        it('works with name mapping', async () => {
            // using original model name
            await expect(
                handler({
                    method: 'post',
                    path: '/user',
                    query: {},
                    requestBody: { data: { type: 'User', attributes: { id: '1', name: 'User1' } } },
                    client,
                }),
            ).resolves.toMatchObject({
                status: 400,
            });

            // using mapped model name
            await expect(
                handler({
                    method: 'post',
                    path: '/myUser',
                    query: {},
                    requestBody: { data: { type: 'User', attributes: { id: '1', name: 'User1' } } },
                    client,
                }),
            ).resolves.toMatchObject({
                status: 201,
                body: {
                    links: { self: 'http://localhost/api/myUser/1' },
                },
            });

            await expect(
                handler({
                    method: 'get',
                    path: '/myUser/1',
                    query: {},
                    client,
                }),
            ).resolves.toMatchObject({
                status: 200,
                body: {
                    links: { self: 'http://localhost/api/myUser/1' },
                },
            });

            // works with unmapped model name
            await expect(
                handler({
                    method: 'post',
                    path: '/post',
                    query: {},
                    requestBody: {
                        data: {
                            type: 'Post',
                            attributes: { id: '1', title: 'Post1' },
                            relationships: {
                                author: { data: { type: 'User', id: '1' } },
                            },
                        },
                    },
                    client,
                }),
            ).resolves.toMatchObject({
                status: 201,
            });
        });
    });

    describe('REST server tests - external id mapping', () => {
        const schema = `
    model User {
        id Int @id @default(autoincrement())
        name String
        source String
        posts Post[]

        @@unique([name, source])
    }

    model Post {
        id Int @id @default(autoincrement())
        title String
        short_title String @unique()
        author User? @relation(fields: [authorId], references: [id])
        authorId Int?
    }
    `;
        beforeEach(async () => {
            client = await createTestClient(schema);

            const _handler = new RestApiHandler({
                schema: client.$schema,
                endpoint: 'http://localhost/api',
                externalIdMapping: {
                    User: 'name_source',
                    Post: 'short_title',
                },
            });
            handler = (args) => _handler.handleRequest({ ...args, url: new URL(`http://localhost/${args.path}`) });
        });

        it('works with id mapping', async () => {
            await client.user.create({
                data: { id: 1, name: 'User1', source: 'a' },
            });

            // user is no longer exposed using the `id` field
            let r = await handler({
                method: 'get',
                path: '/user/1',
                query: {},
                client,
            });

            expect(r.status).toBe(422);
            expect(r.body.errors[0].code).toBe('validation-error');

            // user is exposed using the fields from the `name__source` multi-column unique index
            r = await handler({
                method: 'get',
                path: '/user/User1_a',
                query: {},
                client,
            });

            expect(r.status).toBe(200);
            expect(r.body.data.attributes.source).toBe('a');
            expect(r.body.data.attributes.name).toBe('User1');

            await client.post.create({
                data: { id: 1, title: 'Title1', short_title: 'post-title-1', authorId: 1 },
            });

            // post is exposed using the `id` field
            r = await handler({
                method: 'get',
                path: '/post/post-title-1',
                query: { include: 'author' },
                client,
            });

            expect(r.status).toBe(200);
            expect(r.body.data.attributes.title).toBe('Title1');
            // Verify author relationship contains the external ID
            expect(r.body.data.relationships.author.data).toMatchObject({
                type: 'User',
                id: 'User1_a',
            });
        });
    });

    describe('REST server tests - procedures', () => {
        const schema = `
model User {
    id String @id @default(cuid())
    email String @unique
}

enum Role {
    ADMIN
    USER
}

type Overview {
    total Int
}

procedure echoDecimal(x: Decimal): Decimal
procedure greet(name: String?): String
procedure echoInt(x: Int): Int
procedure opt2(a: Int?, b: Int?): Int
procedure sumIds(ids: Int[]): Int
procedure echoRole(r: Role): Role
procedure echoOverview(o: Overview): Overview

mutation procedure sum(a: Int, b: Int): Int
`;

        beforeEach(async () => {
            interface ProcCtx<TArgs extends object> {
                client: ClientContract<SchemaDef>;
                args: TArgs;
            }

            interface ProcCtxOptionalArgs<TArgs extends object> {
                client: ClientContract<SchemaDef>;
                args?: TArgs;
            }

            type Role = 'ADMIN' | 'USER';

            interface Overview {
                total: number;
            }

            interface EchoDecimalArgs {
                x: Decimal;
            }

            interface GreetArgs {
                name?: string | null;
            }

            interface EchoIntArgs {
                x: number;
            }

            interface Opt2Args {
                a?: number | null;
                b?: number | null;
            }

            interface SumIdsArgs {
                ids: number[];
            }

            interface EchoRoleArgs {
                r: Role;
            }

            interface EchoOverviewArgs {
                o: Overview;
            }

            interface SumArgs {
                a: number;
                b: number;
            }

            interface Procedures {
                echoDecimal: (ctx: ProcCtx<EchoDecimalArgs>) => Promise<Decimal>;
                greet: (ctx: ProcCtxOptionalArgs<GreetArgs>) => Promise<string>;
                echoInt: (ctx: ProcCtx<EchoIntArgs>) => Promise<number>;
                opt2: (ctx: ProcCtxOptionalArgs<Opt2Args>) => Promise<number>;
                sumIds: (ctx: ProcCtx<SumIdsArgs>) => Promise<number>;
                echoRole: (ctx: ProcCtx<EchoRoleArgs>) => Promise<Role>;
                echoOverview: (ctx: ProcCtx<EchoOverviewArgs>) => Promise<Overview>;
                sum: (ctx: ProcCtx<SumArgs>) => Promise<number>;
            }

            client = await createTestClient(schema as unknown as SchemaDef, {
                procedures: {
                    echoDecimal: async ({ args }: ProcCtx<EchoDecimalArgs>) => args.x,
                    greet: async ({ args }: ProcCtxOptionalArgs<GreetArgs>) => {
                        const name = args?.name as string | undefined;
                        return `hi ${name ?? 'anon'}`;
                    },
                    echoInt: async ({ args }: ProcCtx<EchoIntArgs>) => args.x,
                    opt2: async ({ args }: ProcCtxOptionalArgs<Opt2Args>) => {
                        const a = args?.a as number | undefined;
                        const b = args?.b as number | undefined;
                        return (a ?? 0) + (b ?? 0);
                    },
                    sumIds: async ({ args }: ProcCtx<SumIdsArgs>) =>
                        (args.ids as number[]).reduce((acc, x) => acc + x, 0),
                    echoRole: async ({ args }: ProcCtx<EchoRoleArgs>) => args.r,
                    echoOverview: async ({ args }: ProcCtx<EchoOverviewArgs>) => args.o,
                    sum: async ({ args }: ProcCtx<SumArgs>) => args.a + args.b,
                } as Procedures,
            });

            const _handler = new RestApiHandler({
                schema: client.$schema,
                endpoint: 'http://localhost/api',
                pageSize: 5,
            });

            handler = (args) => _handler.handleRequest({ ...args, url: new URL(`http://localhost/${args.path}`) });
        });

        it('supports GET query procedures with q/meta (SuperJSON)', async () => {
            const { json, meta } = SuperJSON.serialize({ args: { x: new Decimal('1.23') } });
            const r = await handler({
                method: 'get',
                path: '/$procs/echoDecimal',
                query: { ...(json as object), meta: { serialization: meta } } as any,
                client,
            });

            expect(r.status).toBe(200);
            expect(r.body).toMatchObject({ data: '1.23' });
        });

        it('supports GET procedures without args when param is optional', async () => {
            const r = await handler({
                method: 'get',
                path: '/$procs/greet',
                query: {},
                client,
            });

            expect(r.status).toBe(200);
            expect(r.body).toMatchObject({ data: 'hi anon' });
        });

        it('errors for missing required single-param arg', async () => {
            const r = await handler({
                method: 'get',
                path: '/$procs/echoInt',
                query: {},
                client,
            });

            expect(r.status).toBe(400);
            expect(r.body).toMatchObject({
                errors: [
                    {
                        status: 400,
                        code: 'invalid-payload',
                        detail: 'missing procedure arguments',
                    },
                ],
            });
        });

        it('supports GET procedures without args when all params are optional', async () => {
            const r = await handler({
                method: 'get',
                path: '/$procs/opt2',
                query: {},
                client,
            });

            expect(r.status).toBe(200);
            expect(r.body).toMatchObject({ data: 0 });
        });

        it('supports array-typed single param via envelope args', async () => {
            const r = await handler({
                method: 'get',
                path: '/$procs/sumIds',
                query: { args: { ids: [1, 2, 3] } } as any,
                client,
            });

            expect(r.status).toBe(200);
            expect(r.body).toMatchObject({ data: 6 });
        });

        it('supports enum-typed params with validation', async () => {
            const r = await handler({
                method: 'get',
                path: '/$procs/echoRole',
                query: { args: { r: 'ADMIN' } } as any,
                client,
            });

            expect(r.status).toBe(200);
            expect(r.body).toMatchObject({ data: 'ADMIN' });
        });

        it('supports typedef params (object payload)', async () => {
            const r = await handler({
                method: 'get',
                path: '/$procs/echoOverview',
                query: { args: { o: { total: 123 } } } as any,
                client,
            });

            expect(r.status).toBe(200);
            expect(r.body).toMatchObject({ data: { total: 123 } });
        });

        it('errors for wrong type input', async () => {
            const r = await handler({
                method: 'get',
                path: '/$procs/echoInt',
                query: { args: { x: 'not-an-int' } } as any,
                client,
            });

            expect(r.status).toBe(422);
            expect(r.body).toMatchObject({
                errors: [
                    {
                        status: 422,
                        code: 'validation-error',
                    },
                ],
            });
            expect(r.body.errors?.[0]?.detail).toMatch(/invalid input/i);
        });

        it('supports POST mutation procedures with args passed via q/meta', async () => {
            const { json, meta } = SuperJSON.serialize({ args: { a: 1, b: 2 } });
            const r = await handler({
                method: 'post',
                path: '/$procs/sum',
                requestBody: { ...(json as object), meta: { serialization: meta } } as any,
                client,
            });

            expect(r.status).toBe(200);
            expect(r.body).toMatchObject({ data: 3 });
        });

        it('errors for invalid `args` payload type', async () => {
            const r = await handler({
                method: 'post',
                path: '/$procs/sum',
                requestBody: { args: [1, 2, 3] } as any,
                client,
            });

            expect(r.status).toBe(400);
            expect(r.body).toMatchObject({
                errors: [
                    {
                        status: 400,
                        code: 'invalid-payload',
                    },
                ],
            });
            expect(r.body.errors?.[0]?.detail).toMatch(/args/i);
        });

        it('errors for unknown argument keys (object mapping)', async () => {
            const r = await handler({
                method: 'post',
                path: '/$procs/sum',
                requestBody: { args: { a: 1, b: 2, c: 3 } } as any,
                client,
            });

            expect(r.status).toBe(400);
            expect(r.body).toMatchObject({
                errors: [
                    {
                        status: 400,
                        code: 'invalid-payload',
                    },
                ],
            });
            expect(r.body.errors?.[0]?.detail).toMatch(/unknown procedure argument/i);
        });

        it('supports /$procs path', async () => {
            const r = await handler({
                method: 'post',
                path: '/$procs/sum',
                requestBody: { args: { a: 1, b: 2 } } as any,
                client,
            });

            expect(r.status).toBe(200);
            expect(r.body).toMatchObject({ data: 3 });
        });
    });

    describe('Nested routes', () => {
        let nestedClient: ClientContract<SchemaDef>;
        let nestedHandler: (any: any) => Promise<{ status: number; body: any }>;

        const nestedSchema = `
        model User {
            id String @id @default(cuid())
            email String @unique
            posts Post[]
        }

        model Post {
            id Int @id @default(autoincrement())
            title String
            author User @relation(fields: [authorId], references: [id])
            authorId String
        }
        `;

        beforeEach(async () => {
            nestedClient = await createTestClient(nestedSchema);
            const api = new RestApiHandler({
                schema: nestedClient.$schema,
                endpoint: 'http://localhost/api',
                nestedRoutes: true,
            });
            nestedHandler = (args) => api.handleRequest({ ...args, url: new URL(`http://localhost/${args.path}`) });
        });

        it('scopes nested collection reads to parent', async () => {
            await nestedClient.user.create({
                data: {
                    id: 'u1',
                    email: 'u1@test.com',
                    posts: {
                        create: [{ title: 'u1-post-1' }, { title: 'u1-post-2' }],
                    },
                },
            });

            await nestedClient.user.create({
                data: {
                    id: 'u2',
                    email: 'u2@test.com',
                    posts: {
                        create: [{ title: 'u2-post-1' }],
                    },
                },
            });

            const r = await nestedHandler({
                method: 'get',
                path: '/user/u1/posts',
                client: nestedClient,
            });

            expect(r.status).toBe(200);
            expect(r.body.data).toHaveLength(2);
            expect(r.body.data.map((item: any) => item.attributes.title).sort()).toEqual(['u1-post-1', 'u1-post-2']);
        });

        it('returns 404 for nested collection read when parent does not exist', async () => {
            const r = await nestedHandler({
                method: 'get',
                path: '/user/nonexistent/posts',
                client: nestedClient,
            });
            expect(r.status).toBe(404);
        });

        it('scopes nested single reads to parent', async () => {
            await nestedClient.user.create({
                data: {
                    id: 'u1',
                    email: 'u1@test.com',
                },
            });

            const user2 = await nestedClient.user.create({
                data: {
                    id: 'u2',
                    email: 'u2@test.com',
                    posts: {
                        create: [{ title: 'u2-post-1' }],
                    },
                },
                include: {
                    posts: true,
                },
            });

            const postId = user2.posts[0]!.id;

            const denied = await nestedHandler({
                method: 'get',
                path: `/user/u1/posts/${postId}`,
                client: nestedClient,
            });
            expect(denied.status).toBe(404);

            const allowed = await nestedHandler({
                method: 'get',
                path: `/user/u2/posts/${postId}`,
                client: nestedClient,
            });
            expect(allowed.status).toBe(200);
            expect(allowed.body.data.attributes.title).toBe('u2-post-1');
        });

        it('returns 404 for nested single read when parent does not exist', async () => {
            const r = await nestedHandler({
                method: 'get',
                path: '/user/nonexistent/posts/1',
                client: nestedClient,
            });
            expect(r.status).toBe(404);
        });

        it('returns 404 for nested create when parent does not exist', async () => {
            const r = await nestedHandler({
                method: 'post',
                path: '/user/nonexistent/posts',
                client: nestedClient,
                requestBody: {
                    data: {
                        type: 'Post',
                        attributes: { title: 'orphan' },
                    },
                },
            });
            expect(r.status).toBe(404);
        });

        it('binds nested creates to parent relation automatically', async () => {
            await nestedClient.user.create({
                data: {
                    id: 'u1',
                    email: 'u1@test.com',
                },
            });

            const created = await nestedHandler({
                method: 'post',
                path: '/user/u1/posts',
                client: nestedClient,
                requestBody: {
                    data: {
                        type: 'Post',
                        attributes: {
                            title: 'nested-created',
                        },
                    },
                },
            });

            expect(created.status).toBe(201);

            const dbPost = await nestedClient.post.findFirst({
                where: {
                    title: 'nested-created',
                },
            });

            expect(dbPost?.authorId).toBe('u1');
        });

        it('rejects nested create when payload specifies the forced parent relation', async () => {
            await nestedClient.user.create({
                data: { id: 'u1', email: 'u1@test.com' },
            });
            await nestedClient.user.create({
                data: { id: 'u2', email: 'u2@test.com' },
            });

            const r = await nestedHandler({
                method: 'post',
                path: '/user/u1/posts',
                client: nestedClient,
                requestBody: {
                    data: {
                        type: 'Post',
                        attributes: { title: 'conflict' },
                        relationships: {
                            author: { data: { type: 'User', id: 'u2' } },
                        },
                    },
                },
            });

            expect(r.status).toBe(400);
        });

        it('rejects nested create when attributes contain scalar FK for the forced parent relation', async () => {
            await nestedClient.user.create({
                data: { id: 'u1', email: 'u1@test.com' },
            });
            await nestedClient.user.create({
                data: { id: 'u2', email: 'u2@test.com' },
            });

            const r = await nestedHandler({
                method: 'post',
                path: '/user/u1/posts',
                client: nestedClient,
                requestBody: {
                    data: {
                        type: 'Post',
                        attributes: { title: 'conflict', authorId: 'u2' },
                    },
                },
            });

            expect(r.status).toBe(400);
        });

        it('scopes nested collection reads with filter and pagination', async () => {
            await nestedClient.user.create({
                data: {
                    id: 'u1',
                    email: 'u1@test.com',
                    posts: {
                        create: [{ title: 'alpha' }, { title: 'beta' }, { title: 'gamma' }],
                    },
                },
            });

            const filtered = await nestedHandler({
                method: 'get',
                path: '/user/u1/posts',
                query: { 'filter[title]': 'alpha' },
                client: nestedClient,
            });
            expect(filtered.status).toBe(200);
            expect(filtered.body.data).toHaveLength(1);
            expect(filtered.body.data[0].attributes.title).toBe('alpha');

            const paged = await nestedHandler({
                method: 'get',
                path: '/user/u1/posts',
                query: { 'page[limit]': '2', 'page[offset]': '0' },
                client: nestedClient,
            });
            expect(paged.status).toBe(200);
            expect(paged.body.data).toHaveLength(2);
        });

        it('updates a child scoped to parent (PATCH)', async () => {
            const user1 = await nestedClient.user.create({
                data: {
                    id: 'u1',
                    email: 'u1@test.com',
                    posts: { create: [{ title: 'original' }] },
                },
                include: { posts: true },
            });
            const postId = user1.posts[0]!.id;

            await nestedClient.user.create({ data: { id: 'u2', email: 'u2@test.com' } });

            // Cannot update a post that belongs to a different parent
            const denied = await nestedHandler({
                method: 'patch',
                path: `/user/u2/posts/${postId}`,
                client: nestedClient,
                requestBody: {
                    data: { type: 'Post', attributes: { title: 'denied-update' } },
                },
            });
            expect(denied.status).toBe(404);

            // Can update a post that belongs to the correct parent
            const allowed = await nestedHandler({
                method: 'patch',
                path: `/user/u1/posts/${postId}`,
                client: nestedClient,
                requestBody: {
                    data: { type: 'Post', attributes: { title: 'updated' } },
                },
            });
            expect(allowed.status).toBe(200);
            expect(allowed.body.data.attributes.title).toBe('updated');
        });

        it('rejects nested PATCH when payload tries to change the parent relation', async () => {
            const user1 = await nestedClient.user.create({
                data: {
                    id: 'u1',
                    email: 'u1@test.com',
                    posts: { create: [{ title: 'post' }] },
                },
                include: { posts: true },
            });
            const postId = user1.posts[0]!.id;
            await nestedClient.user.create({ data: { id: 'u2', email: 'u2@test.com' } });

            const r = await nestedHandler({
                method: 'patch',
                path: `/user/u1/posts/${postId}`,
                client: nestedClient,
                requestBody: {
                    data: {
                        type: 'Post',
                        attributes: { title: 'new' },
                        relationships: {
                            author: { data: { type: 'User', id: 'u2' } },
                        },
                    },
                },
            });
            expect(r.status).toBe(400);
        });

        it('rejects nested PATCH when attributes contain camelCase FK field', async () => {
            const user1 = await nestedClient.user.create({
                data: {
                    id: 'u1',
                    email: 'u1@test.com',
                    posts: { create: [{ title: 'post' }] },
                },
                include: { posts: true },
            });
            const postId = user1.posts[0]!.id;
            await nestedClient.user.create({ data: { id: 'u2', email: 'u2@test.com' } });

            const r = await nestedHandler({
                method: 'patch',
                path: `/user/u1/posts/${postId}`,
                client: nestedClient,
                requestBody: {
                    data: {
                        type: 'Post',
                        attributes: { title: 'new', authorId: 'u2' },
                    },
                },
            });
            expect(r.status).toBe(400);
        });

        it('deletes a child scoped to parent (DELETE)', async () => {
            const user1 = await nestedClient.user.create({
                data: {
                    id: 'u1',
                    email: 'u1@test.com',
                    posts: { create: [{ title: 'to-delete' }] },
                },
                include: { posts: true },
            });
            const postId = user1.posts[0]!.id;
            await nestedClient.user.create({ data: { id: 'u2', email: 'u2@test.com' } });

            // Cannot delete a post via the wrong parent
            const denied = await nestedHandler({
                method: 'delete',
                path: `/user/u2/posts/${postId}`,
                client: nestedClient,
            });
            expect(denied.status).toBe(404);

            // Can delete via the correct parent
            const allowed = await nestedHandler({
                method: 'delete',
                path: `/user/u1/posts/${postId}`,
                client: nestedClient,
            });
            expect(allowed.status).toBe(200);

            const gone = await nestedClient.post.findFirst({ where: { id: postId } });
            expect(gone).toBeNull();
        });

        it('falls back to fetchRelated for non-configured 3-segment paths', async () => {
            const user1 = await nestedClient.user.create({
                data: {
                    id: 'u1',
                    email: 'u1@test.com',
                    posts: { create: [{ title: 'p1' }] },
                },
            });

            // 'author' is a relation on Post, not a nestedRoute → fetchRelated
            const post = await nestedClient.post.findFirst({ where: { authorId: 'u1' } });
            const r = await nestedHandler({
                method: 'get',
                path: `/post/${post!.id}/author`,
                client: nestedClient,
            });
            expect(r.status).toBe(200);
            expect(r.body.data.id).toBe(user1.id);
        });

        it('supports PATCH /:type/:id/:relationship for to-one nested update', async () => {
            await nestedClient.user.create({ data: { id: 'u1', email: 'u1@test.com' } });
            await nestedClient.user.create({ data: { id: 'u2', email: 'u2@test.com' } });
            const post = await nestedClient.post.create({
                data: { title: 'my-post', author: { connect: { id: 'u1' } } },
            });

            // PATCH /post/:id/author — update the to-one related author's attributes
            const updated = await nestedHandler({
                method: 'patch',
                path: `/post/${post.id}/author`,
                client: nestedClient,
                requestBody: {
                    data: { type: 'user', id: 'u1', attributes: { email: 'u1-new@test.com' } },
                },
            });
            expect(updated.status).toBe(200);
            expect(updated.body.data.attributes.email).toBe('u1-new@test.com');
            expect(updated.body.links.self).toBe(`http://localhost/api/post/${post.id}/author`);
            expect(updated.body.data.links.self).toBe(`http://localhost/api/post/${post.id}/author`);

            // Verify the DB was actually updated
            const dbUser = await nestedClient.user.findUnique({ where: { id: 'u1' } });
            expect(dbUser?.email).toBe('u1-new@test.com');

            // Attempting to change the back-relation (posts) via the nested route should be rejected
            const rejected = await nestedHandler({
                method: 'patch',
                path: `/post/${post.id}/author`,
                client: nestedClient,
                requestBody: {
                    data: {
                        type: 'user',
                        id: 'u1',
                        relationships: { posts: { data: [{ type: 'post', id: String(post.id) }] } },
                    },
                },
            });
            expect(rejected.status).toBe(400);
        });

        it('returns 400 for PATCH /:type/:id/:relationship to-one when nestedRoutes is not enabled', async () => {
            const api = new RestApiHandler({
                schema: nestedClient.$schema,
                endpoint: 'http://localhost/api',
                // nestedRoutes not enabled
            });
            const plainHandler = (args: any) =>
                api.handleRequest({ ...args, url: new URL(`http://localhost/${args.path}`) });

            await nestedClient.user.create({ data: { id: 'u1', email: 'u1@test.com' } });
            const post = await nestedClient.post.create({
                data: { title: 'my-post', author: { connect: { id: 'u1' } } },
            });

            const r = await plainHandler({
                method: 'patch',
                path: `/post/${post.id}/author`,
                client: nestedClient,
                requestBody: { data: { type: 'user', id: 'u1', attributes: { email: 'x@test.com' } } },
            });
            expect(r.status).toBe(400);
        });

        it('returns nested self-links in JSON:API responses for all nested operations', async () => {
            await nestedClient.user.create({ data: { id: 'u1', email: 'u1@test.com' } });

            // POST /user/u1/posts — nested create
            const created = await nestedHandler({
                method: 'post',
                path: '/user/u1/posts',
                client: nestedClient,
                requestBody: { data: { type: 'post', attributes: { title: 'hello' } } },
            });
            expect(created.status).toBe(201);
            const postId = created.body.data.id;
            expect(created.body.links.self).toBe(`http://localhost/api/user/u1/posts/${postId}`);
            expect(created.body.data.links.self).toBe(`http://localhost/api/user/u1/posts/${postId}`);

            // GET /user/u1/posts/:id — nested single read
            const single = await nestedHandler({
                method: 'get',
                path: `/user/u1/posts/${postId}`,
                client: nestedClient,
            });
            expect(single.status).toBe(200);
            expect(single.body.links.self).toBe(`http://localhost/api/user/u1/posts/${postId}`);
            expect(single.body.data.links.self).toBe(`http://localhost/api/user/u1/posts/${postId}`);

            // PATCH /user/u1/posts/:id — nested update
            const updated = await nestedHandler({
                method: 'patch',
                path: `/user/u1/posts/${postId}`,
                client: nestedClient,
                requestBody: { data: { type: 'post', id: String(postId), attributes: { title: 'updated' } } },
            });
            expect(updated.status).toBe(200);
            expect(updated.body.links.self).toBe(`http://localhost/api/user/u1/posts/${postId}`);
            expect(updated.body.data.links.self).toBe(`http://localhost/api/user/u1/posts/${postId}`);
        });

        it('works with modelNameMapping on both parent and child segments', async () => {
            const mappedApi = new RestApiHandler({
                schema: nestedClient.$schema,
                endpoint: 'http://localhost/api',
                modelNameMapping: { User: 'users', Post: 'posts' },
                nestedRoutes: true,
            });
            const mappedHandler = (args: any) =>
                mappedApi.handleRequest({ ...args, url: new URL(`http://localhost/${args.path}`) });

            await nestedClient.user.create({
                data: {
                    id: 'u1',
                    email: 'u1@test.com',
                    posts: { create: [{ title: 'mapped-post' }] },
                },
            });
            await nestedClient.user.create({
                data: { id: 'u2', email: 'u2@test.com' },
            });

            const collection = await mappedHandler({
                method: 'get',
                path: '/users/u1/posts',
                client: nestedClient,
            });
            expect(collection.status).toBe(200);
            expect(collection.body.data).toHaveLength(1);
            expect(collection.body.data[0].attributes.title).toBe('mapped-post');

            // Parent with no posts → 200 with empty collection
            const denied = await mappedHandler({
                method: 'get',
                path: '/users/u2/posts',
                client: nestedClient,
            });
            expect(denied.status).toBe(200);
            expect(denied.body.data).toHaveLength(0);
        });

        it('falls back to fetchRelated for mapped child names without nestedRoutes', async () => {
            const mappedApi = new RestApiHandler({
                schema: nestedClient.$schema,
                endpoint: 'http://localhost/api',
                modelNameMapping: { User: 'users', Post: 'posts' },
            });
            const mappedHandler = (args: any) =>
                mappedApi.handleRequest({ ...args, url: new URL(`http://localhost/${args.path}`) });

            await nestedClient.user.create({
                data: {
                    id: 'u1',
                    email: 'u1@test.com',
                    posts: { create: [{ title: 'mapped-fallback-post' }] },
                },
            });
            await nestedClient.user.create({
                data: { id: 'u2', email: 'u2@test.com' },
            });

            const collection = await mappedHandler({
                method: 'get',
                path: '/users/u1/posts',
                client: nestedClient,
            });
            expect(collection.status).toBe(200);
            expect(collection.body.data).toHaveLength(1);
            expect(collection.body.data[0].attributes.title).toBe('mapped-fallback-post');

            const empty = await mappedHandler({
                method: 'get',
                path: '/users/u2/posts',
                client: nestedClient,
            });
            expect(empty.status).toBe(200);
            expect(empty.body.data).toHaveLength(0);
        });

        it('exercises mapped nested-route mutations and verifies link metadata', async () => {
            const mappedApi = new RestApiHandler({
                schema: nestedClient.$schema,
                endpoint: 'http://localhost/api',
                modelNameMapping: { User: 'users', Post: 'posts' },
                nestedRoutes: true,
            });
            const mappedHandler = (args: any) =>
                mappedApi.handleRequest({ ...args, url: new URL(`http://localhost/${args.path}`) });

            await nestedClient.user.create({ data: { id: 'u1', email: 'u1@test.com' } });

            // POST /users/u1/posts — nested create via mapped route
            const created = await mappedHandler({
                method: 'post',
                path: '/users/u1/posts',
                client: nestedClient,
                requestBody: { data: { type: 'posts', attributes: { title: 'mapped-create' } } },
            });
            expect(created.status).toBe(201);
            const postId = created.body.data.id;
            expect(created.body.links.self).toBe(`http://localhost/api/users/u1/posts/${postId}`);
            expect(created.body.data.links.self).toBe(`http://localhost/api/users/u1/posts/${postId}`);

            // GET /users/u1/posts — list should contain the new post
            const afterCreate = await mappedHandler({
                method: 'get',
                path: '/users/u1/posts',
                client: nestedClient,
            });
            expect(afterCreate.status).toBe(200);
            expect(afterCreate.body.data).toHaveLength(1);
            expect(afterCreate.body.links.self).toBe('http://localhost/api/users/u1/posts');

            // PATCH /users/u1/posts/:id — nested update via mapped route
            const updated = await mappedHandler({
                method: 'patch',
                path: `/users/u1/posts/${postId}`,
                client: nestedClient,
                requestBody: {
                    data: { type: 'posts', id: String(postId), attributes: { title: 'mapped-updated' } },
                },
            });
            expect(updated.status).toBe(200);
            expect(updated.body.data.attributes.title).toBe('mapped-updated');
            expect(updated.body.links.self).toBe(`http://localhost/api/users/u1/posts/${postId}`);
            expect(updated.body.data.links.self).toBe(`http://localhost/api/users/u1/posts/${postId}`);

            // DELETE /users/u1/posts/:id — nested delete via mapped route
            const deleted = await mappedHandler({
                method: 'delete',
                path: `/users/u1/posts/${postId}`,
                client: nestedClient,
            });
            expect(deleted.status).toBe(200);

            // GET /users/u1/posts — list should now be empty
            const afterDelete = await mappedHandler({
                method: 'get',
                path: '/users/u1/posts',
                client: nestedClient,
            });
            expect(afterDelete.status).toBe(200);
            expect(afterDelete.body.data).toHaveLength(0);
        });
    });
});
