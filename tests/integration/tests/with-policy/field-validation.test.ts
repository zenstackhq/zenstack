import { loadSchema, run, WeakDbClientContract } from '@zenstackhq/testtools';

describe('With Policy: field validation', () => {
    let db: WeakDbClientContract;
    let prisma: WeakDbClientContract;

    beforeAll(async () => {
        const { withPolicy, prisma: _prisma } = await loadSchema(
            `
            model User {
                id String @id @default(cuid())
                password String @length(8, 16)
                email String? @email @endsWith("@myorg.com")
                profileImage String? @url
                handle String? @regex("^[0-9a-zA-Z]{4,16}$")

                userData UserData?
                tasks Task[]

                @@allow('all', true)
            }

            model UserData {
                id String @id @default(cuid())
                user User  @relation(fields: [userId], references: [id])
                userId String @unique

                a Int @gt(0)
                b Int @gte(0)
                c Int @lt(0)
                d Int @lte(0)
                text1 String @startsWith('abc')
                text2 String @endsWith('def')
                text3 String @length(min: 3)
                text4 String @length(max: 5)
                text5 String? @endsWith('xyz')

                @@allow('all', true)
            }

            model Task {
                id String @id @default(cuid())
                user User  @relation(fields: [userId], references: [id])
                userId String
                slug String @regex("^[0-9a-zA-Z]{4,16}$")

                @@allow('all', true)
            }
`
        );
        db = withPolicy();
        prisma = _prisma;
    });

    beforeEach(() => {
        run('npx prisma migrate reset --force');
        run('npx prisma db push');
    });

    it('direct write simple', async () => {
        await expect(
            db.user.create({
                data: {
                    id: '1',
                    password: 'abc123',
                    handle: 'hello world',
                },
            })
        ).toBeRejectedByPolicy(['String must contain at least 8 character(s) at "password"', 'Invalid at "handle"']);

        await expect(
            db.user.create({
                data: {
                    id: '1',
                    password: 'abc123!@#',
                    email: 'something',
                    handle: 'user1user1user1user1user1',
                },
            })
        ).toBeRejectedByPolicy([
            'Invalid email at "email"',
            'must end with "@myorg.com" at "email"',
            'Invalid at "handle"',
        ]);

        await expect(
            db.user.create({
                data: {
                    id: '1',
                    password: 'abc123!@#',
                    email: 'who@myorg.com',
                    handle: 'user1',
                },
            })
        ).toResolveTruthy();

        await expect(
            db.user.update({
                where: { id: '1' },
                data: {
                    password: 'abc123',
                    email: 'something',
                },
            })
        ).toBeRejectedByPolicy([
            'String must contain at least 8 character(s) at "password"',
            'must end with "@myorg.com" at "email"',
        ]);
    });

    it('direct write more', async () => {
        await db.user.create({
            data: {
                id: '1',
                password: 'abc123!@#',
                email: 'who@myorg.com',
                handle: 'user1',
            },
        });

        await expect(
            db.userData.create({
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
        ).toBeRejectedByPolicy([
            'Number must be greater than 0 at "a"',
            'Number must be greater than or equal to 0 at "b"',
            'Number must be less than 0 at "c"',
            'Number must be less than or equal to 0 at "d"',
            'must start with "abc" at "text1"',
            'must end with "def" at "text2"',
            'String must contain at least 3 character(s) at "text3"',
            'String must contain at most 5 character(s) at "text4"',
            'must end with "xyz" at "text5"',
        ]);

        await expect(
            db.userData.create({
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
        ).toResolveTruthy();
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

        await expect(
            db.user.create({
                data: {
                    ...user,
                    userData: {
                        create: {
                            ...userData,
                            a: 0,
                        },
                    },
                },
            })
        ).toBeRejectedByPolicy(['Number must be greater than 0 at "a"']);

        await expect(
            db.user.create({
                data: {
                    ...user,
                    tasks: {
                        create: {
                            slug: 'abc',
                        },
                    },
                },
            })
        ).toBeRejectedByPolicy(['Invalid at "slug"']);

        await expect(
            db.user.create({
                data: {
                    ...user,
                    userData: {
                        connectOrCreate: {
                            where: {
                                id: '1',
                            },
                            create: {
                                ...userData,
                                a: 0,
                            },
                        },
                    },
                },
            })
        ).toBeRejectedByPolicy(['Number must be greater than 0 at "a"']);

        await expect(
            db.user.create({
                data: {
                    ...user,
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
        ).toBeRejectedByPolicy(['Invalid at "slug"']);

        await expect(
            db.user.create({
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
        ).toResolveTruthy();
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

        await expect(
            db.user.create({
                data: {
                    id: '1',
                    ...user,
                },
            })
        ).toResolveTruthy();

        await expect(
            db.user.update({
                where: { id: '1' },
                data: {
                    userData: {
                        create: {
                            ...userData,
                            a: 0,
                        },
                    },
                },
            })
        ).toBeRejectedByPolicy(['Number must be greater than 0 at "a"']);

        await expect(
            db.user.update({
                where: { id: '1' },
                data: {
                    tasks: {
                        create: {
                            slug: 'abc',
                        },
                    },
                },
            })
        ).toBeRejectedByPolicy(['Invalid at "slug"']);

        await expect(
            db.user.update({
                where: { id: '1' },
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
        ).toResolveTruthy();

        await expect(
            db.user.update({
                where: { id: '1' },
                data: {
                    userData: {
                        update: {
                            a: 0,
                        },
                    },
                },
            })
        ).toBeRejectedByPolicy(['Number must be greater than 0 at "a"']);

        await expect(
            db.user.update({
                where: { id: '1' },
                data: {
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
        ).toBeRejectedByPolicy(['Invalid at "slug"']);

        await expect(
            db.user.update({
                where: { id: '1' },
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
        ).toResolveTruthy();

        await expect(
            db.user.update({
                where: { id: '1' },
                data: {
                    userData: {
                        upsert: {
                            create: {
                                ...userData,
                                a: 0,
                            },
                            update: {
                                a: 0,
                            },
                        },
                    },
                },
            })
        ).toBeRejectedByPolicy(['Number must be greater than 0 at "a"']);

        await expect(
            db.user.update({
                where: { id: '1' },
                data: {
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
        ).toBeRejectedByPolicy(['Invalid at "slug"']);

        await expect(
            db.user.update({
                where: { id: '1' },
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
        ).toResolveTruthy();
    });
});
