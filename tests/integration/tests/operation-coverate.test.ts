import path from 'path';
import { makeClient, run, setup } from './utils';

describe('Operation Coverage Tests', () => {
    let workDir: string;
    let origDir: string;

    beforeAll(async () => {
        origDir = path.resolve('.');
        workDir = await setup('./tests/operations.zmodel');
    });

    beforeEach(() => {
        run('npx prisma migrate reset --schema ./zenstack/schema.prisma -f');
    });

    afterAll(() => {
        process.chdir(origDir);
    });

    //#region Empty Policy

    it('empty policy', async () => {
        const client = makeClient('/api/data/EmptyPolicy');
        await client.post('/').send({ data: {} }).expect(403);
        await client
            .get('/')
            .expect((resp) => expect(resp.body).toHaveLength(0));
    });

    it('nested write empty policy to-many', async () => {
        const client = makeClient('/api/data/M1');
        await client
            .post('/')
            .send({
                data: {
                    m2: {
                        create: [{}],
                    },
                },
            })
            .expect(403);
    });

    it('nested write empty policy to-one', async () => {
        const client = makeClient('/api/data/M1');
        await client
            .post('/')
            .send({
                data: {
                    m3: {
                        create: {},
                    },
                },
            })
            .expect(403);
    });

    //#endregion

    //#region Toplevel operations

    it('toplevel find and get', async () => {
        await makeClient('/api/data/M4')
            .post('/')
            .send({
                data: {
                    id: '1',
                    value: 1,
                },
            })
            .expect(201);

        await makeClient('/api/data/M4')
            .get('/')
            .expect((resp) => expect(resp.body).toHaveLength(0));

        await makeClient('/api/data/M4/1').get('/').expect(404);

        await makeClient('/api/data/M4')
            .post('/')
            .send({
                data: {
                    id: '2',
                    value: 2,
                },
            })
            .expect(201);

        await makeClient('/api/data/M4')
            .get('/')
            .expect((resp) => expect(resp.body).toHaveLength(1));

        await makeClient('/api/data/M4/2').get('/').expect(200);
    });

    it('toplevel create, update and delete', async () => {
        await makeClient('/api/data/M4')
            .post('/')
            .send({
                data: {
                    value: 0,
                },
            })
            .expect(403);

        await makeClient('/api/data/M4')
            .post('/')
            .send({
                data: {
                    id: '1',
                    value: 1,
                },
            })
            .expect(201);

        await makeClient('/api/data/M4/1')
            .put('/')
            .send({
                data: {
                    value: 1,
                },
            })
            .expect(403);

        await makeClient('/api/data/M4')
            .post('/')
            .send({
                data: {
                    id: '2',
                    value: 2,
                },
            })
            .expect(201);

        await makeClient('/api/data/M4/2')
            .put('/')
            .send({
                data: {
                    value: 3,
                },
            })
            .expect(200);

        await makeClient('/api/data/M4/1').delete('/').expect(403);
        await makeClient('/api/data/M4/2').delete('/').expect(200);
    });

    //#endregion

    //#region Nested To-one

    it('nested to-one writes', async () => {
        // reject because nested m5 fails 'create' rule
        await makeClient('/api/data/M5')
            .post('/')
            .send({
                data: {
                    m6: {
                        create: {
                            value: 0,
                        },
                    },
                },
            })
            .expect(403);
        await makeClient('/api/data/M5')
            .post('/')
            .send({
                data: {
                    id: '1',
                    m6: {
                        create: {
                            id: '1',
                            value: 1,
                        },
                    },
                },
            })
            .expect(201);
        // reject because nested m6 fails 'update' rule
        await makeClient('/api/data/M5/1')
            .put('/')
            .send({
                data: {
                    m6: {
                        update: {
                            value: 2,
                        },
                    },
                },
            })
            .expect(403);
        // nest create during update
        await makeClient('/api/data/M5')
            .post('/')
            .send({
                data: {
                    id: '1.1',
                },
            })
            .expect(201);
        // reject because nested m6 fail 'create' rule
        await makeClient('/api/data/M5/1.1')
            .put('/')
            .send({
                data: {
                    m6: {
                        create: {
                            value: 0,
                        },
                    },
                },
            })
            .expect(403);
        // should succeed now when the nested create meets policy
        await makeClient('/api/data/M5/1.1')
            .put('/')
            .send({
                data: {
                    m6: {
                        create: {
                            value: 1,
                        },
                    },
                },
            })
            .expect(200);

        // test nested delete
        await makeClient('/api/data/M5')
            .post('/')
            .send({
                data: {
                    id: '2',
                    m6: {
                        create: {
                            id: '2',
                            value: 2,
                        },
                    },
                },
            })
            .expect(201);

        // reject because m6 fails 'delete' rule
        await makeClient('/api/data/M5/2')
            .put('/')
            .send({
                data: {
                    id: '2',
                    m6: {
                        delete: true,
                    },
                },
            })
            .expect(403);

        await makeClient('/api/data/M5/2')
            .put('/')
            .send({
                data: {
                    m6: {
                        update: {
                            value: 3,
                        },
                    },
                },
            })
            .expect(200);

        // item should be still there
        await makeClient('/api/data/M6/2').get('/').expect(200);

        await makeClient('/api/data/M5/2')
            .put('/')
            .send({
                data: {
                    id: '2',
                    m6: {
                        delete: true,
                    },
                },
            })
            .expect(200);
        await makeClient('/api/data/M6/2').get('/').expect(404);
    });

    //#endregion

    //#region Nested To-many

    it('nested to-many create denied', async () => {
        const client = makeClient('/api/data/M5');

        // single-create
        await client
            .post('/')
            .send({
                data: {
                    m7: {
                        create: {
                            value: 0,
                        },
                    },
                },
            })
            .expect(403);

        // multi-create
        await client
            .post('/')
            .send({
                data: {
                    m7: {
                        create: [
                            {
                                value: 0,
                            },
                            {
                                value: 1,
                            },
                        ],
                    },
                },
            })
            .expect(403);
    });

    it('nested to-many create allowed', async () => {
        const client = makeClient('/api/data/M5');

        // single-create
        await client
            .post('/')
            .send({
                data: {
                    m7: {
                        create: {
                            value: 1,
                        },
                    },
                },
            })
            .expect(201);

        // multi-create
        await client
            .post('/')
            .send({
                data: {
                    m7: {
                        create: [
                            {
                                value: 1,
                            },
                            {
                                value: 2,
                            },
                        ],
                    },
                },
            })
            .expect(201);
    });

    it('nested to-many update', async () => {
        // nested entities don't satisify policy before update, so should be excluded
        await makeClient('/api/data/M5')
            .post('/')
            .send({
                data: {
                    id: '1',
                    m7: {
                        create: [
                            {
                                id: '1',
                                value: 1,
                            },
                        ],
                    },
                },
            })
            .expect(201);

        // m7 fails 'update' rule
        await makeClient('/api/data/M5/1')
            .put('/')
            .send({
                include: { m7: true },
                data: {
                    m7: {
                        update: {
                            where: { id: '1' },
                            data: { value: 2 },
                        },
                    },
                },
            })
            .expect(403);

        // nested entities satisify policy before update, so should be included for update
        await makeClient('/api/data/M5')
            .post('/')
            .send({
                data: {
                    id: '2',
                    m7: {
                        create: {
                            id: '2',
                            value: 2,
                        },
                    },
                },
            })
            .expect(201);

        await makeClient('/api/data/M5/2')
            .put('/')
            .send({
                include: { m7: true },
                data: {
                    m7: {
                        update: {
                            where: { id: '2' },
                            data: { value: 3 },
                        },
                    },
                },
            })
            .expect(200)
            .expect((resp) => {
                expect(resp.body.m7).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({ id: '2', value: 3 }),
                    ])
                );
            });
    });

    it('nested to-many update with create', async () => {
        await makeClient('/api/data/M5')
            .post('/')
            .send({
                data: {
                    id: '1',
                    m7: {
                        create: {
                            value: 1,
                        },
                    },
                },
            })
            .expect(201);

        await makeClient('/api/data/M5/1')
            .put('/')
            .send({
                data: {
                    m7: {
                        create: {
                            id: '2',
                            value: 0,
                        },
                    },
                },
            })
            .expect(403);

        await makeClient('/api/data/M5/1')
            .put('/')
            .send({
                data: {
                    m7: {
                        create: [
                            {
                                value: 0,
                            },
                            {
                                value: 1,
                            },
                        ],
                    },
                },
            })
            .expect(403);

        await makeClient('/api/data/M5/1')
            .put('/')
            .send({
                include: { m7: true },
                data: {
                    m7: {
                        create: [
                            {
                                value: 1,
                            },
                            {
                                value: 2,
                            },
                        ],
                    },
                },
            })
            .expect(200)
            .expect((resp) => {
                expect(resp.body.m7).toHaveLength(3);
            });
    });

    it('nested to-many update with delete', async () => {
        await makeClient('/api/data/M5')
            .post('/')
            .send({
                data: {
                    id: '1',
                    m7: {
                        create: [
                            {
                                id: '1',
                                value: 1,
                            },
                            {
                                id: '2',
                                value: 2,
                            },
                            {
                                id: '3',
                                value: 3,
                            },
                            {
                                id: '4',
                                value: 4,
                            },
                            {
                                id: '5',
                                value: 5,
                            },
                        ],
                    },
                },
            })
            .expect(201);

        await makeClient('/api/data/M5/1')
            .put('/')
            .send({
                data: {
                    m7: {
                        delete: { id: '1' },
                    },
                },
            })
            .expect(403);

        await makeClient('/api/data/M5/1')
            .put('/')
            .send({
                data: {
                    m7: {
                        deleteMany: { OR: [{ id: '2' }, { id: '3' }] },
                    },
                },
            })
            .expect(403);

        await makeClient('/api/data/M5/1')
            .put('/')
            .send({
                data: {
                    m7: {
                        delete: { id: '3' },
                    },
                },
            })
            .expect(200);
        await makeClient('/api/data/M7/3').get('/').expect(404);

        await makeClient('/api/data/M5/1')
            .put('/')
            .send({
                data: {
                    m7: {
                        deleteMany: { value: { gte: 4 } },
                    },
                },
            })
            .expect(200);
        await makeClient('/api/data/M7/4').get('/').expect(404);
        await makeClient('/api/data/M7/5').get('/').expect(404);
    });

    //#endregion

    //#region Nested writes with nested read

    it('create with nested read', async () => {
        // TODO
    });

    it('update with nested read', async () => {
        await makeClient('/api/data/M8')
            .post('/')
            .send({
                data: {
                    id: '1',
                    m9: {
                        create: {
                            value: 0,
                        },
                    },
                    m10: {
                        create: [
                            {
                                id: '1',
                                value: 0,
                            },
                            {
                                id: '2',
                                value: 0,
                            },
                        ],
                    },
                },
            })
            .expect(201);

        // reject because m9 fails 'read' rule
        await makeClient('/api/data/M8/1')
            .put('/')
            .send({
                include: { m9: true },
                data: {
                    m9: {
                        update: {
                            value: 1,
                        },
                    },
                },
            })
            .expect(403);

        // m9 can be returned now, m10 should be filtered out because of 'read' rule
        await makeClient('/api/data/M8/1')
            .put('/')
            .send({
                include: { m9: true, m10: true },
                data: {
                    m9: {
                        update: {
                            value: 2,
                        },
                    },
                },
            })
            .expect(200)
            .expect((resp) => {
                expect(resp.body.m9.value).toBe(2);
                expect(resp.body.m10).toHaveLength(0);
            });

        // one of m10 entities pass 'read' rule now
        await makeClient('/api/data/M8/1')
            .put('/')
            .send({
                select: { m10: true },
                data: {
                    m10: {
                        update: {
                            where: { id: '1' },
                            data: { value: 2 },
                        },
                    },
                },
            })
            .expect(200)
            .expect((resp) => {
                expect(resp.body.m10).toHaveLength(1);
            });
    });

    //#endregion
});
