import path from 'path';
import { makeClient, run, setup } from './utils';
import { compareSync } from 'bcryptjs';

describe('Password attribute tests', () => {
    let origDir: string;

    beforeAll(async () => {
        origDir = path.resolve('.');
        await setup('./tests/password.zmodel');
    });

    beforeEach(() => {
        run('npx prisma migrate reset --schema ./zenstack/schema.prisma -f');
    });

    afterAll(() => {
        process.chdir(origDir);
    });

    it('password direct write test', async () => {
        await makeClient('/api/data/User')
            .post('/')
            .send({
                data: {
                    id: '1',
                    password: 'abc123',
                },
            })
            .expect(async (resp) =>
                expect(compareSync('abc123', resp.body.password)).toBeTruthy()
            );

        await makeClient('/api/data/User/1')
            .put('/')
            .send({
                data: {
                    password: 'abc456',
                },
            })
            .expect(async (resp) =>
                expect(compareSync('abc456', resp.body.password)).toBeTruthy()
            );
    });

    it('password indirect write test', async () => {
        await makeClient('/api/data/User')
            .post('/')
            .send({
                data: {
                    id: '1',
                    password: 'abc123',
                    profile: {
                        create: {
                            id: '1',
                        },
                    },
                },
            });

        await makeClient('/api/data/Profile/1')
            .put('/')
            .send({
                include: { user: true },
                data: {
                    user: {
                        update: {
                            password: 'abc456',
                        },
                    },
                },
            })
            .expect(async (resp) =>
                expect(
                    compareSync('abc456', resp.body.user.password)
                ).toBeTruthy()
            );
    });
});
