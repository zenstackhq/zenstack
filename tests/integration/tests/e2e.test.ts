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
        const user1Client = makeClient('/api/data/User/user1');
        const user2Client = makeClient('/api/data/User/user2');
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

        // find
        await userClient
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
        await userClient
            .get('/')
            .expect(200)
            .expect((resp) => {
                expect(resp.body).toHaveLength(1);
                expect(resp.body).toEqual([expect.objectContaining(user1)]);
            });

        // get user2 as user1
        await user2Client.get('/').expect(404);

        // add both users into the same space
        const spaceClient = makeClient('/api/data/Space');
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
        await userClient
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
});
