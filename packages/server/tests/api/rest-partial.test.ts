/* eslint-disable @typescript-eslint/no-explicit-any */
/// <reference types="@types/jest" />

import { type ModelMeta } from '@zenstackhq/runtime';
import { loadSchema, run } from '@zenstackhq/testtools';
import makeHandler from '../../src/api/rest';

describe('REST server tests', () => {
    let prisma: any;
    let zodSchemas: any;
    let modelMeta: ModelMeta;
    let handler: (any: any) => Promise<{ status: number; body: any }>;

    beforeEach(async () => {
        run('npx prisma migrate reset --force');
        run('npx prisma db push');
    });

    describe('REST server tests - sparse fieldsets', () => {
        const schema = `
    model User {
        myId String @id @default(cuid())
        createdAt DateTime @default (now())
        updatedAt DateTime @updatedAt
        email String @unique @email
        nickName String
        posts Post[]
    }
    
    model Post {
        id Int @id @default(autoincrement())
        createdAt DateTime @default (now())
        updatedAt DateTime @updatedAt
        title String @length(1, 10)
        content String
        author User? @relation(fields: [authorId], references: [myId])
        authorId String?
        published Boolean @default(false)
        publishedAt DateTime?
        viewCount Int @default(0)
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

        // it('returns all items and fields when there are some in the database', async () => {
        //     // Create users first
        //     await prisma.user.create({
        //         data: {
        //             myId: 'user1',
        //             email: 'user1@abc.com',
        //             nickName: 'one',
        //             posts: {
        //                 create: { title: 'Post1', content: 'Post 1 Content' },
        //             },
        //         },
        //     });
        //     await prisma.user.create({
        //         data: {
        //             myId: 'user2',
        //             email: 'user2@abc.com',
        //             nickName: 'two',
        //             posts: {
        //                 create: { title: 'Post2', content: 'Post 2 Content' },
        //             },
        //         },
        //     });

        //     const r = await handler({
        //         method: 'get',
        //         path: '/user',
        //         prisma,
        //     });

        //     expect(r.status).toBe(200);
        //     expect(r.body).toMatchObject({
        //         links: {
        //             self: 'http://localhost/api/user',
        //         },
        //         meta: {
        //             total: 2,
        //         },
        //         data: [
        //             {
        //                 type: 'user',
        //                 id: 'user1',
        //                 attributes: { email: 'user1@abc.com', nickName: 'one' },
        //                 links: {
        //                     self: 'http://localhost/api/user/user1',
        //                 },
        //                 relationships: {
        //                     posts: {
        //                         links: {
        //                             self: 'http://localhost/api/user/user1/relationships/posts',
        //                             related: 'http://localhost/api/user/user1/posts',
        //                         },
        //                         data: [{ type: 'post', id: 1 }],
        //                     },
        //                 },
        //             },
        //             {
        //                 type: 'user',
        //                 id: 'user2',
        //                 attributes: { email: 'user2@abc.com', nickName: 'two' },
        //                 links: {
        //                     self: 'http://localhost/api/user/user2',
        //                 },
        //                 relationships: {
        //                     posts: {
        //                         links: {
        //                             self: 'http://localhost/api/user/user2/relationships/posts',
        //                             related: 'http://localhost/api/user/user2/posts',
        //                         },
        //                         data: [{ type: 'post', id: 2 }],
        //                     },
        //                 },
        //             },
        //         ],
        //     });
        // });

        // it('returns only the requested fields when there are some in the database', async () => {
        //     // Create users first
        //     await prisma.user.create({
        //         data: {
        //             myId: 'user1',
        //             email: 'user1@abc.com',
        //             nickName: 'one',
        //             posts: {
        //                 create: { title: 'Post1', content: 'Post 1 Content' },
        //             },
        //         },
        //     });
        //     await prisma.user.create({
        //         data: {
        //             myId: 'user2',
        //             email: 'user2@abc.com',
        //             nickName: 'two',
        //             posts: {
        //                 create: { title: 'Post2', content: 'Post 2 Content' },
        //             },
        //         },
        //     });

        //     const r = await handler({
        //         method: 'get',
        //         path: '/user',
        //         prisma,
        //         query: { ['fields[user]']: 'email,nickName' },
        //     });

        //     expect(r.status).toBe(200);

        //     console.log('body', JSON.stringify(r.body));

        //     expect(r.body.data).toEqual([
        //         {
        //             type: 'user',
        //             id: 'user1',
        //             attributes: {
        //                 email: 'user1@abc.com',
        //                 nickName: 'one',
        //             },
        //             links: {
        //                 self: 'http://localhost/api/user/user1',
        //             },
        //             relationships: {
        //                 posts: {
        //                     links: {
        //                         self: 'http://localhost/api/user/user1/relationships/posts',
        //                         related: 'http://localhost/api/user/user1/posts',
        //                     },
        //                     data: [
        //                         {
        //                             type: 'post',
        //                             id: 1,
        //                         },
        //                     ],
        //                 },
        //             },
        //         },
        //         {
        //             type: 'user',
        //             id: 'user2',
        //             attributes: {
        //                 email: 'user2@abc.com',
        //                 nickName: 'two',
        //             },
        //             links: {
        //                 self: 'http://localhost/api/user/user2',
        //             },
        //             relationships: {
        //                 posts: {
        //                     links: {
        //                         self: 'http://localhost/api/user/user2/relationships/posts',
        //                         related: 'http://localhost/api/user/user2/posts',
        //                     },
        //                     data: [
        //                         {
        //                             type: 'post',
        //                             id: 2,
        //                         },
        //                     ],
        //                 },
        //             },
        //         },
        //     ]);
        // });

        // it('returns collection with only the requested fields when there are includes', async () => {
        //     // Create users first
        //     await prisma.user.create({
        //         data: {
        //             myId: 'user1',
        //             email: 'user1@abc.com',
        //             nickName: 'one',
        //             posts: {
        //                 create: { title: 'Post1', content: 'Post 1 Content', published: true },
        //             },
        //         },
        //     });
        //     await prisma.user.create({
        //         data: {
        //             myId: 'user2',
        //             email: 'user2@abc.com',
        //             nickName: 'two',
        //             posts: {
        //                 create: { title: 'Post2', content: 'Post 2 Content', published: true },
        //             },
        //         },
        //     });

        //     const r = await handler({
        //         method: 'get',
        //         path: '/user',
        //         prisma,
        //         query: { ['fields[user]']: 'email,nickName', ['fields[post]']: 'title,published', include: 'posts' },
        //     });

        //     expect(r.status).toBe(200);

        //     console.log('body', JSON.stringify(r.body));

        //     expect(r.body.data).toEqual([
        //         {
        //             type: 'user',
        //             id: 'user1',
        //             attributes: {
        //                 email: 'user1@abc.com',
        //                 nickName: 'one',
        //             },
        //             links: {
        //                 self: 'http://localhost/api/user/user1',
        //             },
        //             relationships: {
        //                 posts: {
        //                     links: {
        //                         self: 'http://localhost/api/user/user1/relationships/posts',
        //                         related: 'http://localhost/api/user/user1/posts',
        //                     },
        //                     data: [
        //                         {
        //                             type: 'post',
        //                             id: 1,
        //                         },
        //                     ],
        //                 },
        //             },
        //         },
        //         {
        //             type: 'user',
        //             id: 'user2',
        //             attributes: {
        //                 email: 'user2@abc.com',
        //                 nickName: 'two',
        //             },
        //             links: {
        //                 self: 'http://localhost/api/user/user2',
        //             },
        //             relationships: {
        //                 posts: {
        //                     links: {
        //                         self: 'http://localhost/api/user/user2/relationships/posts',
        //                         related: 'http://localhost/api/user/user2/posts',
        //                     },
        //                     data: [
        //                         {
        //                             type: 'post',
        //                             id: 2,
        //                         },
        //                     ],
        //                 },
        //             },
        //         },
        //     ]);

        //     expect(r.body.included).toEqual([
        //         {
        //             type: 'post',
        //             id: 1,
        //             attributes: {
        //                 title: 'Post1',
        //                 published: false,
        //             },
        //             links: {
        //                 self: 'http://localhost/api/post/1',
        //             },
        //             relationships: {
        //                 author: {
        //                     links: {
        //                         self: 'http://localhost/api/post/1/relationships/author',
        //                         related: 'http://localhost/api/post/1/author',
        //                     },
        //                 },
        //             },
        //         },
        //         {
        //             type: 'post',
        //             id: 2,
        //             attributes: {
        //                 title: 'Post2',
        //                 published: true,
        //             },
        //             links: {
        //                 self: 'http://localhost/api/post/2',
        //             },
        //             relationships: {
        //                 author: {
        //                     links: {
        //                         self: 'http://localhost/api/post/2/relationships/author',
        //                         related: 'http://localhost/api/post/2/author',
        //                     },
        //                 },
        //             },
        //         },
        //     ]);
        // });

        it('returns the full item when the ID is specified', async () => {
            // Create a user first
            await prisma.user.create({
                data: {
                    myId: 'user1',
                    email: 'user1@abc.com',
                    nickName: 'User 1',
                    posts: { create: { title: 'Post1', content: 'Post 1 Content' } },
                },
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
                    attributes: { email: 'user1@abc.com', nickName: 'User 1' },
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

        it('returns only the requested fields when the ID is specified', async () => {
            // Create a user first
            await prisma.user.create({
                data: {
                    myId: 'user1',
                    email: 'user1@abc.com',
                    nickName: 'User 1',
                    posts: { create: { title: 'Post1', content: 'Post 1 Content' } },
                },
            });

            const r = await handler({
                method: 'get',
                path: '/user/user1',
                prisma,
                query: { ['fields[user]']: 'email' },
            });

            expect(r.status).toBe(200);
            expect(r.body.data).toEqual({
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
            });
        });

        /**
                


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

                it('toplevel filtering', async () => {
                    await prisma.user.create({
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
                    r = await handler({
                        method: 'get',
                        path: '/post',
                        query: {
                            ['filter[author][email]']: 'user1@abc.com',
                            ['filter[title]']: 'Post1',
                        },
                        prisma,
                    });
                    expect(r.body.data).toHaveLength(1);
                    r = await handler({
                        method: 'get',
                        path: '/post',
                        query: {
                            ['filter[author][email]']: 'user1@abc.com',
                            ['filter[title]']: 'Post2',
                        },
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

                    // relation filter with multiple values
                    r = await handler({
                        method: 'get',
                        path: '/post',
                        query: { ['filter[author]']: 'user1,user2' },
                        prisma,
                    });
                    expect(r.body.data).toHaveLength(2);

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

                    // typedef equality filter
                    r = await handler({
                        method: 'get',
                        path: '/user',
                        query: { ['filter[address]']: JSON.stringify({ city: 'Seattle' }) },
                        prisma,
                    });
                    expect(r.body.data).toHaveLength(1);
                    r = await handler({
                        method: 'get',
                        path: '/user',
                        query: { ['filter[address]']: JSON.stringify({ city: 'Tokyo' }) },
                        prisma,
                    });
                    expect(r.body.data).toHaveLength(0);

                    // plain json equality filter
                    r = await handler({
                        method: 'get',
                        path: '/user',
                        query: { ['filter[someJson]']: JSON.stringify('foo') },
                        prisma,
                    });
                    expect(r.body.data).toHaveLength(1);
                    r = await handler({
                        method: 'get',
                        path: '/user',
                        query: { ['filter[someJson]']: JSON.stringify('bar') },
                        prisma,
                    });
                    expect(r.body.data).toHaveLength(0);

                    // invalid json
                    r = await handler({
                        method: 'get',
                        path: '/user',
                        query: { ['filter[someJson]']: '{ hello: world }' },
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
                **/
    });
});
