import * as fs from 'fs';
import { makeClient, run, setup } from './utils';

describe('E2E Tests', () => {
    let workDir: string;

    beforeAll(async () => {
        workDir = await setup();
    });

    afterAll(() => {
        if (workDir) {
            fs.rmSync(workDir, { recursive: true, force: true });
        }
    });

    beforeEach(() => {
        run('npx prisma migrate reset --schema ./zenstack/schema.prisma -f');
    });

    it('user', async () => {
        const userClient = makeClient('/api/data/User');
        const user1 = {
            id: 'user1',
            email: 'user1@zenstack.dev',
            name: 'User 1',
        };
        const user2 = {
            id: 'user2',
            email: 'user2@zenstack.dev',
            name: 'User 2',
        };
        const user1Client = makeClient('/api/data/User/user1', user1.id);
        const user2Client = makeClient('/api/data/User/user2', user1.id);

        // create user1
        await userClient
            .post('/')
            .send({
                data: user1,
            })
            .expect(201)
            .expect((resp) => {
                expect(resp.body).toEqual(expect.objectContaining(user1));
            });

        const credClient = makeClient('/api/data/User', user1.id);

        // find
        await credClient
            .get('/')
            .expect(200)
            .expect((resp) => {
                expect(resp.body).toEqual([expect.objectContaining(user1)]);
            });

        // get
        await user1Client
            .get('/')
            .expect(200)
            .expect((resp) =>
                expect(resp.body).toEqual(expect.objectContaining(user1))
            );
        await user2Client.get('/').expect(404);

        // create user2
        await userClient.post('/').send({
            data: user2,
        });

        // find with user1 should only get user1
        await credClient
            .get('/')
            .expect(200)
            .expect((resp) => {
                expect(resp.body).toHaveLength(1);
                expect(resp.body).toEqual([expect.objectContaining(user1)]);
            });

        // get user2 as user1
        await user2Client.get('/').expect(404);

        // add both users into the same space
        const spaceClient = makeClient('/api/data/Space', user1.id);
        await spaceClient
            .post('/')
            .send({
                data: {
                    name: 'Space 1',
                    slug: 'space1',
                    members: {
                        create: [
                            {
                                user: { connect: { id: user1.id } },
                                role: 'USER',
                            },
                            {
                                user: { connect: { id: user2.id } },
                                role: 'USER',
                            },
                        ],
                    },
                },
            })
            .expect(201);

        // now both user1 and user2 should be visible
        await credClient
            .get('/')
            .expect((resp) => expect(resp.body).toHaveLength(2));
        await user2Client
            .get('/')
            .expect(200)
            .expect((resp) =>
                expect(resp.body).toEqual(expect.objectContaining(user2))
            );

        // update user2 as user1
        await user2Client
            .put('/')
            .send({
                data: {
                    name: 'hello',
                },
            })
            .expect(403);

        // update user1 as user1
        await user1Client
            .put('/')
            .send({
                data: {
                    name: 'hello',
                },
            })
            .expect(200)
            .expect((resp) => expect(resp.body.name).toBe('hello'));

        // delete user2 as user1
        await user2Client.delete('/').expect(403);

        // delete user1 as user1
        await user1Client.delete('/').expect(200);
        await user1Client.get('/').expect(404);
    });

    it('todo list', async () => {
        await createSpaceAndUsers();

        const listClient = makeClient('/api/data/List');
        await listClient
            .post('/')
            .send({
                data: {
                    id: 'list1',
                    title: 'List 1',
                    owner: { connect: { id: user1.id } },
                    space: { connect: { id: space1.id } },
                },
            })
            .expect(403);

        const credClient = makeClient('/api/data/List', user1.id);
        await credClient
            .post('/')
            .send({
                data: {
                    id: 'list1',
                    title: 'List 1',
                    owner: { connect: { id: user1.id } },
                    space: { connect: { id: space1.id } },
                },
            })
            .expect(201);

        await credClient
            .get('/')
            .expect(200)
            .expect((resp) => expect(resp.body).toHaveLength(1));

        await listClient
            .get('/')
            .expect(200)
            .expect((resp) => expect(resp.body).toHaveLength(0));

        const list1Client = makeClient('/api/data/List/list1');
        await list1Client.get('/').expect(404);

        // accessible to owner
        const list1CredClientUser1 = makeClient(
            '/api/data/List/list1',
            user1.id
        );
        await list1CredClientUser1
            .get('/')
            .expect(200)
            .expect((resp) =>
                expect(resp.body).toEqual(
                    expect.objectContaining({ id: 'list1', title: 'List 1' })
                )
            );

        // accessible to user in the space
        const list1CredClientUser2 = makeClient(
            '/api/data/List/list1',
            user2.id
        );
        await list1CredClientUser2.get('/').expect(200);

        // inaccessible to user not in the space
        const list1CredClientUser3 = makeClient(
            '/api/data/List/list1',
            user3.id
        );
        await list1CredClientUser3.get('/').expect(404);

        // make a private list
        await credClient
            .post('/')
            .send({
                data: {
                    id: 'list2',
                    title: 'List 2',
                    private: true,
                    owner: { connect: { id: user1.id } },
                    space: { connect: { id: space1.id } },
                },
            })
            .expect(201);

        // accessible to owner
        const list2CredClientUser1 = makeClient(
            '/api/data/List/list2',
            user1.id
        );
        await list2CredClientUser1.get('/').expect(200);

        // inaccessible to other user in the space
        const list2CredClientUser2 = makeClient(
            '/api/data/List/list2',
            user2.id
        );
        await list2CredClientUser2.get('/').expect(404);

        // create a list which doesn't match credential should fail
        await credClient
            .post('/')
            .send({
                data: {
                    id: 'list3',
                    title: 'List 3',
                    owner: { connect: { id: user2.id } },
                    space: { connect: { id: space1.id } },
                },
            })
            .expect(403);

        // create a list which doesn't match credential's space should fail
        await credClient
            .post('/')
            .send({
                data: {
                    id: 'list3',
                    title: 'List 3',
                    owner: { connect: { id: user1.id } },
                    space: { connect: { id: space2.id } },
                },
            })
            .expect(403);

        // update list
        await list1CredClientUser1
            .put('/')
            .send({
                data: {
                    title: 'List 1 updated',
                },
            })
            .expect(200)
            .expect((resp) => expect(resp.body.title).toBe('List 1 updated'));

        await list1CredClientUser2
            .put('/')
            .send({
                data: {
                    title: 'List 1 updated',
                },
            })
            .expect(403);

        // delete list
        await list1CredClientUser2.delete('/').expect(403);
        await list1CredClientUser1.delete('/').expect(200);
        await list1CredClientUser1.get('/').expect(404);
    });

    it('todo', async () => {
        await createSpaceAndUsers();

        const listClient = makeClient('/api/data/List', user1.id);
        await listClient
            .post('/')
            .send({
                data: {
                    id: 'list1',
                    title: 'List 1',
                    owner: { connect: { id: user1.id } },
                    space: { connect: { id: space1.id } },
                },
            })
            .expect(201);

        const todoClientUser1 = makeClient('/api/data/Todo', user1.id);
        const todoClientUser2 = makeClient('/api/data/Todo', user2.id);

        // create
        await todoClientUser1
            .post('/')
            .send({
                data: {
                    id: 'todo1',
                    title: 'Todo 1',
                    owner: { connect: { id: user1.id } },
                    list: {
                        connect: { id: 'list1' },
                    },
                },
            })
            .expect(201);
        await todoClientUser2
            .post('/')
            .send({
                data: {
                    id: 'todo2',
                    title: 'Todo 2',
                    owner: { connect: { id: user2.id } },
                    list: {
                        connect: { id: 'list1' },
                    },
                },
            })
            .expect(201);

        // read
        await todoClientUser1
            .get('/')
            .expect(200)
            .expect((resp) => expect(resp.body).toHaveLength(2));
        await todoClientUser2
            .get('/')
            .expect(200)
            .expect((resp) => expect(resp.body).toHaveLength(2));

        const todo1ClientUser1 = makeClient('/api/data/Todo/todo1', user1.id);
        const todo2ClientUser1 = makeClient('/api/data/Todo/todo2', user1.id);

        // update, user in the same space can freely update
        await todo1ClientUser1
            .put('/')
            .send({
                data: {
                    title: 'Todo 1 updated',
                },
            })
            .expect(200);
        await todo2ClientUser1
            .put('/')
            .send({
                data: {
                    title: 'Todo 2 updated',
                },
            })
            .expect(200);

        // create a private list
        await listClient
            .post('/')
            .send({
                data: {
                    id: 'list2',
                    private: true,
                    title: 'List 2',
                    owner: { connect: { id: user1.id } },
                    space: { connect: { id: space1.id } },
                },
            })
            .expect(201);

        // create
        await todoClientUser1
            .post('/')
            .send({
                data: {
                    id: 'todo3',
                    title: 'Todo 3',
                    owner: { connect: { id: user1.id } },
                    list: {
                        connect: { id: 'list2' },
                    },
                },
            })
            .expect(201);
        await todoClientUser2
            .post('/')
            .send({
                data: {
                    id: 'todo4',
                    title: 'Todo 4',
                    owner: { connect: { id: user2.id } },
                    list: {
                        connect: { id: 'list2' },
                    },
                },
            })
            .expect(403);

        // update, only owner can update todo in a private list
        const todo3ClientUser1 = makeClient('/api/data/Todo/todo3', user1.id);
        const todo3ClientUser2 = makeClient('/api/data/Todo/todo3', user2.id);
        await todo3ClientUser1
            .put('/')
            .send({
                data: {
                    title: 'Todo 3 updated',
                },
            })
            .expect(200);
        await todo3ClientUser2
            .put('/')
            .send({
                data: {
                    title: 'Todo 3 updated',
                },
            })
            .expect(403);
    });
});

const user1 = {
    id: 'user1',
    email: 'user1@zenstack.dev',
    name: 'User 1',
};

const user2 = {
    id: 'user2',
    email: 'user2@zenstack.dev',
    name: 'User 2',
};

const user3 = {
    id: 'user3',
    email: 'user3@zenstack.dev',
    name: 'User 3',
};

const space1 = {
    id: 'space1',
    name: 'Space 1',
    slug: 'space1',
};

const space2 = {
    id: 'space2',
    name: 'Space 2',
    slug: 'space2',
};

async function createSpaceAndUsers() {
    const userClient = makeClient('/api/data/User');
    // create users
    await userClient
        .post('/')
        .send({
            data: user1,
        })
        .expect(201);
    await userClient
        .post('/')
        .send({
            data: user2,
        })
        .expect(201);
    await userClient
        .post('/')
        .send({
            data: user3,
        })
        .expect(201);

    // add user1 and user2 into space1
    const spaceClientUser1 = makeClient('/api/data/Space', user1.id);
    await spaceClientUser1
        .post('/')
        .send({
            data: {
                ...space1,
                members: {
                    create: [
                        {
                            user: { connect: { id: user1.id } },
                            role: 'ADMIN',
                        },
                        {
                            user: { connect: { id: user2.id } },
                            role: 'USER',
                        },
                    ],
                },
            },
        })
        .expect(201);

    // add user3 to space2
    const spaceClientUser3 = makeClient('/api/data/Space', user3.id);
    await spaceClientUser3
        .post('/')
        .send({
            data: {
                ...space2,
                members: {
                    create: [
                        {
                            user: { connect: { id: user3.id } },
                            role: 'ADMIN',
                        },
                    ],
                },
            },
        })
        .expect(201);
}
