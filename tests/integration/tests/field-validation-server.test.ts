import path from 'path';
import { makeClient, run, setup } from './utils';
import { ServerErrorCode } from '../../../packages/internal/src/types';

describe('Field validation server-side tests', () => {
    let origDir: string;

    beforeAll(async () => {
        origDir = path.resolve('.');
        await setup('./tests/field-validation.zmodel');
    });

    beforeEach(() => {
        run('npx prisma migrate reset --schema ./zenstack/schema.prisma -f');
    });

    afterAll(() => {
        process.chdir(origDir);
    });

    it('direct write test', async () => {
        await makeClient('/api/data/User')
            .post('/')
            .send({
                data: {
                    id: '1',
                    password: 'abc123',
                    handle: 'hello world',
                },
            })
            .expect(400)
            .expect((resp) => {
                expect(resp.body.code).toBe(
                    ServerErrorCode.INVALID_REQUEST_PARAMS
                );
                expect(resp.body.message).toContain(
                    'String must contain at least 8 character(s) at "password"'
                );
                expect(resp.body.message).toContain('Required at "email"');
                expect(resp.body.message).toContain('Invalid at "handle"');
            });

        await makeClient('/api/data/User')
            .post('/')
            .send({
                data: {
                    id: '1',
                    password: 'abc123!@#',
                    email: 'something',
                    handle: 'user1user1user1user1user1',
                },
            })
            .expect(400)
            .expect((resp) => {
                expect(resp.body.code).toBe(
                    ServerErrorCode.INVALID_REQUEST_PARAMS
                );
                expect(resp.body.message).toContain('Invalid email at "email"');
                expect(resp.body.message).toContain(
                    'must end with "@myorg.com" at "email"'
                );
                expect(resp.body.message).toContain('Invalid at "handle"');
            });

        await makeClient('/api/data/User')
            .post('/')
            .send({
                data: {
                    id: '1',
                    password: 'abc123!@#',
                    email: 'who@myorg.com',
                    handle: 'user1',
                },
            })
            .expect(201);

        await makeClient('/api/data/User/1')
            .put('/')
            .send({
                data: {
                    password: 'abc123',
                    email: 'something',
                },
            })
            .expect(400)
            .expect((resp) => {
                expect(resp.body.code).toBe(
                    ServerErrorCode.INVALID_REQUEST_PARAMS
                );
                expect(resp.body.message).toContain(
                    'String must contain at least 8 character(s) at "password"'
                );
                expect(resp.body.message).toContain('Invalid email at "email"');
                expect(resp.body.message).toContain(
                    'must end with "@myorg.com" at "email"'
                );
            });
    });

    it('direct write more test', async () => {
        await makeClient('/api/data/User')
            .post('/')
            .send({
                data: {
                    id: '1',
                    password: 'abc123!@#',
                    email: 'who@myorg.com',
                    handle: 'user1',
                },
            })
            .expect(201);

        await makeClient('/api/data/UserData')
            .post('/')
            .send({
                data: {
                    userId: '1',
                    a: 0,
                    b: -1,
                    c: 0,
                    d: 1,
                    text1: 'a',
                    text2: 'xyz',
                    text3: 'a',
                    text4: 'abcabc',
                    text5: 'abc',
                },
            })
            .expect(400)
            .expect((resp) => {
                expect(resp.body.code).toBe(
                    ServerErrorCode.INVALID_REQUEST_PARAMS
                );
                expect(resp.body.message).toContain(
                    'Number must be greater than 0 at "a"'
                );
                expect(resp.body.message).toContain(
                    'Number must be greater than or equal to 0 at "b"'
                );
                expect(resp.body.message).toContain(
                    'Number must be less than 0 at "c"'
                );
                expect(resp.body.message).toContain(
                    'Number must be less than or equal to 0 at "d"'
                );
                expect(resp.body.message).toContain(
                    'must start with "abc" at "text1"'
                );
                expect(resp.body.message).toContain(
                    'must end with "def" at "text2"'
                );
                expect(resp.body.message).toContain(
                    'String must contain at least 3 character(s) at "text3"'
                );
                expect(resp.body.message).toContain(
                    'String must contain at most 5 character(s) at "text4"'
                );
                expect(resp.body.message).toContain(
                    'must end with "xyz" at "text5"'
                );
            });

        await makeClient('/api/data/UserData')
            .post('/')
            .send({
                data: {
                    userId: '1',
                    a: 1,
                    b: 0,
                    c: -1,
                    d: 0,
                    text1: 'abc123',
                    text2: 'def',
                    text3: 'aaa',
                    text4: 'abcab',
                },
            })
            .expect(201);
    });

    it('nested create test', async () => {
        const user = {
            password: 'abc123!@#',
            email: 'who@myorg.com',
            handle: 'user1',
        };

        const userData = {
            a: 1,
            b: 0,
            c: -1,
            d: 0,
            text1: 'abc123',
            text2: 'def',
            text3: 'aaa',
            text4: 'abcab',
        };

        const tasks = [
            {
                slug: 'abcabc',
            },
            {
                slug: 'abcdef',
            },
        ];

        await makeClient('/api/data/User')
            .post('/')
            .send({
                data: {
                    ...user,
                    userData: {
                        create: {
                            a: 0,
                        },
                    },
                    tasks: {
                        create: {
                            slug: 'abc',
                        },
                    },
                },
            })
            .expect(400)
            .expect((resp) => {
                expect(resp.body.code).toBe(
                    ServerErrorCode.INVALID_REQUEST_PARAMS
                );
                expect(resp.body.message).toContain(
                    'Invalid input at "userData.create"'
                );
                expect(resp.body.message).toContain(
                    'Invalid at "tasks.create.slug"'
                );
            });

        await makeClient('/api/data/User')
            .post('/')
            .send({
                data: {
                    ...user,
                    userData: { create: userData },
                    tasks: {
                        create: {
                            slug: 'abcabc',
                        },
                    },
                },
            })
            .expect(201);

        await makeClient('/api/data/User')
            .post('/')
            .send({
                data: {
                    ...user,
                    userData: {
                        connectOrCreate: {
                            where: {
                                id: '1',
                            },
                            create: {
                                a: 0,
                            },
                        },
                    },
                    tasks: {
                        create: [
                            {
                                slug: 'abc',
                            },
                            {
                                slug: 'abcdef',
                            },
                        ],
                    },
                },
            })
            .expect(400)
            .expect((resp) => {
                expect(resp.body.code).toBe(
                    ServerErrorCode.INVALID_REQUEST_PARAMS
                );
                expect(resp.body.message).toContain(
                    'Invalid input at "userData.connectOrCreate"'
                );
                expect(resp.body.message).toContain(
                    'Invalid at "tasks.create[0].slug"'
                );
            });

        await makeClient('/api/data/User')
            .post('/')
            .send({
                data: {
                    ...user,
                    tasks: {
                        createMany: [
                            {
                                slug: 'abc',
                            },
                            {
                                slug: 'abcdef',
                            },
                        ],
                    },
                },
            })
            .expect(400)
            .expect((resp) => {
                expect(resp.body.code).toBe(
                    ServerErrorCode.INVALID_REQUEST_PARAMS
                );
                expect(resp.body.message).toContain(
                    'Invalid at "tasks.createMany[0].slug"'
                );
            });

        await makeClient('/api/data/User')
            .post('/')
            .send({
                data: {
                    ...user,
                    userData: {
                        connectOrCreate: {
                            where: {
                                id: '1',
                            },
                            create: userData,
                        },
                    },
                    tasks: {
                        create: tasks,
                    },
                },
            })
            .expect(201);
    });

    it('nested update test', async () => {
        const user = {
            password: 'abc123!@#',
            email: 'who@myorg.com',
            handle: 'user1',
        };

        const userData = {
            a: 1,
            b: 0,
            c: -1,
            d: 0,
            text1: 'abc123',
            text2: 'def',
            text3: 'aaa',
            text4: 'abcab',
        };

        const tasks = [
            {
                id: '1',
                slug: 'abcabc',
            },
            {
                id: '2',
                slug: 'abcdef',
            },
        ];

        await makeClient('/api/data/User')
            .post('/')
            .send({
                data: {
                    id: '1',
                    ...user,
                },
            })
            .expect(201);

        const client = makeClient('/api/data/User/1');

        await client
            .put('/')
            .send({
                data: {
                    userData: {
                        create: {
                            a: 0,
                        },
                    },
                    tasks: {
                        create: {
                            slug: 'abc',
                        },
                    },
                },
            })
            .expect(400)
            .expect((resp) => {
                expect(resp.body.code).toBe(
                    ServerErrorCode.INVALID_REQUEST_PARAMS
                );
                expect(resp.body.message).toContain(
                    'Invalid input at "userData.create"'
                );
                expect(resp.body.message).toContain(
                    'Invalid at "tasks.create.slug"'
                );
            });

        await client
            .put('/')
            .send({
                data: {
                    userData: {
                        create: { id: '1', ...userData },
                    },
                    tasks: {
                        create: {
                            id: '1',
                            slug: 'abcabc',
                        },
                    },
                },
            })
            .expect(200);

        await client
            .put('/')
            .send({
                data: {
                    userData: {
                        update: {
                            a: 0,
                        },
                    },
                    tasks: {
                        update: {
                            where: { id: '1' },
                            data: {
                                slug: 'abc',
                            },
                        },
                    },
                },
            })
            .expect(400)
            .expect((resp) => {
                expect(resp.body.code).toBe(
                    ServerErrorCode.INVALID_REQUEST_PARAMS
                );
                expect(resp.body.message).toContain(
                    'Number must be greater than 0 at "userData.update.a"'
                );
                expect(resp.body.message).toContain(
                    'Invalid at "tasks.update.data.slug"'
                );
            });

        await client
            .put('/')
            .send({
                data: {
                    userData: {
                        update: {
                            a: 2,
                        },
                    },
                    tasks: {
                        update: {
                            where: { id: '1' },
                            data: {
                                slug: 'defdef',
                            },
                        },
                    },
                },
            })
            .expect(200);

        await client
            .put('/')
            .send({
                where: { id: '1' },
                data: {
                    userData: {
                        upsert: {
                            create: {
                                a: 0,
                            },
                            update: {
                                a: 0,
                            },
                        },
                    },
                    tasks: {
                        updateMany: {
                            where: { id: '1' },
                            data: {
                                slug: 'abc',
                            },
                        },
                    },
                },
            })
            .expect(400)
            .expect((resp) => {
                expect(resp.body.code).toBe(
                    ServerErrorCode.INVALID_REQUEST_PARAMS
                );
                expect(resp.body.message).toContain(
                    'Number must be greater than 0 at "userData.upsert.create.a"'
                );
                expect(resp.body.message).toContain(
                    'Number must be greater than 0 at "userData.upsert.update.a"'
                );
                expect(resp.body.message).toContain(
                    'Invalid at "tasks.updateMany.data.slug"'
                );
            });

        await client
            .put('/')
            .send({
                data: {
                    userData: {
                        upsert: {
                            create: {
                                ...userData,
                            },
                            update: {
                                a: 1,
                            },
                        },
                    },
                    tasks: {
                        updateMany: {
                            where: { id: '1' },
                            data: {
                                slug: 'xxxyyy',
                            },
                        },
                    },
                },
            })
            .expect(200);
    });
});
