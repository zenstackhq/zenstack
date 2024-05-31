import { loadSchema } from '@zenstackhq/testtools';

describe('Cross-model field comparison', () => {
    it('to-one relation', async () => {
        const { prisma, enhance } = await loadSchema(
            `
        model User {
            id Int @id
            profile Profile @relation(fields: [profileId], references: [id])
            profileId Int  @unique
            age Int
                  
            @@allow('read', true)
            @@allow('create,update,delete', age == profile.age)
            @@deny('update', future().age < future().profile.age && age > 0)
        }
        
        model Profile {
            id Int @id @default(autoincrement())
            age Int
            user User?
        
            @@allow('all', true)
        }
        `
        );

        const db = enhance();

        const reset = async () => {
            await prisma.user.deleteMany();
            await prisma.profile.deleteMany();
        };

        // create
        await expect(
            db.user.create({ data: { id: 1, age: 18, profile: { create: { id: 1, age: 20 } } } })
        ).toBeRejectedByPolicy();
        await expect(prisma.user.findUnique({ where: { id: 1 } })).toResolveNull();
        await expect(
            db.user.create({ data: { id: 1, age: 18, profile: { create: { id: 1, age: 18 } } } })
        ).toResolveTruthy();
        await expect(prisma.user.findUnique({ where: { id: 1 } })).toResolveTruthy();
        await reset();

        // createMany
        await expect(
            db.user.createMany({ data: [{ id: 1, age: 18, profile: { create: { id: 1, age: 20 } } }] })
        ).toBeRejectedByPolicy();
        await expect(prisma.user.findUnique({ where: { id: 1 } })).toResolveNull();
        await expect(
            db.user.createMany({ data: { id: 1, age: 18, profile: { create: { id: 1, age: 18 } } } })
        ).toResolveTruthy();
        await expect(prisma.user.findUnique({ where: { id: 1 } })).toResolveTruthy();
        await reset();

        // TODO: cross-model field comparison is not supported for read rules yet
        // // read
        // await prisma.user.create({ data: { id: 1, age: 18, profile: { create: { id: 1, age: 18 } } } });
        // await expect(db.user.findUnique({ where: { id: 1 } })).toResolveTruthy();
        // await expect(db.user.findMany()).resolves.toHaveLength(1);
        // await prisma.user.update({ where: { id: 1 }, data: { age: 20 } });
        // await expect(db.user.findUnique({ where: { id: 1 } })).toResolveNull();
        // await expect(db.user.findMany()).resolves.toHaveLength(0);
        // await reset();

        // update
        await prisma.user.create({ data: { id: 1, age: 18, profile: { create: { id: 1, age: 18 } } } });
        await expect(db.user.update({ where: { id: 1 }, data: { age: 20 } })).toResolveTruthy();
        await expect(prisma.user.findUnique({ where: { id: 1 } })).resolves.toMatchObject({ age: 20 });
        await expect(db.user.update({ where: { id: 1 }, data: { age: 18 } })).toBeRejectedByPolicy();
        await reset();

        // post update
        await prisma.user.create({ data: { id: 1, age: 18, profile: { create: { id: 1, age: 18 } } } });
        await expect(db.user.update({ where: { id: 1 }, data: { age: 15 } })).toBeRejectedByPolicy();
        await expect(db.user.update({ where: { id: 1 }, data: { age: 20 } })).toResolveTruthy();
        await reset();

        // upsert
        await prisma.user.create({ data: { id: 1, age: 18, profile: { create: { id: 1, age: 20 } } } });
        await expect(
            db.user.upsert({ where: { id: 1 }, create: { id: 1, age: 25 }, update: { age: 25 } })
        ).toBeRejectedByPolicy();
        await expect(
            db.user.upsert({
                where: { id: 2 },
                create: { id: 2, age: 18, profile: { create: { age: 25 } } },
                update: { age: 25 },
            })
        ).toBeRejectedByPolicy();
        await prisma.user.update({ where: { id: 1 }, data: { age: 20 } });
        await expect(
            db.user.upsert({ where: { id: 1 }, create: { id: 1, age: 25 }, update: { age: 25 } })
        ).toResolveTruthy();
        await expect(prisma.user.findUnique({ where: { id: 1 } })).resolves.toMatchObject({ age: 25 });
        await expect(
            db.user.upsert({
                where: { id: 2 },
                create: { id: 2, age: 25, profile: { create: { age: 25 } } },
                update: { age: 25 },
            })
        ).toResolveTruthy();
        await expect(prisma.user.findMany()).resolves.toHaveLength(2);
        await reset();

        // updateMany
        await prisma.user.create({ data: { id: 1, age: 18, profile: { create: { id: 1, age: 20 } } } });
        // non updatable
        await expect(db.user.updateMany({ data: { age: 18 } })).resolves.toMatchObject({ count: 0 });
        await prisma.user.create({ data: { id: 2, age: 25, profile: { create: { id: 2, age: 25 } } } });
        // one of the two is updatable
        await expect(db.user.updateMany({ data: { age: 30 } })).resolves.toMatchObject({ count: 1 });
        await expect(prisma.user.findUnique({ where: { id: 1 } })).resolves.toMatchObject({ age: 18 });
        await expect(prisma.user.findUnique({ where: { id: 2 } })).resolves.toMatchObject({ age: 30 });
        await reset();

        // delete
        await prisma.user.create({ data: { id: 1, age: 18, profile: { create: { id: 1, age: 20 } } } });
        await expect(db.user.delete({ where: { id: 1 } })).toBeRejectedByPolicy();
        await expect(prisma.user.findMany()).resolves.toHaveLength(1);
        await prisma.user.update({ where: { id: 1 }, data: { age: 20 } });
        await expect(db.user.delete({ where: { id: 1 } })).toResolveTruthy();
        await expect(prisma.user.findMany()).resolves.toHaveLength(0);
        await reset();

        // deleteMany
        await prisma.user.create({ data: { id: 1, age: 18, profile: { create: { id: 1, age: 20 } } } });
        await expect(db.user.deleteMany()).resolves.toMatchObject({ count: 0 });
        await prisma.user.create({ data: { id: 2, age: 25, profile: { create: { id: 2, age: 25 } } } });
        // one of the two is deletable
        await expect(db.user.deleteMany()).resolves.toMatchObject({ count: 1 });
        await expect(prisma.user.findMany()).resolves.toHaveLength(1);
    });

    it('nested inside to-one relation', async () => {
        const { prisma, enhance } = await loadSchema(
            `
        model User {
            id Int @id
            profile Profile?
            age Int
                  
            @@allow('all', true)
        }
        
        model Profile {
            id Int @id
            age Int
            user User? @relation(fields: [userId], references: [id])
            userId Int? @unique
        
            @@allow('read', true)
            @@allow('create,update,delete', user == null || age == user.age)
            @@deny('update', future().user != null && future().age < future().user.age && age > 0)
        }
        `
        );

        const db = enhance();

        const reset = async () => {
            await prisma.profile.deleteMany();
            await prisma.user.deleteMany();
        };

        // create
        await expect(
            db.user.create({ data: { id: 1, age: 18, profile: { create: { id: 1, age: 20 } } } })
        ).toBeRejectedByPolicy();
        await expect(prisma.user.findUnique({ where: { id: 1 } })).toResolveNull();
        await expect(
            db.user.create({ data: { id: 1, age: 18, profile: { create: { id: 1, age: 18 } } } })
        ).toResolveTruthy();
        await expect(prisma.user.findUnique({ where: { id: 1 } })).toResolveTruthy();
        await reset();

        // TODO: cross-model field comparison is not supported for read rules yet
        // // read
        // await prisma.user.create({ data: { id: 1, age: 18, profile: { create: { id: 1, age: 18 } } } });
        // await expect(db.user.findUnique({ where: { id: 1 }, include: { profile: true } })).resolves.toMatchObject({
        //     age: 18,
        //     profile: expect.objectContaining({ age: 18 }),
        // });
        // await expect(db.user.findMany({ include: { profile: true } })).resolves.toEqual(
        //     expect.arrayContaining([
        //         expect.objectContaining({
        //             age: 18,
        //             profile: expect.objectContaining({ age: 18 }),
        //         }),
        //     ])
        // );
        // await prisma.user.update({ where: { id: 1 }, data: { age: 20 } });
        // let r = await db.user.findUnique({ where: { id: 1 }, include: { profile: true } });
        // expect(r.profile).toBeUndefined();
        // r = await db.user.findMany({ include: { profile: true } });
        // expect(r[0].profile).toBeUndefined();
        // await reset();

        // update
        await prisma.user.create({ data: { id: 1, age: 18, profile: { create: { id: 1, age: 18 } } } });
        await expect(
            db.user.update({ where: { id: 1 }, data: { profile: { update: { age: 20 } } } })
        ).toResolveTruthy();
        let r = await prisma.user.findUnique({ where: { id: 1 }, include: { profile: true } });
        expect(r.profile).toMatchObject({ age: 20 });
        await expect(
            db.user.update({ where: { id: 1 }, data: { profile: { update: { age: 18 } } } })
        ).toBeRejectedByPolicy();
        await reset();

        // post update
        await prisma.user.create({ data: { id: 1, age: 18, profile: { create: { id: 1, age: 18 } } } });
        await expect(
            db.user.update({ where: { id: 1 }, data: { profile: { update: { age: 15 } } } })
        ).toBeRejectedByPolicy();
        await expect(
            db.user.update({ where: { id: 1 }, data: { profile: { update: { age: 20 } } } })
        ).toResolveTruthy();
        await reset();

        // upsert
        await prisma.user.create({ data: { id: 1, age: 18, profile: { create: { id: 1, age: 20 } } } });
        await expect(
            db.user.update({
                where: { id: 1 },
                data: {
                    profile: {
                        upsert: {
                            create: { id: 1, age: 25 },
                            update: { age: 25 },
                        },
                    },
                },
            })
        ).toBeRejectedByPolicy();
        await prisma.user.update({ where: { id: 1 }, data: { age: 20 } });
        await expect(
            db.user.update({
                where: { id: 1 },
                data: {
                    profile: {
                        upsert: {
                            create: { id: 1, age: 25 },
                            update: { age: 25 },
                        },
                    },
                },
            })
        ).toResolveTruthy();
        await prisma.user.create({ data: { id: 2, age: 18 } });
        await expect(
            db.user.update({
                where: { id: 2 },
                data: {
                    profile: {
                        upsert: {
                            create: { id: 2, age: 25 },
                            update: { age: 25 },
                        },
                    },
                },
            })
        ).toBeRejectedByPolicy();
        await expect(
            db.user.update({
                where: { id: 2 },
                data: {
                    profile: {
                        upsert: {
                            create: { id: 2, age: 18 },
                            update: { age: 25 },
                        },
                    },
                },
            })
        ).toResolveTruthy();
        await reset();

        // delete
        await prisma.user.create({ data: { id: 1, age: 18, profile: { create: { id: 1, age: 20 } } } });
        await expect(db.user.update({ where: { id: 1 }, data: { profile: { delete: true } } })).toBeRejectedByPolicy();
        await prisma.user.update({ where: { id: 1 }, data: { age: 20 } });
        await expect(db.user.update({ where: { id: 1 }, data: { profile: { delete: true } } })).toResolveTruthy();
        await expect(await prisma.profile.findMany()).toHaveLength(0);
        await reset();

        // connect/disconnect
        await prisma.user.create({ data: { id: 1, age: 18, profile: { create: { id: 1, age: 20 } } } });
        await expect(
            db.user.update({ where: { id: 1 }, data: { profile: { disconnect: true } } })
        ).toBeRejectedByPolicy();
        await prisma.user.update({ where: { id: 1 }, data: { age: 20 } });
        await expect(db.user.update({ where: { id: 1 }, data: { profile: { disconnect: true } } })).toResolveTruthy();
        await prisma.user.create({ data: { id: 2, age: 25 } });
        await expect(
            db.user.update({ where: { id: 2 }, data: { profile: { connect: { id: 1 } } } })
        ).toBeRejectedByPolicy();
        await prisma.user.create({ data: { id: 3, age: 20 } });
        await expect(db.user.update({ where: { id: 3 }, data: { profile: { connect: { id: 1 } } } })).toResolveTruthy();
        await expect(prisma.profile.findFirst()).resolves.toMatchObject({ userId: 3 });
        await reset();
    });

    it('to-many relation', async () => {
        const { prisma, enhance } = await loadSchema(
            `
        model User {
            id Int @id
            profiles Profile[]
            age Int
                  
            @@allow('read', true)
            @@allow('create,update,delete', profiles![this.age == age])
            @@deny('update', future().profiles?[this.age < age])
        }
        
        model Profile {
            id Int @id
            age Int
            user User @relation(fields: [userId], references: [id], onDelete: Cascade)
            userId Int
        
            @@allow('all', true)
        }
        `,
            { preserveTsFiles: true }
        );

        const db = enhance();

        const reset = async () => {
            await prisma.user.deleteMany();
        };

        // create
        await expect(
            db.user.create({ data: { id: 1, age: 18, profiles: { create: [{ id: 1, age: 20 }] } } })
        ).toBeRejectedByPolicy();
        await expect(
            db.user.create({
                data: {
                    id: 1,
                    age: 18,
                    profiles: {
                        createMany: {
                            data: [
                                { id: 1, age: 18 },
                                { id: 2, age: 20 },
                            ],
                        },
                    },
                },
            })
        ).toBeRejectedByPolicy();
        await expect(
            db.user.create({ data: { id: 1, age: 18, profiles: { create: [{ id: 1, age: 20 }] } } })
        ).toBeRejectedByPolicy();
        await expect(
            db.user.create({
                data: {
                    id: 1,
                    age: 18,
                    profiles: {
                        createMany: {
                            data: [
                                { id: 1, age: 18 },
                                { id: 2, age: 18 },
                            ],
                        },
                    },
                },
            })
        ).toResolveTruthy();
        await expect(
            db.user.create({
                data: { id: 2, age: 18 },
            })
        ).toResolveTruthy();
        await reset();

        // createMany
        await expect(
            db.user.createMany({
                data: [
                    { id: 1, age: 18, profiles: { create: { id: 1, age: 20 } } },
                    { id: 2, age: 18, profiles: { create: { id: 2, age: 20 } } },
                ],
            })
        ).toBeRejectedByPolicy();
        await expect(
            db.user.createMany({
                data: [
                    { id: 1, age: 18, profiles: { create: { id: 1, age: 18 } } },
                    { id: 2, age: 19, profiles: { create: { id: 2, age: 19 } } },
                ],
            })
        ).resolves.toEqual({ count: 2 });
        await reset();

        // TODO: cross-model field comparison is not supported for read rules yet
        // // read
        // await prisma.user.create({ data: { id: 1, age: 18, profiles: { create: { id: 1, age: 18 } } } });
        // await expect(db.user.findUnique({ where: { id: 1 } })).toResolveTruthy();
        // await expect(db.user.findMany()).resolves.toHaveLength(1);
        // await prisma.user.update({ where: { id: 1 }, data: { age: 20 } });
        // await expect(db.user.findUnique({ where: { id: 1 } })).toResolveNull();
        // await expect(db.user.findMany()).resolves.toHaveLength(0);
        // await reset();

        // update
        await prisma.user.create({ data: { id: 1, age: 18, profiles: { create: { id: 1, age: 18 } } } });
        await expect(db.user.update({ where: { id: 1 }, data: { age: 20 } })).toResolveTruthy();
        await expect(prisma.user.findUnique({ where: { id: 1 } })).resolves.toMatchObject({ age: 20 });
        await expect(db.user.update({ where: { id: 1 }, data: { age: 18 } })).toBeRejectedByPolicy();
        await reset();

        // post update
        await prisma.user.create({ data: { id: 1, age: 18, profiles: { create: { id: 1, age: 18 } } } });
        await expect(db.user.update({ where: { id: 1 }, data: { age: 15 } })).toBeRejectedByPolicy();
        await expect(db.user.update({ where: { id: 1 }, data: { age: 20 } })).toResolveTruthy();
        await reset();

        // upsert
        await prisma.user.create({ data: { id: 1, age: 18, profiles: { create: { id: 1, age: 20 } } } });
        await expect(
            db.user.upsert({ where: { id: 1 }, create: { id: 1, age: 25 }, update: { age: 25 } })
        ).toBeRejectedByPolicy();
        await expect(
            db.user.upsert({
                where: { id: 2 },
                create: { id: 2, age: 18, profiles: { create: { id: 2, age: 25 } } },
                update: { age: 25 },
            })
        ).toBeRejectedByPolicy();
        await prisma.user.update({ where: { id: 1 }, data: { age: 20 } });
        await expect(
            db.user.upsert({ where: { id: 1 }, create: { id: 1, age: 25 }, update: { age: 25 } })
        ).toResolveTruthy();
        await expect(prisma.user.findUnique({ where: { id: 1 } })).resolves.toMatchObject({ age: 25 });
        await expect(
            db.user.upsert({
                where: { id: 2 },
                create: { id: 2, age: 25, profiles: { create: { id: 2, age: 25 } } },
                update: { age: 25 },
            })
        ).toResolveTruthy();
        await expect(prisma.user.findMany()).resolves.toHaveLength(2);
        await reset();

        // updateMany
        await prisma.user.create({ data: { id: 1, age: 18, profiles: { create: { id: 1, age: 20 } } } });
        // non updatable
        await expect(db.user.updateMany({ data: { age: 18 } })).resolves.toMatchObject({ count: 0 });
        await prisma.user.create({ data: { id: 2, age: 25, profiles: { create: { id: 2, age: 25 } } } });
        // one of the two is updatable
        await expect(db.user.updateMany({ data: { age: 30 } })).resolves.toMatchObject({ count: 1 });
        await expect(prisma.user.findUnique({ where: { id: 1 } })).resolves.toMatchObject({ age: 18 });
        await expect(prisma.user.findUnique({ where: { id: 2 } })).resolves.toMatchObject({ age: 30 });
        await reset();

        // delete
        await prisma.user.create({ data: { id: 1, age: 18, profiles: { create: { id: 1, age: 20 } } } });
        await expect(db.user.delete({ where: { id: 1 } })).toBeRejectedByPolicy();
        await expect(prisma.user.findMany()).resolves.toHaveLength(1);
        await prisma.user.update({ where: { id: 1 }, data: { age: 20 } });
        await expect(db.user.delete({ where: { id: 1 } })).toResolveTruthy();
        await expect(prisma.user.findMany()).resolves.toHaveLength(0);
        await reset();

        // deleteMany
        await prisma.user.create({ data: { id: 1, age: 18, profiles: { create: { id: 1, age: 20 } } } });
        await expect(db.user.deleteMany()).resolves.toMatchObject({ count: 0 });
        await prisma.user.create({ data: { id: 2, age: 25, profiles: { create: { id: 2, age: 25 } } } });
        // one of the two is deletable
        await expect(db.user.deleteMany()).resolves.toMatchObject({ count: 1 });
        await expect(prisma.user.findMany()).resolves.toHaveLength(1);
    });

    it('nested inside to-many relation', async () => {
        const { prisma, enhance } = await loadSchema(
            `
        model User {
            id Int @id
            profiles Profile[]
            age Int

            @@allow('all', true)
        }
        
        model Profile {
            id Int @id
            age Int
            user User? @relation(fields: [userId], references: [id])
            userId Int? @unique
        
            @@allow('read', true)
            @@allow('create,update,delete', user == null || age == user.age)
            @@deny('update', future().user != null && future().age < future().user.age && age > 0)
        }
        `
        );

        const db = enhance();

        const reset = async () => {
            await prisma.profile.deleteMany();
            await prisma.user.deleteMany();
        };

        // create
        await expect(
            db.user.create({ data: { id: 1, age: 18, profiles: { create: { id: 1, age: 20 } } } })
        ).toBeRejectedByPolicy();
        await expect(prisma.user.findUnique({ where: { id: 1 } })).toResolveNull();
        await expect(
            db.user.create({ data: { id: 1, age: 18, profiles: { create: { id: 1, age: 18 } } } })
        ).toResolveTruthy();
        await expect(prisma.user.findUnique({ where: { id: 1 } })).toResolveTruthy();
        await reset();

        // TODO: cross-model field comparison is not supported for read rules yet
        // // read
        // await prisma.user.create({ data: { id: 1, age: 18, profiles: { create: { id: 1, age: 18 } } } });
        // await expect(db.user.findUnique({ where: { id: 1 }, include: { profiles: true } })).resolves.toMatchObject({
        //     age: 18,
        //     profiles: [expect.objectContaining({ age: 18 })],
        // });
        // await expect(db.user.findMany({ include: { profiles: true } })).resolves.toEqual(
        //     expect.arrayContaining([
        //         expect.objectContaining({
        //             age: 18,
        //             profiles: [expect.objectContaining({ age: 18 })],
        //         }),
        //     ])
        // );
        // await prisma.user.update({ where: { id: 1 }, data: { age: 20 } });
        // let r = await db.user.findUnique({ where: { id: 1 }, include: { profiles: true } });
        // expect(r.profiles).toHaveLength(0);
        // r = await db.user.findMany({ include: { profiles: true } });
        // expect(r[0].profiles).toHaveLength(0);
        // await reset();

        // update
        await prisma.user.create({ data: { id: 1, age: 18, profiles: { create: { id: 1, age: 18 } } } });
        await expect(
            db.user.update({
                where: { id: 1 },
                data: { profiles: { update: { where: { id: 1 }, data: { age: 20 } } } },
            })
        ).toResolveTruthy();
        let r = await prisma.user.findUnique({ where: { id: 1 }, include: { profiles: true } });
        expect(r.profiles[0]).toMatchObject({ age: 20 });
        await expect(
            db.user.update({
                where: { id: 1 },
                data: { profiles: { update: { where: { id: 1 }, data: { age: 18 } } } },
            })
        ).toBeRejectedByPolicy();
        await reset();

        // post update
        await prisma.user.create({ data: { id: 1, age: 18, profiles: { create: { id: 1, age: 18 } } } });
        await expect(
            db.user.update({
                where: { id: 1 },
                data: { profiles: { update: { where: { id: 1 }, data: { age: 15 } } } },
            })
        ).toBeRejectedByPolicy();
        await expect(
            db.user.update({
                where: { id: 1 },
                data: { profiles: { update: { where: { id: 1 }, data: { age: 20 } } } },
            })
        ).toResolveTruthy();
        await reset();

        // upsert
        await prisma.user.create({ data: { id: 1, age: 18, profiles: { create: { id: 1, age: 20 } } } });
        await expect(
            db.user.update({
                where: { id: 1 },
                data: {
                    profiles: {
                        upsert: {
                            where: { id: 1 },
                            create: { id: 1, age: 25 },
                            update: { age: 25 },
                        },
                    },
                },
            })
        ).toBeRejectedByPolicy();
        await prisma.user.update({ where: { id: 1 }, data: { age: 20 } });
        await expect(
            db.user.update({
                where: { id: 1 },
                data: {
                    profiles: {
                        upsert: {
                            where: { id: 1 },
                            create: { id: 1, age: 25 },
                            update: { age: 25 },
                        },
                    },
                },
            })
        ).toResolveTruthy();
        await prisma.user.create({ data: { id: 2, age: 18 } });
        await expect(
            db.user.update({
                where: { id: 2 },
                data: {
                    profiles: {
                        upsert: {
                            where: { id: 2 },
                            create: { id: 2, age: 25 },
                            update: { age: 25 },
                        },
                    },
                },
            })
        ).toBeRejectedByPolicy();
        await expect(
            db.user.update({
                where: { id: 2 },
                data: {
                    profiles: {
                        upsert: {
                            where: { id: 2 },
                            create: { id: 2, age: 18 },
                            update: { age: 25 },
                        },
                    },
                },
            })
        ).toResolveTruthy();
        await reset();

        // delete
        await prisma.user.create({ data: { id: 1, age: 18, profiles: { create: { id: 1, age: 20 } } } });
        await expect(
            db.user.update({ where: { id: 1 }, data: { profiles: { delete: { id: 1 } } } })
        ).toBeRejectedByPolicy();
        await prisma.user.update({ where: { id: 1 }, data: { age: 20 } });
        await expect(db.user.update({ where: { id: 1 }, data: { profiles: { delete: { id: 1 } } } })).toResolveTruthy();
        await expect(await prisma.profile.findMany()).toHaveLength(0);
        await reset();

        // connect/disconnect
        await prisma.user.create({ data: { id: 1, age: 18, profiles: { create: { id: 1, age: 20 } } } });
        await expect(
            db.user.update({ where: { id: 1 }, data: { profiles: { disconnect: { id: 1 } } } })
        ).toBeRejectedByPolicy();
        await prisma.user.update({ where: { id: 1 }, data: { age: 20 } });
        await expect(
            db.user.update({ where: { id: 1 }, data: { profiles: { disconnect: { id: 1 } } } })
        ).toResolveTruthy();
        await prisma.user.create({ data: { id: 2, age: 25 } });
        await expect(
            db.user.update({ where: { id: 2 }, data: { profiles: { connect: { id: 1 } } } })
        ).toBeRejectedByPolicy();
        await prisma.user.create({ data: { id: 3, age: 20 } });
        await expect(
            db.user.update({ where: { id: 3 }, data: { profiles: { connect: { id: 1 } } } })
        ).toResolveTruthy();
        await expect(prisma.profile.findFirst()).resolves.toMatchObject({ userId: 3 });
        await reset();
    });

    it('field-level', async () => {});
});
