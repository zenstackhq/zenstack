import { CrudFailureReason, isPrismaClientKnownRequestError } from '@zenstackhq/runtime';
import { FullDbClientContract, createPostgresDb, dropPostgresDb, loadSchema, run } from '@zenstackhq/testtools';

describe('Field validation', () => {
    let db: FullDbClientContract;

    beforeAll(async () => {
        const { enhance, prisma: _prisma } = await loadSchema(
            `
            model User {
                id String @id @default(cuid())
                password String @password @length(8, 16)
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
            }

            model Task {
                id String @id @default(cuid())
                user User  @relation(fields: [userId], references: [id])
                userId String
                slug String @regex("^[0-9a-zA-Z]{4,16}$") @lower
            }
`,
            { enhancements: ['validation'] }
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

describe('Model-level validation', () => {
    it('create', async () => {
        const { enhance } = await loadSchema(
            `
        model Model {
            id Int @id @default(autoincrement())
            x Int
            y Int

            @@validate(x > 0)
            @@validate(x >= y)
        }
        `,
            { enhancements: ['validation'] }
        );

        const db = enhance();

        await expect(db.model.create({ data: { x: 0, y: 0 } })).toBeRejectedByPolicy();
        await expect(db.model.create({ data: { x: 1, y: 2 } })).toBeRejectedByPolicy();
        await expect(db.model.create({ data: { x: 2, y: 1 } })).toResolveTruthy();
    });

    it('update', async () => {
        const { enhance } = await loadSchema(
            `
        model Model {
            id Int @id @default(autoincrement())
            x Int
            y Int

            @@validate(x >= y)
        }
        `,
            { enhancements: ['validation'] }
        );

        const db = enhance();

        await expect(db.model.create({ data: { x: 2, y: 1 } })).toResolveTruthy();
        await expect(db.model.create({ data: { x: 1, y: 2 } })).toBeRejectedByPolicy();
    });

    it('int optionality', async () => {
        const { enhance } = await loadSchema(
            `
        model Model {
            id Int @id @default(autoincrement())
            x Int?

            @@validate(x > 0)
        }
        `,
            { enhancements: ['validation'] }
        );

        const db = enhance();

        await expect(db.model.create({ data: { x: 0 } })).toBeRejectedByPolicy();
        await expect(db.model.create({ data: { x: 1 } })).toResolveTruthy();
        await expect(db.model.create({ data: {} })).toResolveTruthy();
    });

    it('boolean optionality', async () => {
        const { enhance } = await loadSchema(
            `
        model Model {
            id Int @id @default(autoincrement())
            x Boolean?

            @@validate(x)
        }
        `,
            { enhancements: ['validation'] }
        );

        const db = enhance();

        await expect(db.model.create({ data: { x: false } })).toBeRejectedByPolicy();
        await expect(db.model.create({ data: { x: true } })).toResolveTruthy();
        await expect(db.model.create({ data: {} })).toResolveTruthy();
    });

    it('optionality with binary', async () => {
        const { enhance } = await loadSchema(
            `
        model Model {
            id Int @id @default(autoincrement())
            x Int?
            y Int?

            @@validate(x > y)
        }
        `,
            { enhancements: ['validation'] }
        );

        const db = enhance();

        await expect(db.model.create({ data: { x: 1, y: 2 } })).toBeRejectedByPolicy();
        await expect(db.model.create({ data: { x: 1 } })).toResolveTruthy();
        await expect(db.model.create({ data: { y: 1 } })).toResolveTruthy();
        await expect(db.model.create({ data: {} })).toResolveTruthy();
    });

    it('optionality with in operator lhs', async () => {
        const { enhance } = await loadSchema(
            `
        model Model {
            id Int @id @default(autoincrement())
            x String?

            @@validate(x in ['foo', 'bar'])
        }
        `,
            { enhancements: ['validation'] }
        );

        const db = enhance();

        await expect(db.model.create({ data: { x: 'hello' } })).toBeRejectedByPolicy();
        await expect(db.model.create({ data: { x: 'foo' } })).toResolveTruthy();
        await expect(db.model.create({ data: {} })).toResolveTruthy();
    });

    it('optionality with in operator rhs', async () => {
        let prisma;
        try {
            const dbUrl = await createPostgresDb('field-validation-in-operator');
            const r = await loadSchema(
                `
        model Model {
            id Int @id @default(autoincrement())
            x String[]

            @@validate('foo' in x)
        }
        `,
                {
                    provider: 'postgresql',
                    dbUrl,
                    enhancements: ['validation'],
                }
            );

            const db = r.enhance();
            prisma = r.prisma;

            await expect(db.model.create({ data: { x: ['hello'] } })).toBeRejectedByPolicy();
            await expect(db.model.create({ data: { x: ['foo', 'bar'] } })).toResolveTruthy();
            await expect(db.model.create({ data: {} })).toResolveTruthy();
        } finally {
            await prisma.$disconnect();
            await dropPostgresDb('field-validation-in-operator');
        }
    });

    it('optionality with complex expression', async () => {
        const { enhance } = await loadSchema(
            `
        model Model {
            id Int @id @default(autoincrement())
            x Int?
            y Int?

            @@validate(y > 1 && x > y)
        }
        `,
            { enhancements: ['validation'] }
        );

        const db = enhance();

        await expect(db.model.create({ data: { y: 1 } })).toBeRejectedByPolicy();
        await expect(db.model.create({ data: { y: 2 } })).toResolveTruthy();
        await expect(db.model.create({ data: {} })).toResolveTruthy();
        await expect(db.model.create({ data: { x: 1, y: 2 } })).toBeRejectedByPolicy();
        await expect(db.model.create({ data: { x: 3, y: 2 } })).toResolveTruthy();
    });

    it('optionality with negation', async () => {
        const { enhance } = await loadSchema(
            `
        model Model {
            id Int @id @default(autoincrement())
            x Boolean?

            @@validate(!x)
        }
        `,
            { enhancements: ['validation'] }
        );

        const db = enhance();

        await expect(db.model.create({ data: { x: true } })).toBeRejectedByPolicy();
        await expect(db.model.create({ data: { x: false } })).toResolveTruthy();
        await expect(db.model.create({ data: {} })).toResolveTruthy();
    });

    it('update implied optionality', async () => {
        const { enhance } = await loadSchema(
            `
        model Model {
            id Int @id @default(autoincrement())
            x Int
            y Int

            @@validate(x > y)
        }
        `,
            { enhancements: ['validation'] }
        );

        const db = enhance();

        await expect(db.model.create({ data: { id: 1, x: 2, y: 1 } })).toResolveTruthy();
        await expect(db.model.update({ where: { id: 1 }, data: { y: 1 } })).toResolveTruthy();
        await expect(db.model.update({ where: { id: 1 }, data: {} })).toResolveTruthy();
    });

    it('optionality with scalar functions', async () => {
        const { enhance } = await loadSchema(
            `
        model Model {
            id Int @id @default(autoincrement())
            s String
            e String
            u String
            d String

            @@validate(
                length(s, 1, 5) && 
                contains(s, 'b') && 
                startsWith(s, 'a') && 
                endsWith(s, 'c') &&
                regex(s, '^[0-9a-zA-Z]*$'),
                'invalid s')
            @@validate(email(e), 'invalid e')
            @@validate(url(u), 'invalid u')
            @@validate(datetime(d), 'invalid d')
        }
        `,
            { enhancements: ['validation'] }
        );

        const db = enhance();

        await expect(
            db.model.create({
                data: {
                    id: 1,
                    s: 'a1b2c',
                    e: 'a@bcd.com',
                    u: 'https://www.zenstack.dev',
                    d: '2024-01-01T00:00:00.000Z',
                },
            })
        ).toResolveTruthy();

        await expect(db.model.update({ where: { id: 1 }, data: {} })).toResolveTruthy();

        await expect(db.model.update({ where: { id: 1 }, data: { s: 'a2b3c' } })).toResolveTruthy();
        await expect(db.model.update({ where: { id: 1 }, data: { s: 'c2b3c' } })).toBeRejectedByPolicy();
        await expect(db.model.update({ where: { id: 1 }, data: { s: 'a1b2c3' } })).toBeRejectedByPolicy();
        await expect(db.model.update({ where: { id: 1 }, data: { s: 'aaccc' } })).toBeRejectedByPolicy();
        await expect(db.model.update({ where: { id: 1 }, data: { s: 'a1b2d' } })).toBeRejectedByPolicy();
        await expect(db.model.update({ where: { id: 1 }, data: { s: 'a1-3c' } })).toBeRejectedByPolicy();

        await expect(db.model.update({ where: { id: 1 }, data: { e: 'b@def.com' } })).toResolveTruthy();
        await expect(db.model.update({ where: { id: 1 }, data: { e: 'xyz' } })).toBeRejectedByPolicy();

        await expect(db.model.update({ where: { id: 1 }, data: { u: 'https://zenstack.dev/docs' } })).toResolveTruthy();
        await expect(db.model.update({ where: { id: 1 }, data: { u: 'xyz' } })).toBeRejectedByPolicy();

        await expect(db.model.update({ where: { id: 1 }, data: { d: '2025-01-01T00:00:00.000Z' } })).toResolveTruthy();
        await expect(db.model.update({ where: { id: 1 }, data: { d: 'xyz' } })).toBeRejectedByPolicy();
    });

    it('optionality with array functions', async () => {
        let prisma;
        try {
            const dbUrl = await createPostgresDb('field-validation-array-funcs');
            const r = await loadSchema(
                `
        model Model {
            id Int @id @default(autoincrement())
            x String[]
            y Int[]

            @@validate(
                has(x, 'a') &&
                hasEvery(x, ['a', 'b']) &&
                hasSome(x, ['x', 'y']) &&
                (y == null || !isEmpty(y))
            )
        }
        `,
                {
                    provider: 'postgresql',
                    dbUrl,
                    enhancements: ['validation'],
                }
            );

            const db = r.enhance();
            prisma = r.prisma;

            await expect(db.model.create({ data: { id: 1, x: ['a', 'b', 'x'], y: [1] } })).toResolveTruthy();
            await expect(db.model.update({ where: { id: 1 }, data: {} })).toResolveTruthy();
            await expect(db.model.update({ where: { id: 1 }, data: { x: ['b', 'x'] } })).toBeRejectedByPolicy();
            await expect(db.model.update({ where: { id: 1 }, data: { x: ['a', 'b'] } })).toBeRejectedByPolicy();
            await expect(db.model.update({ where: { id: 1 }, data: { y: [] } })).toBeRejectedByPolicy();
        } finally {
            await prisma.$disconnect();
            await dropPostgresDb('field-validation-array-funcs');
        }
    });

    it('null comparison', async () => {
        const { enhance } = await loadSchema(
            `
        model Model {
            id Int @id @default(autoincrement())
            x Int
            y Int

            @@validate(x == null || !(x <= 0))
            @@validate(y != null && !(y > 1))
        }
        `,
            { enhancements: ['validation'] }
        );

        const db = enhance();

        await expect(db.model.create({ data: { id: 1, x: 1 } })).toBeRejectedByPolicy();
        await expect(db.model.create({ data: { id: 1, x: 1, y: 2 } })).toBeRejectedByPolicy();
        await expect(db.model.create({ data: { id: 1, x: 0, y: 0 } })).toBeRejectedByPolicy();
        await expect(db.model.create({ data: { id: 1, x: 1, y: 0 } })).toResolveTruthy();

        await expect(db.model.update({ where: { id: 1 }, data: {} })).toBeRejectedByPolicy();
        await expect(db.model.update({ where: { id: 1 }, data: { y: 2 } })).toBeRejectedByPolicy();
        await expect(db.model.update({ where: { id: 1 }, data: { y: 1 } })).toResolveTruthy();
        await expect(db.model.update({ where: { id: 1 }, data: { x: 2, y: 1 } })).toResolveTruthy();
    });
});

describe('Policy and validation interaction', () => {
    it('test', async () => {
        const { enhance } = await loadSchema(
            `
                model User {
                    id String @id @default(cuid())
                    email String? @email
                    age Int
        
                    @@allow('all', age > 0)
                }
                `
        );

        const db = enhance();

        await expect(
            db.user.create({
                data: {
                    email: 'hello',
                    age: 18,
                },
            })
        ).toBeRejectedByPolicy(['Invalid email at "email"']);

        await expect(
            db.user.create({
                data: {
                    email: 'user@abc.com',
                    age: 0,
                },
            })
        ).toBeRejectedByPolicy();

        await expect(
            db.user.create({
                data: {
                    email: 'user@abc.com',
                    age: 18,
                },
            })
        ).toResolveTruthy();
    });
});
