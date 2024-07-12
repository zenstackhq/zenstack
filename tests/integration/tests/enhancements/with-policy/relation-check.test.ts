import { loadModelWithError, loadSchema } from '@zenstackhq/testtools';

describe('Relation checker', () => {
    it('should work for read', async () => {
        const { prisma, enhance } = await loadSchema(
            `
            model User {
                id Int @id @default(autoincrement())
                profile Profile?
                public Boolean
                @@allow('read', public)
            }

            model Profile {
                id Int @id @default(autoincrement())
                user User @relation(fields: [userId], references: [id])
                userId Int @unique
                age Int
                @@allow('read', check(user, 'read'))
            }
            `
        );

        await prisma.user.create({
            data: {
                id: 1,
                public: true,
                profile: {
                    create: { age: 18 },
                },
            },
        });

        await prisma.user.create({
            data: {
                id: 2,
                public: false,
                profile: {
                    create: { age: 20 },
                },
            },
        });

        const db = enhance();
        await expect(db.profile.findMany()).resolves.toHaveLength(1);
    });

    it('should work for simple create', async () => {
        const { prisma, enhance } = await loadSchema(
            `
            model User {
                id Int @id @default(autoincrement())
                profile Profile?
                public Boolean
                @@allow('create', true)
                @@allow('read', public)
            }

            model Profile {
                id Int @id @default(autoincrement())
                user User @relation(fields: [userId], references: [id])
                userId Int @unique
                age Int
                @@allow('read', true)
                @@allow('create', check(user, 'read'))
            }
            `
        );

        await prisma.user.create({
            data: {
                id: 1,
                public: true,
            },
        });

        await prisma.user.create({
            data: {
                id: 2,
                public: false,
            },
        });

        const db = enhance();
        await expect(db.profile.create({ data: { user: { connect: { id: 1 } }, age: 18 } })).toResolveTruthy();
        await expect(db.profile.create({ data: { user: { connect: { id: 2 } }, age: 18 } })).toBeRejectedByPolicy();
    });

    it('should work for nested create', async () => {
        const { enhance } = await loadSchema(
            `
            model User {
                id Int @id @default(autoincrement())
                profile Profile?
                public Boolean
                @@allow('create', true)
                @@allow('read', public)
            }

            model Profile {
                id Int @id @default(autoincrement())
                user User @relation(fields: [userId], references: [id])
                userId Int @unique
                age Int
                @@allow('read', true)
                @@allow('create', age < 30 && check(user, 'read'))
            }
            `
        );

        const db = enhance();

        await expect(
            db.user.create({
                data: {
                    id: 1,
                    public: true,
                    profile: {
                        create: { age: 18 },
                    },
                },
            })
        ).toResolveTruthy();

        await expect(
            db.user.create({
                data: {
                    id: 2,
                    public: false,
                    profile: {
                        create: { age: 18 },
                    },
                },
            })
        ).toBeRejectedByPolicy();

        await expect(
            db.user.create({
                data: {
                    id: 3,
                    public: true,
                    profile: {
                        create: { age: 30 },
                    },
                },
            })
        ).toBeRejectedByPolicy();
    });

    it('should work for update', async () => {
        const { prisma, enhance } = await loadSchema(
            `
            model User {
                id Int @id @default(autoincrement())
                profile Profile?
                public Boolean
                @@allow('create', true)
                @@allow('read', public)
            }

            model Profile {
                id Int @id @default(autoincrement())
                user User @relation(fields: [userId], references: [id])
                userId Int @unique
                age Int
                @@allow('read', true)
                @@allow('update', check(user, 'read') && age < 30)
            }
            `
        );

        await prisma.user.create({
            data: {
                id: 1,
                public: true,
                profile: {
                    create: { id: 1, age: 18 },
                },
            },
        });

        await prisma.user.create({
            data: {
                id: 2,
                public: false,
                profile: {
                    create: { id: 2, age: 20 },
                },
            },
        });

        await prisma.user.create({
            data: {
                id: 3,
                public: true,
                profile: {
                    create: { id: 3, age: 30 },
                },
            },
        });

        const db = enhance();
        await expect(db.profile.update({ where: { id: 1 }, data: { age: 21 } })).toResolveTruthy();
        await expect(db.profile.update({ where: { id: 2 }, data: { age: 21 } })).toBeRejectedByPolicy();
        await expect(db.profile.update({ where: { id: 3 }, data: { age: 21 } })).toBeRejectedByPolicy();
    });

    it('should work for delete', async () => {
        const { prisma, enhance } = await loadSchema(
            `
            model User {
                id Int @id @default(autoincrement())
                profile Profile?
                public Boolean
                @@allow('create', true)
                @@allow('read', public)
            }

            model Profile {
                id Int @id @default(autoincrement())
                user User @relation(fields: [userId], references: [id])
                userId Int @unique
                age Int
                @@allow('read', true)
                @@allow('delete', check(user, 'read') && age < 30)
            }
            `
        );

        await prisma.user.create({
            data: {
                id: 1,
                public: true,
                profile: {
                    create: { id: 1, age: 18 },
                },
            },
        });

        await prisma.user.create({
            data: {
                id: 2,
                public: false,
                profile: {
                    create: { id: 2, age: 20 },
                },
            },
        });

        await prisma.user.create({
            data: {
                id: 3,
                public: true,
                profile: {
                    create: { id: 3, age: 30 },
                },
            },
        });

        const db = enhance();
        await expect(db.profile.delete({ where: { id: 1 } })).toResolveTruthy();
        await expect(db.profile.delete({ where: { id: 2 } })).toBeRejectedByPolicy();
        await expect(db.profile.delete({ where: { id: 3 } })).toBeRejectedByPolicy();
    });

    it('should work for field-level', async () => {
        const { prisma, enhance } = await loadSchema(
            `
            model User {
                id Int @id @default(autoincrement())
                profile Profile?
                public Boolean
                @@allow('read', public)
            }

            model Profile {
                id Int @id @default(autoincrement())
                user User @relation(fields: [userId], references: [id])
                userId Int @unique
                age Int @allow('read', age < 30 && check(user, 'read'))
                @@allow('all', true)
            }
            `
        );

        await prisma.user.create({
            data: {
                id: 1,
                public: true,
                profile: {
                    create: { age: 18 },
                },
            },
        });

        await prisma.user.create({
            data: {
                id: 2,
                public: false,
                profile: {
                    create: { age: 20 },
                },
            },
        });

        await prisma.user.create({
            data: {
                id: 3,
                public: true,
                profile: {
                    create: { age: 30 },
                },
            },
        });

        const db = enhance();

        const p1 = await db.profile.findUnique({ where: { id: 1 } });
        expect(p1.age).toBe(18);
        const p2 = await db.profile.findUnique({ where: { id: 2 } });
        expect(p2.age).toBeUndefined();
        const p3 = await db.profile.findUnique({ where: { id: 3 } });
        expect(p3.age).toBeUndefined();
    });

    it('should work for field-level with override', async () => {
        const { prisma, enhance } = await loadSchema(
            `
            model User {
                id Int @id @default(autoincrement())
                profile Profile?
                public Boolean
                @@allow('read', public)
            }

            model Profile {
                id Int @id @default(autoincrement())
                user User @relation(fields: [userId], references: [id])
                userId Int @unique
                age Int @allow('read', age < 30 && check(user, 'read'), true)
            }
            `
        );

        await prisma.user.create({
            data: {
                id: 1,
                public: true,
                profile: {
                    create: { age: 18 },
                },
            },
        });

        await prisma.user.create({
            data: {
                id: 2,
                public: false,
                profile: {
                    create: { age: 20 },
                },
            },
        });

        await prisma.user.create({
            data: {
                id: 3,
                public: true,
                profile: {
                    create: { age: 30 },
                },
            },
        });

        const db = enhance();

        const p1 = await db.profile.findUnique({ where: { id: 1 }, select: { age: true } });
        expect(p1.age).toBe(18);
        const p2 = await db.profile.findUnique({ where: { id: 2 }, select: { age: true } });
        expect(p2).toBeNull();
        const p3 = await db.profile.findUnique({ where: { id: 3 }, select: { age: true } });
        expect(p3).toBeNull();
    });

    it('should work for cross-model field comparison', async () => {
        const { prisma, enhance } = await loadSchema(
            `
            model User {
                id Int @id @default(autoincrement())
                profile Profile?
                age Int
                @@allow('read', true)
                @@allow('update', age == profile.age)
            }

            model Profile {
                id Int @id @default(autoincrement())
                user User @relation(fields: [userId], references: [id])
                userId Int @unique
                age Int
                @@allow('read', true)
                @@allow('update', check(user, 'update') && age < 30)
            }
            `
        );

        await prisma.user.create({
            data: {
                id: 1,
                age: 18,
                profile: {
                    create: { id: 1, age: 18 },
                },
            },
        });

        await prisma.user.create({
            data: {
                id: 2,
                age: 18,
                profile: {
                    create: { id: 2, age: 20 },
                },
            },
        });

        await prisma.user.create({
            data: {
                id: 3,
                age: 30,
                profile: {
                    create: { id: 3, age: 30 },
                },
            },
        });

        const db = enhance();
        await expect(db.profile.update({ where: { id: 1 }, data: { age: 21 } })).toResolveTruthy();
        await expect(db.profile.update({ where: { id: 2 }, data: { age: 21 } })).toBeRejectedByPolicy();
        await expect(db.profile.update({ where: { id: 3 }, data: { age: 21 } })).toBeRejectedByPolicy();
    });

    it('should work for implicit specific operations', async () => {
        const { prisma, enhance } = await loadSchema(
            `
            model User {
                id Int @id @default(autoincrement())
                profile Profile?
                public Boolean
                @@allow('read', public)
                @@allow('create', true)
            }

            model Profile {
                id Int @id @default(autoincrement())
                user User @relation(fields: [userId], references: [id])
                userId Int @unique
                age Int
                @@allow('read', check(user))
                @@allow('create', check(user))
            }
            `
        );

        await prisma.user.create({
            data: {
                id: 1,
                public: true,
                profile: {
                    create: { age: 18 },
                },
            },
        });

        await prisma.user.create({
            data: {
                id: 2,
                public: false,
                profile: {
                    create: { age: 20 },
                },
            },
        });

        const db = enhance();
        await expect(db.profile.findMany()).resolves.toHaveLength(1);

        await prisma.user.create({
            data: {
                id: 3,
                public: true,
            },
        });
        await expect(db.profile.create({ data: { user: { connect: { id: 3 } }, age: 18 } })).toResolveTruthy();

        await prisma.user.create({
            data: {
                id: 4,
                public: false,
            },
        });
        await expect(db.profile.create({ data: { user: { connect: { id: 4 } }, age: 18 } })).toBeRejectedByPolicy();
    });

    it('should work for implicit all operations', async () => {
        const { prisma, enhance } = await loadSchema(
            `
            model User {
                id Int @id @default(autoincrement())
                profile Profile?
                public Boolean
                @@allow('all', public)
            }

            model Profile {
                id Int @id @default(autoincrement())
                user User @relation(fields: [userId], references: [id])
                userId Int @unique
                age Int
                @@allow('all', check(user))
            }
            `
        );

        await prisma.user.create({
            data: {
                id: 1,
                public: true,
                profile: {
                    create: { age: 18 },
                },
            },
        });

        await prisma.user.create({
            data: {
                id: 2,
                public: false,
                profile: {
                    create: { age: 20 },
                },
            },
        });

        const db = enhance();
        await expect(db.profile.findMany()).resolves.toHaveLength(1);

        await prisma.user.create({
            data: {
                id: 3,
                public: true,
            },
        });
        await expect(db.profile.create({ data: { user: { connect: { id: 3 } }, age: 18 } })).toResolveTruthy();

        await prisma.user.create({
            data: {
                id: 4,
                public: false,
            },
        });
        await expect(db.profile.create({ data: { user: { connect: { id: 4 } }, age: 18 } })).toBeRejectedByPolicy();
    });

    it('should report error for invalid args', async () => {
        await expect(
            loadModelWithError(
                `
            model User {
                id Int @id @default(autoincrement())
                public Boolean
                @@allow('read', check(public))
            }
            `
            )
        ).resolves.toContain('argument must be a relation field');

        await expect(
            loadModelWithError(
                `
            model User {
                id Int @id @default(autoincrement())
                posts Post[]
                @@allow('read', check(posts))
            }
            model Post {
                id Int @id @default(autoincrement())
                user User @relation(fields: [userId], references: [id])
                userId Int
            }
            `
            )
        ).resolves.toContain('argument cannot be an array field');

        await expect(
            loadModelWithError(
                `
            model User {
                id Int @id @default(autoincrement())
                profile Profile?
                @@allow('read', check(profile.details))
            }

            model Profile {
                id Int @id @default(autoincrement())
                user User @relation(fields: [userId], references: [id])
                userId Int
                details ProfileDetails?
            }

            model ProfileDetails {
                id Int @id @default(autoincrement())
                profile Profile @relation(fields: [profileId], references: [id])
                profileId Int
                age Int
            }
            `
            )
        ).resolves.toContain('argument must be a relation field');

        await expect(
            loadModelWithError(
                `
            model User {
                id Int @id @default(autoincrement())
                posts Post[]
                @@allow('read', check(posts, 'all'))
            }
            model Post {
                id Int @id @default(autoincrement())
                user User @relation(fields: [userId], references: [id])
                userId Int
            }
            `
            )
        ).resolves.toContain('argument must be a "read", "create", "update", or "delete"');
    });

    it('should report error for cyclic relation check', async () => {
        await expect(
            loadModelWithError(
                `
            model User {
                id Int @id @default(autoincrement())
                profile Profile?
                profileDetails ProfileDetails?
                public Boolean
                @@allow('all', check(profile))
            }

            model Profile {
                id Int @id @default(autoincrement())
                user User @relation(fields: [userId], references: [id])
                userId Int @unique
                details ProfileDetails?
                @@allow('all', check(details))
            }

            model ProfileDetails {
                id Int @id @default(autoincrement())
                profile Profile @relation(fields: [profileId], references: [id])
                profileId Int @unique
                user User @relation(fields: [userId], references: [id])
                userId Int @unique
                age Int
                @@allow('all', check(user))    
            }
            `
            )
        ).resolves.toContain('cyclic dependency detected when following the `check()` call');
    });

    it('should report error for cyclic relation check indirect', async () => {
        await expect(
            loadModelWithError(
                `
            model User {
                id Int @id @default(autoincrement())
                profile Profile?
                public Boolean
                @@allow('all', check(profile))
            }

            model Profile {
                id Int @id @default(autoincrement())
                user User @relation(fields: [userId], references: [id])
                userId Int @unique
                details ProfileDetails?
                @@allow('all', check(details))
            }

            model ProfileDetails {
                id Int @id @default(autoincrement())
                profile Profile @relation(fields: [profileId], references: [id])
                profileId Int @unique
                age Int
                @@allow('all', check(profile))    
            }
            `
            )
        ).resolves.toContain('cyclic dependency detected when following the `check()` call');
    });
});
