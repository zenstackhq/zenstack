import { CrudFailureReason, isPrismaClientKnownRequestError } from '@zenstackhq/runtime';
import { FullDbClientContract, loadSchema, run } from '@zenstackhq/testtools';

describe('With Policy: field validation', () => {
    let db: FullDbClientContract;

    beforeAll(async () => {
        const { enhance, prisma: _prisma } = await loadSchema(
            `
            model User {
                id String @id @default(cuid())
                password String @length(8, 16)
                email String? @email @endsWith("@myorg.com")
                profileImage String? @url
                handle String? @regex("^[0-9a-zA-Z]{4,16}$")
                age Int @default(18) @gt(0) @lt(100)

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
                text6 String? @trim @lower
                text7 String? @upper

                @@allow('all', true)
            }

            model Task {
                id String @id @default(cuid())
                user User  @relation(fields: [userId], references: [id])
                userId String
                slug String @regex("^[0-9a-zA-Z]{4,16}$") @lower

                @@allow('all', true)
            }
`
        );
        db = enhance();
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

        let err: any;
        try {
            await db.user.create({
                data: {
                    id: '1',
                    password: 'abc123',
                    handle: 'hello world',
                },
            });
        } catch (_err) {
            err = _err;
        }

        expect(isPrismaClientKnownRequestError(err)).toBeTruthy();
        expect(err).toMatchObject({
            code: 'P2004',
            meta: {
                reason: CrudFailureReason.DATA_VALIDATION_VIOLATION,
            },
        });
        expect(err.meta.zodErrors).toBeTruthy();

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

        await expect(
            db.user.update({
                where: { id: '1' },
                data: {
                    age: { increment: 100 },
                },
            })
        ).toBeRejectedByPolicy(['Number must be less than 100 at "age"']);

        await expect(
            db.user.update({
                where: { id: '1' },
                data: {
                    age: { increment: 10 },
                },
            })
        ).toResolveTruthy();
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

    it('string transformation', async () => {
        await db.user.create({
            data: {
                id: '1',
                password: 'abc123!@#',
                email: 'who@myorg.com',
                handle: 'user1',
            },
        });

        let ud = await db.userData.create({
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
                text6: ' AbC ',
                text7: 'abc',
            },
        });
        expect(ud).toMatchObject({ text6: 'abc', text7: 'ABC' });

        ud = await db.userData.update({
            where: { id: ud.id },
            data: {
                text4: 'xyz',
                text6: ' bCD ',
                text7: 'bcd',
            },
        });
        expect(ud).toMatchObject({ text4: 'xyz', text6: 'bcd', text7: 'BCD' });

        let u = await db.user.create({
            data: {
                id: '2',
                password: 'abc123!@#',
                email: 'who@myorg.com',
                handle: 'user2',
                userData: {
                    create: {
                        a: 1,
                        b: 0,
                        c: -1,
                        d: 0,
                        text1: 'abc123',
                        text2: 'def',
                        text3: 'aaa',
                        text4: 'abcab',
                        text6: ' AbC ',
                        text7: 'abc',
                    },
                },
            },
            include: { userData: true },
        });
        expect(u.userData).toMatchObject({
            text6: 'abc',
            text7: 'ABC',
        });

        u = await db.user.update({
            where: { id: u.id },
            data: {
                userData: {
                    update: {
                        data: { text4: 'xyz', text6: ' bCD ', text7: 'bcd' },
                    },
                },
            },
            include: { userData: true },
        });
        expect(u.userData).toMatchObject({ text4: 'xyz', text6: 'bcd', text7: 'BCD' });

        // upsert create
        u = await db.user.update({
            where: { id: u.id },
            data: {
                tasks: {
                    upsert: {
                        where: { id: 'unknown' },
                        create: { slug: 'SLUG1' },
                        update: {},
                    },
                },
            },
            include: { tasks: true },
        });
        expect(u.tasks[0]).toMatchObject({ slug: 'slug1' });

        // upsert update
        u = await db.user.update({
            where: { id: u.id },
            data: {
                tasks: {
                    upsert: {
                        where: { id: u.tasks[0].id },
                        create: {},
                        update: { slug: 'SLUG2' },
                    },
                },
            },
            include: { tasks: true },
        });
        expect(u.tasks[0]).toMatchObject({ slug: 'slug2' });
    });
});
