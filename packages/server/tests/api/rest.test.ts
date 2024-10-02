/* eslint-disable @typescript-eslint/no-explicit-any */
/// <reference types="@types/jest" />

import { CrudFailureReason, type ModelMeta } from '@zenstackhq/runtime';
import { loadSchema, run } from '@zenstackhq/testtools';
import { Decimal } from 'decimal.js';
import SuperJSON from 'superjson';
import makeHandler, { idDivider } from '../../src/api/rest';
import e from 'express';

describe('REST server tests', () => {
    let prisma: any;
    let zodSchemas: any;
    let modelMeta: ModelMeta;
    let handler: (any: any) => Promise<{ status: number; body: any }>;

    beforeEach(async () => {
        run('npx prisma migrate reset --force');
        run('npx prisma db push');
    });

    describe('REST server tests - regular prisma', () => {
        const schema = `
    model User {
        myId String @id @default(cuid())
        createdAt DateTime @default (now())
        updatedAt DateTime @updatedAt
        email String @unique @email
        posts Post[]
        likes PostLike[]
        profile Profile?
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
        @@id([postId, userId])
    }
    `;

        beforeAll(async () => {
            const params = await loadSchema(schema);

            prisma = params.prisma;
            zodSchemas = params.zodSchemas;
            modelMeta = params.modelMeta;

            const _handler = makeHandler({ endpoint: 'http://localhost/api', pageSize: 5 });
            handler = (args) =>
                _handler({ ...args, zodSchemas, modelMeta, url: new URL(`http://localhost/${args.path}`) });
        });

        describe('CRUD', () => {
            describe('GET', () => {
                it('invalid type, id, relationship', async () => {
                    let r = await handler({
                        method: 'get',
                        path: '/foo',
                        prisma,
                    });
                    expect(r.status).toBe(404);

                    r = await handler({
                        method: 'get',
                        path: '/user/user1/posts',
                        prisma,
                    });
                    expect(r.status).toBe(404);

                    await prisma.user.create({
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
                        prisma,
                    });
                    expect(r.status).toBe(404);

                    r = await handler({
                        method: 'get',
                        path: '/user/user1/foo',
                        prisma,
                    });
                    expect(r.status).toBe(404);
                });

                it('returns an empty array when no item exists', async () => {
                    const r = await handler({
                        method: 'get',
                        path: '/user',
                        prisma,
                    });
                    console.log('yufail', JSON.stringify(r));
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
                    await prisma.user.create({
                        data: {
                            myId: 'user1',
                            email: 'user1@abc.com',
                            posts: {
                                create: { title: 'Post1' },
                            },
                        },
                    });
                    await prisma.user.create({
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
                        prisma,
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
                                type: 'user',
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
                                        data: [{ type: 'post', id: 1 }],
                                    },
                                },
                            },
                            {
                                type: 'user',
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
                                        data: [{ type: 'post', id: 2 }],
                                    },
                                },
                            },
                        ],
                    });
                });

                it('returns a single item when the ID is specified', async () => {
                    // Create a user first
                    await prisma.user.create({
                        data: { myId: 'user1', email: 'user1@abc.com', posts: { create: { title: 'Post1' } } },
                    });

                    const r = await handler({
                        method: 'get',
                        path: '/user/user1',
                        prisma,
                    });

                    expect(r.status).toBe(200);
                    expect(r.body).toMatchObject({
                        data: {
                            type: 'user',
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
                                    data: [{ type: 'post', id: 1 }],
                                },
                            },
                        },
                    });
                });

                it('fetch a related resource', async () => {
                    // Create a user first
                    await prisma.user.create({
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
                        prisma,
                    });

                    expect(r.status).toBe(200);
                    expect(r.body).toMatchObject({
                        links: {
                            self: 'http://localhost/api/user/user1/posts',
                        },
                        data: [
                            {
                                type: 'post',
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

                it('fetches a related resource with a compound ID', async () => {
                    await prisma.user.create({
                        data: {
                            myId: 'user1',
                            email: 'user1@abc.com',
                            posts: {
                                create: { id: 1, title: 'Post1' },
                            },
                        },
                    });
                    await prisma.postLike.create({
                        data: { postId: 1, userId: 'user1', superLike: true },
                    });

                    const r = await handler({
                        method: 'get',
                        path: '/post/1/relationships/likes',
                        prisma,
                    });

                    console.log('yufail', JSON.stringify(r));

                    expect(r.status).toBe(200);
                    expect(r.body).toMatchObject({
                        links: {
                            self: 'http://localhost/api/post/1/relationships/likes',
                        },
                        data: [{ type: 'postLike', id: '1_user1' }],
                    });
                });

                it('fetch a relationship', async () => {
                    // Create a user first
                    await prisma.user.create({
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
                        prisma,
                    });

                    expect(r.status).toBe(200);
                    expect(r.body).toMatchObject({
                        links: {
                            self: 'http://localhost/api/user/user1/relationships/posts',
                        },
                        data: [{ type: 'post', id: 1 }],
                    });
                });

                it('returns 404 if the specified ID does not exist', async () => {
                    const r = await handler({
                        method: 'get',
                        path: '/user/nonexistentuser',
                        prisma,
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
                    await prisma.user.create({
                        data: {
                            myId: 'user1',
                            email: 'user1@abc.com',
                            posts: {
                                create: { id: 1, title: 'Post1' },
                            },
                        },
                    });
                    await prisma.user.create({
                        data: {
                            myId: 'user2',
                            email: 'user2@abc.com',
                            posts: {
                                create: { id: 2, title: 'Post2', viewCount: 1, published: true },
                            },
                        },
                    });

                    // id filter
                    let r = await handler({
                        method: 'get',
                        path: '/user',
                        query: { ['filter[id]']: 'user2' },
                        prisma,
                    });
                    expect(r.status).toBe(200);
                    expect(r.body.data).toHaveLength(1);
                    expect(r.body.data[0]).toMatchObject({ id: 'user2' });

                    // multi-id filter
                    r = await handler({
                        method: 'get',
                        path: '/user',
                        query: { ['filter[id]']: 'user1,user2' },
                        prisma,
                    });
                    expect(r.status).toBe(200);
                    expect(r.body.data).toHaveLength(2);

                    // String filter
                    r = await handler({
                        method: 'get',
                        path: '/user',
                        query: { ['filter[email]']: 'user1@abc.com' },
                        prisma,
                    });
                    expect(r.body.data).toHaveLength(1);
                    expect(r.body.data[0]).toMatchObject({ id: 'user1' });

                    r = await handler({
                        method: 'get',
                        path: '/user',
                        query: { ['filter[email$contains]']: '1@abc' },
                        prisma,
                    });
                    expect(r.body.data).toHaveLength(1);
                    expect(r.body.data[0]).toMatchObject({ id: 'user1' });

                    r = await handler({
                        method: 'get',
                        path: '/user',
                        query: { ['filter[email$contains]']: '1@bc' },
                        prisma,
                    });
                    expect(r.body.data).toHaveLength(0);

                    r = await handler({
                        method: 'get',
                        path: '/user',
                        query: { ['filter[email$startsWith]']: 'user1' },
                        prisma,
                    });
                    expect(r.body.data).toHaveLength(1);
                    expect(r.body.data[0]).toMatchObject({ id: 'user1' });

                    r = await handler({
                        method: 'get',
                        path: '/user',
                        query: { ['filter[email$startsWith]']: 'ser1' },
                        prisma,
                    });
                    expect(r.body.data).toHaveLength(0);

                    r = await handler({
                        method: 'get',
                        path: '/user',
                        query: { ['filter[email$endsWith]']: '1@abc.com' },
                        prisma,
                    });
                    expect(r.body.data).toHaveLength(1);
                    expect(r.body.data[0]).toMatchObject({ id: 'user1' });

                    r = await handler({
                        method: 'get',
                        path: '/user',
                        query: { ['filter[email$endsWith]']: '1@abc' },
                        prisma,
                    });
                    expect(r.body.data).toHaveLength(0);

                    // Int filter
                    r = await handler({
                        method: 'get',
                        path: '/post',
                        query: { ['filter[viewCount]']: '1' },
                        prisma,
                    });
                    expect(r.body.data).toHaveLength(1);
                    expect(r.body.data[0]).toMatchObject({ id: 2 });

                    r = await handler({
                        method: 'get',
                        path: '/post',
                        query: { ['filter[viewCount$gt]']: '0' },
                        prisma,
                    });
                    expect(r.body.data).toHaveLength(1);
                    expect(r.body.data[0]).toMatchObject({ id: 2 });

                    r = await handler({
                        method: 'get',
                        path: '/post',
                        query: { ['filter[viewCount$gte]']: '1' },
                        prisma,
                    });
                    expect(r.body.data).toHaveLength(1);
                    expect(r.body.data[0]).toMatchObject({ id: 2 });

                    r = await handler({
                        method: 'get',
                        path: '/post',
                        query: { ['filter[viewCount$lt]']: '0' },
                        prisma,
                    });
                    expect(r.body.data).toHaveLength(0);

                    r = await handler({
                        method: 'get',
                        path: '/post',
                        query: { ['filter[viewCount$lte]']: '0' },
                        prisma,
                    });
                    expect(r.body.data).toHaveLength(1);
                    expect(r.body.data[0]).toMatchObject({ id: 1 });

                    // Boolean filter
                    r = await handler({
                        method: 'get',
                        path: '/post',
                        query: { ['filter[published]']: 'true' },
                        prisma,
                    });
                    expect(r.body.data).toHaveLength(1);
                    expect(r.body.data[0]).toMatchObject({ id: 2 });

                    // deep to-one filter
                    r = await handler({
                        method: 'get',
                        path: '/post',
                        query: { ['filter[author][email]']: 'user1@abc.com' },
                        prisma,
                    });
                    expect(r.body.data).toHaveLength(1);

                    // deep to-many filter
                    r = await handler({
                        method: 'get',
                        path: '/user',
                        query: { ['filter[posts][published]']: 'true' },
                        prisma,
                    });
                    expect(r.body.data).toHaveLength(1);

                    // filter to empty
                    r = await handler({
                        method: 'get',
                        path: '/user',
                        query: { ['filter[id]']: 'user3' },
                        prisma,
                    });
                    expect(r.body.data).toHaveLength(0);

                    // to-many relation collection filter
                    r = await handler({
                        method: 'get',
                        path: '/user',
                        query: { ['filter[posts]']: '2' },
                        prisma,
                    });
                    expect(r.body.data).toHaveLength(1);
                    expect(r.body.data[0]).toMatchObject({ id: 'user2' });

                    r = await handler({
                        method: 'get',
                        path: '/user',
                        query: { ['filter[posts]']: '1,2,3' },
                        prisma,
                    });
                    expect(r.body.data).toHaveLength(2);

                    // multi filter
                    r = await handler({
                        method: 'get',
                        path: '/user',
                        query: { ['filter[id]']: 'user1', ['filter[posts]']: '2' },
                        prisma,
                    });
                    expect(r.body.data).toHaveLength(0);

                    // to-one relation filter
                    r = await handler({
                        method: 'get',
                        path: '/post',
                        query: { ['filter[author]']: 'user1' },
                        prisma,
                    });
                    expect(r.body.data).toHaveLength(1);
                    expect(r.body.data[0]).toMatchObject({ id: 1 });

                    // invalid filter field
                    r = await handler({
                        method: 'get',
                        path: '/user',
                        query: { ['filter[foo]']: '1' },
                        prisma,
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
                        prisma,
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
                        prisma,
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
                });

                it('related data filtering', async () => {
                    await prisma.user.create({
                        data: {
                            myId: 'user1',
                            email: 'user1@abc.com',
                            posts: {
                                create: { id: 1, title: 'Post1' },
                            },
                        },
                    });
                    await prisma.user.create({
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
                        prisma,
                    });
                    expect(r.body.data).toHaveLength(0);

                    r = await handler({
                        method: 'get',
                        path: '/user/user2/posts',
                        query: { ['filter[viewCount]']: '1' },
                        prisma,
                    });
                    expect(r.body.data).toHaveLength(1);
                });

                it('relationship filtering', async () => {
                    await prisma.user.create({
                        data: {
                            myId: 'user1',
                            email: 'user1@abc.com',
                            posts: {
                                create: { id: 1, title: 'Post1' },
                            },
                        },
                    });
                    await prisma.user.create({
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
                        prisma,
                    });
                    expect(r.body.data).toHaveLength(0);

                    r = await handler({
                        method: 'get',
                        path: '/user/user2/relationships/posts',
                        query: { ['filter[viewCount]']: '1' },
                        prisma,
                    });
                    expect(r.body.data).toHaveLength(1);
                });

                it('toplevel sorting', async () => {
                    await prisma.user.create({
                        data: {
                            myId: 'user1',
                            email: 'user1@abc.com',
                            posts: {
                                create: { id: 1, title: 'Post1', viewCount: 1, published: true },
                            },
                        },
                    });
                    await prisma.user.create({
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
                        prisma,
                    });
                    expect(r.status).toBe(200);
                    expect(r.body.data[0]).toMatchObject({ id: 1 });

                    // basic sorting desc
                    r = await handler({
                        method: 'get',
                        path: '/post',
                        query: { sort: '-viewCount' },
                        prisma,
                    });
                    expect(r.status).toBe(200);
                    expect(r.body.data[0]).toMatchObject({ id: 2 });

                    // by relation id
                    r = await handler({
                        method: 'get',
                        path: '/post',
                        query: { sort: '-author' },
                        prisma,
                    });
                    expect(r.status).toBe(200);
                    expect(r.body.data[0]).toMatchObject({ id: 2 });

                    // by relation field
                    r = await handler({
                        method: 'get',
                        path: '/post',
                        query: { sort: '-author.email' },
                        prisma,
                    });
                    expect(r.status).toBe(200);
                    expect(r.body.data[0]).toMatchObject({ id: 2 });

                    // multi-field sorting
                    r = await handler({
                        method: 'get',
                        path: '/post',
                        query: { sort: 'published,viewCount' },
                        prisma,
                    });
                    expect(r.status).toBe(200);
                    expect(r.body.data[0]).toMatchObject({ id: 2 });

                    r = await handler({
                        method: 'get',
                        path: '/post',
                        query: { sort: 'viewCount,published' },
                        prisma,
                    });
                    expect(r.status).toBe(200);
                    expect(r.body.data[0]).toMatchObject({ id: 1 });

                    r = await handler({
                        method: 'get',
                        path: '/post',
                        query: { sort: '-viewCount,-published' },
                        prisma,
                    });
                    expect(r.status).toBe(200);
                    expect(r.body.data[0]).toMatchObject({ id: 2 });

                    // invalid field
                    r = await handler({
                        method: 'get',
                        path: '/post',
                        query: { sort: 'foo' },
                        prisma,
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
                        prisma,
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
                        prisma,
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
                    await prisma.user.create({
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
                        prisma,
                    });
                    expect(r.status).toBe(200);
                    expect(r.body.data[0]).toMatchObject({ id: 1 });

                    // desc
                    r = await handler({
                        method: 'get',
                        path: '/user/user1/posts',
                        query: { sort: '-viewCount' },
                        prisma,
                    });
                    expect(r.status).toBe(200);
                    expect(r.body.data[0]).toMatchObject({ id: 2 });

                    // relation field
                    r = await handler({
                        method: 'get',
                        path: '/user/user1/posts',
                        query: { sort: '-setting.boost' },
                        prisma,
                    });
                    expect(r.status).toBe(200);
                    expect(r.body.data[0]).toMatchObject({ id: 2 });
                });

                it('relationship sorting', async () => {
                    await prisma.user.create({
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
                        prisma,
                    });
                    expect(r.status).toBe(200);
                    expect(r.body.data[0]).toMatchObject({ id: 1 });

                    // desc
                    r = await handler({
                        method: 'get',
                        path: '/user/user1/relationships/posts',
                        query: { sort: '-viewCount' },
                        prisma,
                    });
                    expect(r.status).toBe(200);
                    expect(r.body.data[0]).toMatchObject({ id: 2 });

                    // relation field
                    r = await handler({
                        method: 'get',
                        path: '/user/user1/relationships/posts',
                        query: { sort: '-setting.boost' },
                        prisma,
                    });
                    expect(r.status).toBe(200);
                    expect(r.body.data[0]).toMatchObject({ id: 2 });
                });

                it('including', async () => {
                    await prisma.user.create({
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
                    await prisma.user.create({
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
                        prisma,
                    });
                    expect(r.body.included).toHaveLength(2);
                    expect(r.body.included[0]).toMatchObject({
                        type: 'post',
                        id: 1,
                        attributes: { title: 'Post1' },
                    });

                    // single query include
                    r = await handler({
                        method: 'get',
                        path: '/user/user1',
                        query: { include: 'posts' },
                        prisma,
                    });
                    expect(r.body.included).toHaveLength(1);
                    expect(r.body.included[0]).toMatchObject({
                        type: 'post',
                        id: 1,
                        attributes: { title: 'Post1' },
                    });

                    // related query include
                    r = await handler({
                        method: 'get',
                        path: '/user/user1/posts',
                        query: { include: 'posts.comments' },
                        prisma,
                    });
                    expect(r.body.included).toHaveLength(1);
                    expect(r.body.included[0]).toMatchObject({
                        type: 'comment',
                        attributes: { content: 'Comment1' },
                    });

                    // related query include with filter
                    r = await handler({
                        method: 'get',
                        path: '/user/user1/posts',
                        query: { include: 'posts.comments', ['filter[published]']: 'true' },
                        prisma,
                    });
                    expect(r.body.data).toHaveLength(0);

                    // deep include
                    r = await handler({
                        method: 'get',
                        path: '/user',
                        query: { include: 'posts.comments' },
                        prisma,
                    });
                    expect(r.body.included).toHaveLength(4);
                    expect(r.body.included[2]).toMatchObject({
                        type: 'comment',
                        attributes: { content: 'Comment1' },
                    });

                    // multiple include
                    r = await handler({
                        method: 'get',
                        path: '/user',
                        query: { include: 'posts.comments,profile' },
                        prisma,
                    });
                    expect(r.body.included).toHaveLength(5);
                    const profile = r.body.included.find((item: any) => item.type === 'profile');
                    expect(profile).toMatchObject({
                        type: 'profile',
                        attributes: { gender: 'male' },
                    });

                    // invalid include
                    r = await handler({
                        method: 'get',
                        path: '/user',
                        query: { include: 'foo' },
                        prisma,
                    });
                    expect(r.status).toBe(400);
                    expect(r.body).toMatchObject({
                        errors: [{ status: 400, code: 'unsupported-relationship' }],
                    });
                });

                it('toplevel pagination', async () => {
                    for (const i of Array(5).keys()) {
                        await prisma.user.create({
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
                        prisma,
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
                        prisma,
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
                        prisma,
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
                        prisma,
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
                        prisma,
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
                        prisma,
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
                    await prisma.user.create({
                        data: {
                            myId: `user1`,
                            email: `user1@abc.com`,
                            posts: {
                                create: [...Array(10).keys()].map((i) => ({
                                    id: i,
                                    title: `Post${i}`,
                                })),
                            },
                        },
                    });

                    // default limiting
                    let r = await handler({
                        method: 'get',
                        path: '/user/user1/posts',
                        prisma,
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
                        prisma,
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
                        prisma,
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
                    await prisma.user.create({
                        data: {
                            myId: `user1`,
                            email: `user1@abc.com`,
                            posts: {
                                create: [...Array(10).keys()].map((i) => ({
                                    id: i,
                                    title: `Post${i}`,
                                })),
                            },
                        },
                    });

                    // default limiting
                    let r = await handler({
                        method: 'get',
                        path: '/user/user1/relationships/posts',
                        prisma,
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
                        prisma,
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
                        prisma,
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
                        await prisma.user.create({
                            data: { myId: 'user1', email: 'user1@abc.com', posts: { create: { title: 'Post1' } } },
                        });
                        await prisma.user.create({
                            data: { myId: 'user2', email: 'user2@abc.com' },
                        });
                        await prisma.postLike.create({
                            data: { userId: 'user2', postId: 1, superLike: false },
                        });
                    });

                    it('get all', async () => {
                        const r = await handler({
                            method: 'get',
                            path: '/postLike',
                            prisma,
                        });

                        expect(r.status).toBe(200);
                        expect(r.body).toMatchObject({
                            data: [
                                {
                                    type: 'postLike',
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
                            prisma,
                        });

                        expect(r.status).toBe(200);
                        expect(r.body).toMatchObject({
                            data: {
                                type: 'postLike',
                                id: `1${idDivider}user2`,
                                attributes: { userId: 'user2', postId: 1, superLike: false },
                            },
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
                            data: { type: 'user', attributes: { myId: 'user1', email: 'user1@abc.com' } },
                        },
                        prisma,
                    });

                    expect(r.status).toBe(201);
                    expect(r.body).toMatchObject({
                        jsonapi: { version: '1.1' },
                        data: { type: 'user', id: 'user1', attributes: { email: 'user1@abc.com' } },
                    });
                });

                it('creates an item with date coercion', async () => {
                    const r = await handler({
                        method: 'post',
                        path: '/post',
                        query: {},
                        requestBody: {
                            data: {
                                type: 'post',
                                attributes: {
                                    id: 1,
                                    title: 'Post1',
                                    published: true,
                                    publishedAt: '2024-03-02T05:00:00.000Z',
                                },
                            },
                        },
                        prisma,
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
                                type: 'post',
                                attributes: {
                                    id: 1,
                                    title: 'a very very long long title',
                                },
                            },
                        },
                        prisma,
                    });

                    expect(r.status).toBe(422);
                    expect(r.body.errors[0].code).toBe('invalid-payload');
                });

                it('creates an item with collection relations', async () => {
                    await prisma.post.create({
                        data: { id: 1, title: 'Post1' },
                    });
                    await prisma.post.create({
                        data: { id: 2, title: 'Post2' },
                    });

                    const r = await handler({
                        method: 'post',
                        path: '/user',
                        query: {},
                        requestBody: {
                            data: {
                                type: 'user',
                                attributes: { myId: 'user1', email: 'user1@abc.com' },
                                relationships: {
                                    posts: {
                                        data: [
                                            { type: 'post', id: 1 },
                                            { type: 'post', id: 2 },
                                        ],
                                    },
                                },
                            },
                        },
                        prisma,
                    });

                    expect(r.status).toBe(201);
                    expect(r.body).toMatchObject({
                        jsonapi: { version: '1.1' },
                        data: {
                            type: 'user',
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
                                        { type: 'post', id: 1 },
                                        { type: 'post', id: 2 },
                                    ],
                                },
                            },
                        },
                    });
                });

                it('creates an item with single relation', async () => {
                    await prisma.user.create({
                        data: { myId: 'user1', email: 'user1@abc.com' },
                    });

                    const r = await handler({
                        method: 'post',
                        path: '/post',
                        query: {},
                        requestBody: {
                            data: {
                                type: 'post',
                                attributes: { title: 'Post1' },
                                relationships: {
                                    author: {
                                        data: { type: 'user', id: 'user1' },
                                    },
                                },
                            },
                        },
                        prisma,
                    });

                    expect(r.status).toBe(201);
                    expect(r.body).toMatchObject({
                        links: {
                            self: 'http://localhost/api/post/1',
                        },
                        data: {
                            type: 'post',
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
                                    data: { type: 'user', id: 'user1' },
                                },
                            },
                        },
                    });
                });

                it('create single relation disallowed', async () => {
                    await prisma.user.create({ data: { myId: 'user1', email: 'user1@abc.com' } });
                    await prisma.post.create({
                        data: { id: 1, title: 'Post1' },
                    });

                    const r = await handler({
                        method: 'post',
                        path: '/post/1/relationships/author',
                        query: {},
                        requestBody: {
                            data: { type: 'user', id: 'user1' },
                        },
                        prisma,
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
                    await prisma.user.create({ data: { myId: 'user1', email: 'user1@abc.com' } });
                    await prisma.post.create({
                        data: { id: 1, title: 'Post1' },
                    });
                    await prisma.post.create({
                        data: { id: 2, title: 'Post2' },
                    });

                    const r = await handler({
                        method: 'post',
                        path: '/user/user1/relationships/posts',
                        query: {},
                        requestBody: {
                            data: [
                                { type: 'post', id: 1 },
                                { type: 'post', id: 2 },
                            ],
                        },
                        prisma,
                    });

                    expect(r.status).toBe(200);
                    expect(r.body).toMatchObject({
                        links: {
                            self: 'http://localhost/api/user/user1/relationships/posts',
                        },
                        data: [
                            { type: 'post', id: 1 },
                            { type: 'post', id: 2 },
                        ],
                    });
                });

                it('create relation for nonexistent entity', async () => {
                    let r = await handler({
                        method: 'post',
                        path: '/user/user1/relationships/posts',
                        query: {},
                        requestBody: {
                            data: [{ type: 'post', id: 1 }],
                        },
                        prisma,
                    });

                    expect(r.status).toBe(404);

                    await prisma.user.create({
                        data: { myId: 'user1', email: 'user1@abc.com' },
                    });

                    r = await handler({
                        method: 'post',
                        path: '/user/user1/relationships/posts',
                        query: {},
                        requestBody: { data: [{ type: 'post', id: 1 }] },
                        prisma,
                    });

                    expect(r.status).toBe(404);
                });

                describe('compound id', () => {
                    beforeEach(async () => {
                        await prisma.user.create({ data: { myId: 'user1', email: 'user1@abc.com' } });
                        await prisma.post.create({
                            data: { id: 1, title: 'Post1' },
                        });
                    });

                    it('create single', async () => {
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
                            prisma,
                        });

                        expect(r.status).toBe(201);
                    });
                });
            });

            describe('PUT', () => {
                it('updates an item if it exists', async () => {
                    await prisma.user.create({
                        data: {
                            myId: 'user1',
                            email: 'user1@abc.com',
                        },
                    });
                    await prisma.post.create({
                        data: { id: 1, title: 'Post1' },
                    });
                    await prisma.post.create({
                        data: { id: 2, title: 'Post2' },
                    });

                    const r = await handler({
                        method: 'put',
                        path: '/user/user1',
                        query: {},
                        requestBody: {
                            data: {
                                type: 'user',
                                attributes: { email: 'user2@abc.com' },
                                relationships: {
                                    posts: {
                                        data: [
                                            { type: 'post', id: 1 },
                                            { type: 'post', id: 2 },
                                        ],
                                    },
                                },
                            },
                        },
                        prisma,
                    });

                    expect(r.status).toBe(200);
                    expect(r.body).toMatchObject({
                        links: {
                            self: 'http://localhost/api/user/user1',
                        },
                        data: {
                            type: 'user',
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
                                        { type: 'post', id: 1 },
                                        { type: 'post', id: 2 },
                                    ],
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
                                type: 'user',
                                attributes: { email: 'user2@abc.com' },
                            },
                        },
                        prisma,
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

                it('update an item with date coercion', async () => {
                    await prisma.post.create({ data: { id: 1, title: 'Post1' } });

                    const r = await handler({
                        method: 'put',
                        path: '/post/1',
                        query: {},
                        requestBody: {
                            data: {
                                type: 'post',
                                attributes: {
                                    published: true,
                                    publishedAt: '2024-03-02T05:00:00.000Z',
                                },
                            },
                        },
                        prisma,
                    });

                    expect(r.status).toBe(200);
                });

                it('update an item with zod violation', async () => {
                    await prisma.post.create({ data: { id: 1, title: 'Post1' } });

                    const r = await handler({
                        method: 'put',
                        path: '/post/1',
                        query: {},
                        requestBody: {
                            data: {
                                type: 'post',
                                attributes: {
                                    publishedAt: '2024-13-01',
                                },
                            },
                        },
                        prisma,
                    });

                    expect(r.status).toBe(422);
                    expect(r.body.errors[0].code).toBe('invalid-payload');
                });

                it('update item with compound id', async () => {
                    await prisma.user.create({ data: { myId: 'user1', email: 'user1@abc.com' } });
                    await prisma.post.create({ data: { id: 1, title: 'Post1' } });
                    await prisma.postLike.create({ data: { userId: 'user1', postId: 1, superLike: false } });

                    const r = await handler({
                        method: 'put',
                        path: `/postLike/1${idDivider}user1`,
                        query: {},
                        requestBody: {
                            data: {
                                type: 'postLike',
                                attributes: { superLike: true },
                            },
                        },
                        prisma,
                    });

                    expect(r.status).toBe(200);
                });

                it('update a single relation', async () => {
                    await prisma.user.create({ data: { myId: 'user1', email: 'user1@abc.com' } });
                    await prisma.post.create({
                        data: { id: 1, title: 'Post1' },
                    });

                    const r = await handler({
                        method: 'patch',
                        path: '/post/1/relationships/author',
                        query: {},
                        requestBody: {
                            data: {
                                type: 'user',
                                id: 'user1',
                            },
                        },
                        prisma,
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
                            type: 'user',
                            id: 'user1',
                        },
                    });
                });

                it('remove a single relation', async () => {
                    await prisma.user.create({
                        data: { myId: 'user1', email: 'user1@abc.com', posts: { create: { id: 1, title: 'Post1' } } },
                    });

                    const r = await handler({
                        method: 'patch',
                        path: '/post/1/relationships/author',
                        query: {},
                        requestBody: { data: null },
                        prisma,
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
                    await prisma.user.create({
                        data: { myId: 'user1', email: 'user1@abc.com', posts: { create: { id: 1, title: 'Post1' } } },
                    });
                    await prisma.post.create({
                        data: { id: 2, title: 'Post2' },
                    });

                    const r = await handler({
                        method: 'patch',
                        path: '/user/user1/relationships/posts',
                        query: {},
                        requestBody: {
                            data: [{ type: 'post', id: 2 }],
                        },
                        prisma,
                    });

                    expect(r.status).toBe(200);
                    expect(r.body).toMatchObject({
                        links: {
                            self: 'http://localhost/api/user/user1/relationships/posts',
                        },
                        data: [{ type: 'post', id: 2 }],
                    });
                });

                it('update a collection of relations to empty', async () => {
                    await prisma.user.create({
                        data: { myId: 'user1', email: 'user1@abc.com', posts: { create: { id: 1, title: 'Post1' } } },
                    });

                    const r = await handler({
                        method: 'patch',
                        path: '/user/user1/relationships/posts',
                        query: {},
                        requestBody: { data: [] },
                        prisma,
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
                                type: 'user',
                                id: 'user1',
                            },
                        },
                        prisma,
                    });
                    expect(r.status).toBe(404);

                    await prisma.post.create({
                        data: { id: 1, title: 'Post1' },
                    });

                    r = await handler({
                        method: 'patch',
                        path: '/post/1/relationships/author',
                        query: {},
                        requestBody: {
                            data: {
                                type: 'user',
                                id: 'user1',
                            },
                        },
                        prisma,
                    });

                    expect(r.status).toBe(404);
                });
            });

            describe('DELETE', () => {
                it('deletes an item if it exists', async () => {
                    // Create a user first
                    await prisma.user.create({
                        data: {
                            myId: 'user1',
                            email: 'user1@abc.com',
                        },
                    });

                    const r = await handler({
                        method: 'delete',
                        path: '/user/user1',
                        prisma,
                    });

                    expect(r.status).toBe(204);
                    expect(r.body).toBeUndefined();
                });

                it('deletes an item with compound id', async () => {
                    await prisma.user.create({
                        data: { myId: 'user1', email: 'user1@abc.com', posts: { create: { id: 1, title: 'Post1' } } },
                    });
                    await prisma.postLike.create({ data: { userId: 'user1', postId: 1, superLike: false } });

                    const r = await handler({
                        method: 'delete',
                        path: `/postLike/1${idDivider}user1`,
                        prisma,
                    });
                    expect(r.status).toBe(204);
                    expect(r.body).toBeUndefined();
                });

                it('returns 404 if the user does not exist', async () => {
                    const r = await handler({
                        method: 'delete',
                        path: '/user/nonexistentuser',
                        prisma,
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

                it('delete single relation disallowed', async () => {
                    await prisma.user.create({
                        data: { myId: 'user1', email: 'user1@abc.com', posts: { create: { id: 1, title: 'Post1' } } },
                    });

                    const r = await handler({
                        method: 'delete',
                        path: '/post/1/relationships/author',
                        query: {},
                        prisma,
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
                    await prisma.user.create({
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
                            data: [{ type: 'post', id: 1 }],
                        },
                        prisma,
                    });

                    expect(r.status).toBe(200);
                    expect(r.body).toMatchObject({
                        jsonapi: {
                            version: '1.1',
                        },
                        links: {
                            self: 'http://localhost/api/user/user1/relationships/posts',
                        },
                        data: [{ type: 'post', id: 2 }],
                    });
                });

                it('delete relations for nonexistent entity', async () => {
                    const r = await handler({
                        method: 'delete',
                        path: '/user/user1/relationships/posts',
                        query: {},
                        requestBody: {
                            data: [{ type: 'post', id: 1 }],
                        },
                        prisma,
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
                            data: { type: 'user', attributes: { myId: 'user1', email: 'user1.com' } },
                        },
                        prisma,
                    });

                    expect(r.status).toBe(422);
                    expect(r.body.errors[0].code).toBe('invalid-payload');
                    expect(r.body.errors[0].reason).toBe(CrudFailureReason.DATA_VALIDATION_VIOLATION);
                    expect(r.body.errors[0].zodErrors).toBeTruthy();
                });
            });
        });
    });

    describe('REST server tests - enhanced prisma', () => {
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

        beforeAll(async () => {
            const params = await loadSchema(schema);

            prisma = params.enhanceRaw(params.prisma, params);
            zodSchemas = params.zodSchemas;
            modelMeta = params.modelMeta;

            const _handler = makeHandler({ endpoint: 'http://localhost/api', pageSize: 5 });
            handler = (args) =>
                _handler({ ...args, zodSchemas, modelMeta, url: new URL(`http://localhost/${args.path}`) });
        });

        it('update policy rejection test', async () => {
            let r = await handler({
                method: 'post',
                path: '/foo',
                query: {},
                requestBody: {
                    data: { type: 'foo', attributes: { id: 1, value: 0 } },
                },
                prisma,
            });
            expect(r.status).toBe(201);

            r = await handler({
                method: 'put',
                path: '/foo/1',
                query: {},
                requestBody: {
                    data: { type: 'foo', attributes: { value: 1 } },
                },
                prisma,
            });
            expect(r.status).toBe(403);
            expect(r.body.errors[0].code).toBe('forbidden');
            expect(r.body.errors[0].reason).toBe(CrudFailureReason.ACCESS_POLICY_VIOLATION);
        });

        it('read-back policy rejection test', async () => {
            const r = await handler({
                method: 'post',
                path: '/bar',
                query: {},
                requestBody: {
                    data: { type: 'bar', attributes: { id: 1, value: 0 } },
                },
                prisma,
            });
            expect(r.status).toBe(403);
            expect(r.body.errors[0].reason).toBe(CrudFailureReason.RESULT_NOT_READABLE);
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
        password      String    @password @omit
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

        beforeAll(async () => {
            const params = await loadSchema(schema);

            prisma = params.enhanceRaw(params.prisma, params);
            zodSchemas = params.zodSchemas;
            modelMeta = params.modelMeta;

            const _handler = makeHandler({ endpoint: 'http://localhost/api', pageSize: 5 });
            handler = (args) =>
                _handler({ ...args, zodSchemas, modelMeta, url: new URL(`http://localhost/${args.path}`) });
        });

        it('crud test', async () => {
            let r = await handler({
                method: 'get',
                path: '/user',
                prisma,
            });
            expect(r.status).toBe(200);
            expect(r.body.data).toHaveLength(0);

            r = await handler({
                method: 'post',
                path: '/user',
                query: {},
                requestBody: {
                    data: { type: 'user', attributes: { email: 'user1@abc.com', password: '1234' } },
                },
                prisma,
            });
            expect(r.status).toBe(201);

            r = await handler({
                method: 'get',
                path: '/user',
                prisma,
            });
            expect(r.status).toBe(200);
            expect(r.body.data).toHaveLength(1);

            r = await handler({
                method: 'post',
                path: '/user',
                query: {},
                requestBody: {
                    data: { type: 'user', attributes: { email: 'user1@abc.com', password: '1234' } },
                },
                prisma,
            });
            expect(r.status).toBe(400);
            expect(r.body.errors[0].prismaCode).toBe('P2002');
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
            const { prisma, zodSchemas, modelMeta } = await loadSchema(schema);

            const _handler = makeHandler({ endpoint: 'http://localhost/api', pageSize: 5 });
            handler = (args) =>
                _handler({ ...args, zodSchemas, modelMeta, url: new URL(`http://localhost/${args.path}`) });

            await prisma.bar.create({ data: { id: 1, bytes: Buffer.from([7, 8, 9]) } });

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
                bytes: Buffer.from([1, 2, 3, 4]),
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
                prisma,
            });
            expect(r.status).toBe(201);
            // result is serializable
            expect(JSON.stringify(r.body)).toBeTruthy();
            let serializationMeta = r.body.meta.serialization;
            expect(serializationMeta).toBeTruthy();
            let deserialized: any = SuperJSON.deserialize({ json: r.body, meta: serializationMeta });
            let data = deserialized.data.attributes;
            expect(typeof data.bigInt).toBe('bigint');
            expect(Buffer.isBuffer(data.bytes)).toBeTruthy();
            expect(data.date instanceof Date).toBeTruthy();
            expect(Decimal.isDecimal(data.decimal)).toBeTruthy();

            const updateAttrs = {
                bigInt: BigInt(1534543543534),
                date: new Date(),
                decimal: decimalValue2,
                bytes: Buffer.from([5, 2, 3, 4]),
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
                prisma,
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
            expect(data.bytes.toString('base64')).toEqual(updateAttrs.bytes.toString('base64'));

            r = await handler({
                method: 'get',
                path: '/foo/1',
                query: {},
                prisma,
            });
            // result is serializable
            expect(JSON.stringify(r.body)).toBeTruthy();
            serializationMeta = r.body.meta.serialization;
            expect(serializationMeta).toBeTruthy();
            deserialized = SuperJSON.deserialize({ json: r.body, meta: serializationMeta });
            data = deserialized.data.attributes;
            expect(typeof data.bigInt).toBe('bigint');
            expect(Buffer.isBuffer(data.bytes)).toBeTruthy();
            expect(data.date instanceof Date).toBeTruthy();
            expect(Decimal.isDecimal(data.decimal)).toBeTruthy();

            r = await handler({
                method: 'get',
                path: '/foo',
                query: { include: 'bars' },
                prisma,
            });
            // result is serializable
            expect(JSON.stringify(r.body)).toBeTruthy();
            serializationMeta = r.body.meta.serialization;
            expect(serializationMeta).toBeTruthy();
            deserialized = SuperJSON.deserialize({ json: r.body, meta: serializationMeta });
            const included = deserialized.included[0];
            expect(Buffer.isBuffer(included.attributes.bytes)).toBeTruthy();
        });
    });
});
