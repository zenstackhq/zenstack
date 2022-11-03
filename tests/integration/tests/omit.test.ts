import path from 'path';
import { makeClient, run, setup } from './utils';

describe('Omit attribute tests', () => {
    let origDir: string;

    beforeAll(async () => {
        origDir = path.resolve('.');
        await setup('./tests/omit.zmodel');
    });

    beforeEach(() => {
        run('npx prisma migrate reset --schema ./zenstack/schema.prisma -f');
    });

    afterAll(() => {
        process.chdir(origDir);
    });

    it('omit test', async () => {
        await makeClient('/api/data/User')
            .post('/')
            .send({
                include: { profile: true },
                data: {
                    id: '1',
                    password: 'abc123',
                    profile: {
                        create: {
                            image: 'an image',
                        },
                    },
                },
            })
            .expect(201)
            .expect((resp) => {
                expect(resp.body.password).toBeUndefined();
                expect(resp.body.profile.image).toBeUndefined();
            });

        await makeClient('/api/data/User/1', undefined, {
            include: { profile: true },
        })
            .get('/')
            .expect((resp) => {
                expect(resp.body.password).toBeUndefined();
                expect(resp.body.profile.image).toBeUndefined();
            });
    });
});
