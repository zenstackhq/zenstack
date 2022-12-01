import path from 'path';
import { run, setup } from './utils';
import { default as fetch, enableFetchMocks } from 'jest-fetch-mock';

describe('Field validation client-side tests', () => {
    let origDir: string;

    const hooksModule = '@zenstackhq/runtime/client';
    const requestModule = '@zenstackhq/runtime/lib/request';

    beforeAll(async () => {
        origDir = path.resolve('.');
        await setup('./tests/field-validation.zmodel');

        // mock mutate method
        jest.mock(requestModule, () => ({
            ...jest.requireActual(requestModule),
            getMutate: jest.fn(() => jest.fn()),
        }));

        // mock fetch
        enableFetchMocks();
        fetch.mockResponse(JSON.stringify({ status: 'ok' }));
    });

    beforeEach(async () => {
        run('npx prisma migrate reset --schema ./zenstack/schema.prisma -f');
    });

    afterAll(() => {
        process.chdir(origDir);
        jest.resetAllMocks();
    });

    async function expectErrors(
        call: () => Promise<void>,
        expectedErrors: string[]
    ) {
        try {
            await call();
        } catch (err: any) {
            if (!err.message) {
                throw err;
            }
            const errors: string[] = err.message.split(';');
            expect(errors).toEqual(
                expect.arrayContaining(
                    expectedErrors.map((e) => expect.stringContaining(e))
                )
            );
            return;
        }

        throw new Error('Error is expected');
    }

    it('direct write test', async () => {
        const { useUser } = await import(hooksModule);
        const { create: createUser, update: updateUser } = useUser();

        expectErrors(
            () =>
                createUser({
                    data: {
                        id: '1',
                        password: 'abc123',
                        handle: 'hello world',
                    },
                }),
            ['password', 'email', 'handle']
        );

        await createUser({
            data: {
                password: 'abc123!@#',
                email: 'who@myorg.com',
                handle: 'user1',
            },
        });

        expectErrors(
            () =>
                updateUser('1', {
                    data: {
                        password: 'abc123',
                        email: 'me@test.org',
                        handle: 'hello world',
                    },
                }),
            ['password', 'email', 'handle']
        );

        await updateUser('1', {
            data: {
                password: 'abc123!@#',
                email: 'who@myorg.com',
                handle: 'user1',
            },
        });
    });

    it('nested write test', async () => {
        const { useUser } = await import(hooksModule);
        const { create: createUser, update: updateUser } = useUser();

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

        expectErrors(
            () =>
                createUser({
                    data: {
                        password: 'abc123!@#',
                        email: 'who@myorg.com',
                        handle: 'user1',

                        userData: {
                            create: {
                                a: 0,
                            },
                        },

                        tasks: {
                            create: {
                                slug: 'xyz',
                            },
                        },
                    },
                }),
            ['userData.create', 'tasks.create.slug']
        );

        await createUser({
            data: {
                password: 'abc123!@#',
                email: 'who@myorg.com',
                handle: 'user1',

                userData: {
                    create: userData,
                },

                tasks: {
                    create: tasks,
                },
            },
        });

        expectErrors(
            () =>
                updateUser('1', {
                    data: {
                        userData: {
                            update: {
                                a: 0,
                            },
                        },

                        tasks: {
                            update: {
                                where: { id: 1 },
                                data: {
                                    slug: 'xyz',
                                },
                            },
                        },
                    },
                }),
            ['userData.update', 'tasks.update.data.slug']
        );

        await updateUser('1', {
            data: {
                userData: {
                    update: {
                        a: 1,
                    },
                },

                tasks: {
                    update: {
                        where: { id: 1 },
                        data: {
                            slug: 'abcxyz',
                        },
                    },
                },
            },
        });
    });
});
