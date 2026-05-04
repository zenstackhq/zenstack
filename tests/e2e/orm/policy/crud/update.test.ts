import { createPolicyTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

describe('Update policy tests', () => {
    describe('Scalar condition tests', () => {
        it('works with scalar field check', async () => {
            const db = await createPolicyTestClient(
                `
model Foo {
    id Int @id
    x  Int
    @@allow('update', x > 0)
    @@allow('create,read', true)
}
`,
            );

            await db.foo.create({ data: { id: 1, x: 0 } });
            await expect(db.foo.update({ where: { id: 1 }, data: { x: 1 } })).toBeRejectedNotFound();
            await db.foo.create({ data: { id: 2, x: 1 } });
            await expect(db.foo.update({ where: { id: 2 }, data: { x: 2 } })).resolves.toMatchObject({ x: 2 });

            await expect(
                db.$qb.updateTable('Foo').set({ x: 1 }).where('id', '=', 1).executeTakeFirst(),
            ).resolves.toMatchObject({ numUpdatedRows: 0n });

            if (db.$schema.provider.type !== 'mysql') {
                await expect(
                    db.$qb.updateTable('Foo').set({ x: 3 }).where('id', '=', 2).returningAll().execute(),
                ).resolves.toMatchObject([{ id: 2, x: 3 }]);
            }
        });

        it('works with this scalar member check', async () => {
            const db = await createPolicyTestClient(
                `
model Foo {
    id Int @id
    x  Int
    @@allow('update', this.x > 0)
    @@allow('create,read', true)
}
`,
            );

            await db.foo.create({ data: { id: 1, x: 0 } });
            await expect(db.foo.update({ where: { id: 1 }, data: { x: 1 } })).toBeRejectedNotFound();
            await db.foo.create({ data: { id: 2, x: 1 } });
            await expect(db.foo.update({ where: { id: 2 }, data: { x: 2 } })).resolves.toMatchObject({ x: 2 });
        });

        it('denies by default', async () => {
            const db = await createPolicyTestClient(
                `
model Foo {
    id Int @id
    x  Int
    @@allow('create,read', true)
}
`,
            );

            await db.foo.create({ data: { id: 1, x: 0 } });
            await expect(db.foo.update({ where: { id: 1 }, data: { x: 1 } })).toBeRejectedNotFound();
        });

        it('works with deny rule', async () => {
            const db = await createPolicyTestClient(
                `
model Foo {
    id Int @id
    x  Int
    @@deny('update', x <= 0)
    @@allow('create,read,update', true)
}
`,
            );
            await db.foo.create({ data: { id: 1, x: 0 } });
            await expect(db.foo.update({ where: { id: 1 }, data: { x: 1 } })).toBeRejectedNotFound();
            await db.foo.create({ data: { id: 2, x: 1 } });
            await expect(db.foo.update({ where: { id: 2 }, data: { x: 2 } })).resolves.toMatchObject({ x: 2 });
        });

        it('works with mixed allow and deny rules', async () => {
            const db = await createPolicyTestClient(
                `
model Foo {
    id Int @id
    x  Int
    @@deny('update', x <= 0)
    @@allow('update', x <= 0 || x > 1)
    @@allow('create,read', true)
}
`,
            );

            await db.foo.create({ data: { id: 1, x: 0 } });
            await expect(db.foo.update({ where: { id: 1 }, data: { x: 1 } })).toBeRejectedNotFound();
            await db.foo.create({ data: { id: 2, x: 1 } });
            await expect(db.foo.update({ where: { id: 2 }, data: { x: 2 } })).toBeRejectedNotFound();
            await db.foo.create({ data: { id: 3, x: 2 } });
            await expect(db.foo.update({ where: { id: 3 }, data: { x: 3 } })).resolves.toMatchObject({ x: 3 });
        });

        it('works with auth check', async () => {
            const db = await createPolicyTestClient(
                `
type Auth {
    x Int
    @@auth
}

model Foo {
    id Int @id
    x  Int
    @@allow('update', x == auth().x)
    @@allow('create,read', true)
}
`,
            );
            await db.foo.create({ data: { id: 1, x: 1 } });
            await expect(db.$setAuth({ x: 0 }).foo.update({ where: { id: 1 }, data: { x: 2 } })).toBeRejectedNotFound();
            await expect(db.$setAuth({ x: 1 }).foo.update({ where: { id: 1 }, data: { x: 2 } })).resolves.toMatchObject(
                {
                    x: 2,
                },
            );
        });
    });

    describe('Relation condition tests', () => {
        it('works with to-one relation check owner side', async () => {
            const db = await createPolicyTestClient(
                `
model User {
    id Int @id
    name String
    profile Profile?
    @@allow('all', true)
}

model Profile {
    id Int @id
    bio String
    user User @relation(fields: [userId], references: [id])
    userId Int @unique
    @@allow('create,read', true)
    @@allow('update', user.name == 'User2')
}
`,
            );

            await db.user.create({ data: { id: 1, name: 'User1', profile: { create: { id: 1, bio: 'Bio1' } } } });
            await expect(db.profile.update({ where: { id: 1 }, data: { bio: 'UpdatedBio1' } })).toBeRejectedNotFound();

            await db.user.create({ data: { id: 2, name: 'User2', profile: { create: { id: 2, bio: 'Bio2' } } } });
            await expect(db.profile.update({ where: { id: 2 }, data: { bio: 'UpdatedBio2' } })).resolves.toMatchObject({
                bio: 'UpdatedBio2',
            });
        });

        it('works with to-one relation check non-owner side', async () => {
            const db = await createPolicyTestClient(
                `
model User {
    id Int @id
    name String
    profile Profile @relation(fields: [profileId], references: [id])
    profileId Int @unique
    @@allow('all', true)
}

model Profile {
    id Int @id
    bio String
    user User?
    @@allow('create,read', true)
    @@allow('update', user.name == 'User2')
}
`,
            );

            await db.user.create({ data: { id: 1, name: 'User1', profile: { create: { id: 1, bio: 'Bio1' } } } });
            await expect(db.profile.update({ where: { id: 1 }, data: { bio: 'UpdatedBio1' } })).toBeRejectedNotFound();

            await db.user.create({ data: { id: 2, name: 'User2', profile: { create: { id: 2, bio: 'Bio2' } } } });
            await expect(db.profile.update({ where: { id: 2 }, data: { bio: 'UpdatedBio2' } })).resolves.toMatchObject({
                bio: 'UpdatedBio2',
            });
        });

        it('works with to-many relation check some', async () => {
            const db = await createPolicyTestClient(
                `
model User {
    id Int @id
    name String
    posts Post[]
    @@allow('create,read', true)
    @@allow('update', posts?[published])
}

model Post {
    id Int @id
    title String
    published Boolean
    author User @relation(fields: [authorId], references: [id])
    authorId Int
    @@allow('all', true)
}
`,
            );

            await db.user.create({ data: { id: 1, name: 'User1' } });
            await expect(db.user.update({ where: { id: 1 }, data: { name: 'UpdatedUser1' } })).toBeRejectedNotFound();

            await db.user.create({
                data: { id: 2, name: 'User2', posts: { create: { id: 1, title: 'Post1', published: false } } },
            });
            await expect(db.user.update({ where: { id: 2 }, data: { name: 'UpdatedUser2' } })).toBeRejectedNotFound();

            await db.user.create({
                data: {
                    id: 3,
                    name: 'User3',
                    posts: {
                        create: [
                            { id: 2, title: 'Post2', published: false },
                            { id: 3, title: 'Post3', published: true },
                        ],
                    },
                },
            });
            await expect(db.user.update({ where: { id: 3 }, data: { name: 'UpdatedUser3' } })).toResolveTruthy();
        });

        it('works with to-many relation check all', async () => {
            const db = await createPolicyTestClient(
                `
model User {
    id Int @id
    name String
    posts Post[]
    @@allow('create,read', true)
    @@allow('update', posts![published])
}

model Post {
    id Int @id
    title String
    published Boolean
    author User @relation(fields: [authorId], references: [id])
    authorId Int
    @@allow('all', true)
}
`,
            );

            await db.user.create({ data: { id: 1, name: 'User1' } });
            await expect(db.user.update({ where: { id: 1 }, data: { name: 'UpdatedUser1' } })).toResolveTruthy();

            await db.user.create({
                data: {
                    id: 2,
                    name: 'User2',
                    posts: {
                        create: [
                            { id: 1, title: 'Post1', published: false },
                            { id: 2, title: 'Post2', published: true },
                        ],
                    },
                },
            });
            await expect(db.user.update({ where: { id: 2 }, data: { name: 'UpdatedUser2' } })).toBeRejectedNotFound();

            await db.user.create({
                data: {
                    id: 3,
                    name: 'User3',
                    posts: {
                        create: [
                            { id: 3, title: 'Post3', published: true },
                            { id: 4, title: 'Post4', published: true },
                        ],
                    },
                },
            });
            await expect(db.user.update({ where: { id: 3 }, data: { name: 'UpdatedUser3' } })).toResolveTruthy();
        });

        it('works with to-many relation check none', async () => {
            const db = await createPolicyTestClient(
                `
model User {
    id Int @id
    name String
    posts Post[]
    @@allow('create,read', true)
    @@allow('update', posts^[published])
}

model Post {
    id Int @id
    title String
    published Boolean
    author User @relation(fields: [authorId], references: [id])
    authorId Int
    @@allow('all', true)
}
`,
            );

            await db.user.create({ data: { id: 1, name: 'User1' } });
            await expect(db.user.update({ where: { id: 1 }, data: { name: 'UpdatedUser1' } })).toResolveTruthy();

            await db.user.create({
                data: {
                    id: 2,
                    name: 'User2',
                    posts: {
                        create: [
                            { id: 1, title: 'Post1', published: false },
                            { id: 2, title: 'Post2', published: true },
                        ],
                    },
                },
            });
            await expect(db.user.update({ where: { id: 2 }, data: { name: 'UpdatedUser2' } })).toBeRejectedNotFound();

            await db.user.create({
                data: {
                    id: 3,
                    name: 'User3',
                    posts: {
                        create: [
                            { id: 3, title: 'Post3', published: false },
                            { id: 4, title: 'Post4', published: false },
                        ],
                    },
                },
            });
            await expect(db.user.update({ where: { id: 3 }, data: { name: 'UpdatedUser3' } })).toResolveTruthy();
        });

        it('works with unnamed many-to-many relation check', async () => {
            const db = await createPolicyTestClient(
                `
model User {
    id Int @id
    name String
    groups Group[]
    @@allow('create,read', true)
    @@allow('update', groups?[!private])
}

model Group {
    id Int @id
    private Boolean
    members User[]
    @@allow('all', true)
}
`,
                { usePrismaPush: true },
            );

            await db.$unuseAll().user.create({
                data: {
                    id: 1,
                    name: 'User1',
                    groups: {
                        create: [
                            { id: 1, private: true },
                            { id: 2, private: false },
                        ],
                    },
                },
            });

            await expect(db.user.update({ where: { id: 1 }, data: { name: 'User2' } })).toResolveTruthy();

            await db.$unuseAll().group.update({ where: { id: 2 }, data: { private: true } });
            // not satisfying update policy anymore
            await expect(db.user.update({ where: { id: 1 }, data: { name: 'User3' } })).toBeRejectedNotFound();
        });

        it('works with named many-to-many relation check', async () => {
            const db = await createPolicyTestClient(
                `
model User {
    id Int @id
    name String
    groups Group[] @relation("UserGroups")
    @@allow('create,read', true)
    @@allow('update', groups?[!private])
}

model Group {
    id Int @id
    private Boolean
    members User[] @relation("UserGroups")
    @@allow('all', true)
}
`,
                { usePrismaPush: true },
            );

            await db.$unuseAll().user.create({
                data: {
                    id: 1,
                    name: 'User1',
                    groups: {
                        create: [
                            { id: 1, private: true },
                            { id: 2, private: false },
                        ],
                    },
                },
            });

            await expect(db.user.update({ where: { id: 1 }, data: { name: 'User2' } })).toResolveTruthy();

            await db.$unuseAll().group.update({ where: { id: 2 }, data: { private: true } });
            // not satisfying update policy anymore
            await expect(db.user.update({ where: { id: 1 }, data: { name: 'User3' } })).toBeRejectedNotFound();
        });
    });

    describe('Nested create tests', () => {
        it('works with nested create non-owner side', async () => {
            const db = await createPolicyTestClient(
                `
model User {
    id Int @id
    profile Profile?
    @@allow('all', true)
}

model Profile {
    id Int @id
    user User? @relation(fields: [userId], references: [id])
    userId Int? @unique
    @@allow('create', user.id == auth().id)
    @@allow('read', true)
}
            `,
            );

            await db.user.create({ data: { id: 1 } });
            await expect(
                db.user.update({ where: { id: 1 }, data: { profile: { create: { id: 1 } } } }),
            ).toBeRejectedByPolicy();
            await expect(
                db.$setAuth({ id: 1 }).user.update({
                    where: { id: 1 },
                    data: { profile: { create: { id: 1 } } },
                    include: { profile: true },
                }),
            ).resolves.toMatchObject({
                profile: {
                    id: 1,
                },
            });
        });

        it('works with nested create owner side', async () => {
            const db = await createPolicyTestClient(
                `
model User {
    id Int @id
    profile Profile? @relation(fields: [profileId], references: [id])
    profileId Int? @unique
    @@allow('create,read', true)
    @@allow('update', auth() == this)
}

model Profile {
    id Int @id
    user User?
    @@allow('all', true)
}
`,
            );

            await db.user.create({ data: { id: 1 } });
            await expect(
                db.user.update({ where: { id: 1 }, data: { profile: { create: { id: 1 } } } }),
            ).toBeRejectedNotFound();
            await expect(
                db.$setAuth({ id: 1 }).user.update({
                    where: { id: 1 },
                    data: { profile: { create: { id: 1 } } },
                    include: { profile: true },
                }),
            ).resolves.toMatchObject({
                profile: {
                    id: 1,
                },
            });
        });

        it('works with nested create many', async () => {
            const db = await createPolicyTestClient(
                `
model User {
    id Int @id
    posts Post[]
    @@allow('all', true)
}

model Post {
    id Int @id
    title String
    user User @relation(fields: [userId], references: [id])
    userId Int
    @@allow('read', true)
    @@allow('create', auth() == this.user)
}
`,
            );

            await db.user.create({ data: { id: 1 } });
            await expect(
                db.user.update({
                    where: { id: 1 },
                    data: {
                        posts: {
                            createMany: {
                                data: [
                                    { id: 1, title: 'Post1' },
                                    { id: 2, title: 'Post2' },
                                ],
                            },
                        },
                    },
                }),
            ).toBeRejectedByPolicy();
            await expect(
                db.$setAuth({ id: 1 }).user.update({
                    where: { id: 1 },
                    data: {
                        posts: {
                            createMany: {
                                data: [
                                    { id: 1, title: 'Post1' },
                                    { id: 2, title: 'Post2' },
                                ],
                            },
                        },
                    },
                    include: { posts: true },
                }),
            ).resolves.toMatchObject({
                posts: [{ id: 1 }, { id: 2 }],
            });
        });
    });

    describe('Nested update tests', () => {
        it('works with nested update non-owner side', async () => {
            const db = await createPolicyTestClient(
                `
model User {
    id Int @id
    profile Profile?
    @@allow('all', true)
}

model Profile {
    id Int @id
    bio String
    private Boolean
    user User? @relation(fields: [userId], references: [id])
    userId Int? @unique
    @@allow('create,read', true)
    @@allow('update', !private)
}
`,
            );

            await db.user.create({ data: { id: 1, profile: { create: { id: 1, bio: 'Bio1', private: true } } } });
            await expect(
                db.user.update({
                    where: { id: 1 },
                    data: { profile: { update: { bio: 'UpdatedBio1' } } },
                }),
            ).toBeRejectedNotFound();

            await db.user.create({ data: { id: 2, profile: { create: { id: 2, bio: 'Bio2', private: false } } } });
            await expect(
                db.user.update({
                    where: { id: 2 },
                    data: { profile: { update: { bio: 'UpdatedBio2' } } },
                    include: { profile: true },
                }),
            ).resolves.toMatchObject({
                profile: {
                    bio: 'UpdatedBio2',
                },
            });
        });

        it('works with nested update owner side', async () => {
            const db = await createPolicyTestClient(
                `
model User {
    id Int @id
    profile Profile @relation(fields: [profileId], references: [id])
    profileId Int @unique
    @@allow('all', true)
}

model Profile {
    id Int @id
    bio String
    private Boolean
    user User?
    @@allow('create,read', true)
    @@allow('update', !private)
}
`,
            );

            await db.user.create({ data: { id: 1, profile: { create: { id: 1, bio: 'Bio1', private: true } } } });
            await expect(
                db.user.update({
                    where: { id: 1 },
                    data: { profile: { update: { bio: 'UpdatedBio1' } } },
                }),
            ).toBeRejectedNotFound();

            await db.user.create({ data: { id: 2, profile: { create: { id: 2, bio: 'Bio2', private: false } } } });
            await expect(
                db.user.update({
                    where: { id: 2 },
                    data: { profile: { update: { bio: 'UpdatedBio2' } } },
                    include: { profile: true },
                }),
            ).resolves.toMatchObject({
                profile: {
                    bio: 'UpdatedBio2',
                },
            });
        });

        it('works with nested update many', async () => {
            const db = await createPolicyTestClient(
                `
model User {
    id Int @id
    posts Post[]
    @@allow('all', true)
}

model Post {
    id Int @id
    title String
    private Boolean
    user User @relation(fields: [userId], references: [id])
    userId Int
    @@allow('create,read', true)
    @@allow('update', !private)
}
`,
            );

            await db.user.create({
                data: {
                    id: 1,
                    posts: {
                        create: [
                            { id: 1, title: 'Post 1', private: true },
                            { id: 2, title: 'Post 2', private: false },
                        ],
                    },
                },
            });
            await expect(
                db.user.update({
                    where: { id: 1 },
                    data: {
                        posts: {
                            updateMany: {
                                where: { title: { contains: 'Post' } },
                                data: { title: 'Updated Title' },
                            },
                        },
                    },
                    include: { posts: true },
                }),
            ).resolves.toMatchObject({
                posts: [{ title: 'Post 1' }, { title: 'Updated Title' }],
            });
        });

        it('works with nested upsert', async () => {
            const db = await createPolicyTestClient(
                `
model User {
    id Int @id
    posts Post[]
    @@allow('all', true)
}

model Post {
    id Int @id
    title String
    user User @relation(fields: [userId], references: [id])
    userId Int
    @@allow('read', true)
    @@allow('create', contains(title, 'Foo'))
    @@allow('update', contains(title, 'Bar'))
}
`,
            );

            await db.user.create({ data: { id: 1 } });
            // can't create
            await expect(
                db.user.update({
                    where: { id: 1 },
                    data: {
                        posts: {
                            upsert: {
                                where: { id: 1 },
                                create: { id: 1, title: 'Post1' },
                                update: { title: 'Post1' },
                            },
                        },
                    },
                }),
            ).toBeRejectedByPolicy();
            // can create
            await expect(
                db.user.update({
                    where: { id: 1 },
                    data: {
                        posts: {
                            upsert: {
                                where: { id: 1 },
                                create: { id: 1, title: 'Foo Post' },
                                update: { title: 'Post1' },
                            },
                        },
                    },
                    include: { posts: true },
                }),
            ).resolves.toMatchObject({
                posts: [{ id: 1, title: 'Foo Post' }],
            });
            // can't update
            await expect(
                db.user.update({
                    where: { id: 1 },
                    data: {
                        posts: {
                            upsert: {
                                where: { id: 1 },
                                create: { id: 1, title: 'Foo Post' },
                                update: { title: 'Post1' },
                            },
                        },
                    },
                }),
            ).rejects.toSatisfy((e) => e.cause.message.toLowerCase().match(/(constraint)|(duplicate)/));
            await db.$unuseAll().post.update({ where: { id: 1 }, data: { title: 'Bar Post' } });
            // can update
            await expect(
                db.user.update({
                    where: { id: 1 },
                    data: {
                        posts: {
                            upsert: {
                                where: { id: 1 },
                                create: { id: 1, title: 'Foo Post' },
                                update: { title: 'Bar Updated' },
                            },
                        },
                    },
                    include: { posts: true },
                }),
            ).resolves.toMatchObject({
                posts: [{ id: 1, title: 'Bar Updated' }],
            });
        });
    });

    describe('Nested delete tests', () => {
        it('works with nested delete non-owner side', async () => {
            const db = await createPolicyTestClient(
                `
model User {
    id Int @id
    profile Profile?
    @@allow('all', true)
}

model Profile {
    id Int @id
    private Boolean
    user User? @relation(fields: [userId], references: [id])
    userId Int? @unique
    @@allow('create,read', true)
    @@allow('delete', !private)
}
`,
            );

            await db.user.create({ data: { id: 1, profile: { create: { id: 1, private: true } } } });
            await expect(
                db.user.update({
                    where: { id: 1 },
                    data: { profile: { delete: true } },
                }),
            ).toBeRejectedNotFound();

            await db.user.create({ data: { id: 2, profile: { create: { id: 2, private: false } } } });
            await expect(
                db.user.update({
                    where: { id: 2 },
                    data: { profile: { delete: true } },
                    include: { profile: true },
                }),
            ).resolves.toMatchObject({ profile: null });
            await expect(db.profile.findUnique({ where: { id: 2 } })).resolves.toBeNull();
        });
    });

    describe('Relation manipulation tests', () => {
        it('works with connect/disconnect/create owner side', async () => {
            const db = await createPolicyTestClient(
                `
model User {
    id Int @id
    profile Profile?
    @@allow('all', true)
}

model Profile {
    id Int @id
    private Boolean
    user User? @relation(fields: [userId], references: [id])
    userId Int? @unique
    @@allow('create,read', true)
    @@allow('update', !private)
}
`,
            );

            await db.user.create({ data: { id: 1 } });

            await db.profile.create({ data: { id: 1, private: true } });
            await expect(
                db.user.update({
                    where: { id: 1 },
                    data: { profile: { connect: { id: 1 } } },
                    include: { profile: true },
                }),
            ).toBeRejectedNotFound();

            await db.profile.create({ data: { id: 2, private: false } });
            await expect(
                db.user.update({
                    where: { id: 1 },
                    data: { profile: { connect: { id: 2 } } },
                    include: { profile: true },
                }),
            ).resolves.toMatchObject({
                profile: {
                    id: 2,
                },
            });
            await expect(
                db.user.update({
                    where: { id: 1 },
                    data: { profile: { disconnect: true } },
                    include: { profile: true },
                }),
            ).resolves.toMatchObject({
                profile: null,
            });
            // reconnect
            await db.user.update({ where: { id: 1 }, data: { profile: { connect: { id: 2 } } } });
            // set private
            await db.profile.update({ where: { id: 2 }, data: { private: true } });
            // disconnect should have no effect since update is not allowed
            await expect(
                db.user.update({
                    where: { id: 1 },
                    data: { profile: { disconnect: true } },
                    include: { profile: true },
                }),
            ).resolves.toMatchObject({ profile: { id: 2 } });

            await db.profile.create({ data: { id: 3, private: true } });
            await expect(
                db.profile.update({
                    where: { id: 3 },
                    data: { user: { create: { id: 2 } } },
                }),
            ).toBeRejectedNotFound();
        });

        it('works with connect/disconnect/create non-owner side', async () => {
            const db = await createPolicyTestClient(
                `
model User {
    id Int @id
    profile Profile? @relation(fields: [profileId], references: [id])
    profileId Int? @unique
    private Boolean
    @@allow('create,read', true)
    @@allow('update', !private)
}

model Profile {
    id Int @id
    user User?
    @@allow('all', true)
}
`,
            );

            await db.user.create({ data: { id: 1, private: true } });
            await db.profile.create({ data: { id: 1 } });
            await expect(
                db.user.update({
                    where: { id: 1 },
                    data: { profile: { connect: { id: 1 } } },
                    include: { profile: true },
                }),
            ).toBeRejectedNotFound();

            await db.user.create({ data: { id: 2, private: false } });
            await db.profile.create({ data: { id: 2 } });
            await expect(
                db.user.update({
                    where: { id: 2 },
                    data: { profile: { connect: { id: 2 } } },
                    include: { profile: true },
                }),
            ).resolves.toMatchObject({
                profile: {
                    id: 2,
                },
            });
            await expect(
                db.user.update({
                    where: { id: 2 },
                    data: { profile: { disconnect: true } },
                    include: { profile: true },
                }),
            ).resolves.toMatchObject({
                profile: null,
            });
            // reconnect
            await db.user.update({ where: { id: 2 }, data: { profile: { connect: { id: 2 } } } });
            // set private
            await db.user.update({ where: { id: 2 }, data: { private: true } });
            // disconnect should be rejected since update is not allowed
            await expect(
                db.user.update({
                    where: { id: 2 },
                    data: { profile: { disconnect: true } },
                    include: { profile: true },
                }),
            ).toBeRejectedNotFound();

            await db.profile.create({ data: { id: 3 } });
            await expect(
                db.profile.update({
                    where: { id: 3 },
                    data: { user: { create: { id: 3, private: true } } },
                }),
            ).toResolveTruthy();
        });

        it('works with many-to-many relation manipulation', async () => {
            const db = await createPolicyTestClient(
                `
model User {
    id Int @id
    private Boolean
    groups Group[] @relation("UserGroups")
    @@allow('create,read', true)
    @@allow('update,delete', !private)
}

model Group {
    id Int @id
    private Boolean
    members User[] @relation("UserGroups")
    @@allow('create,read', true)
    @@allow('update,delete', !private)
}
`,
                { usePrismaPush: true },
            );

            await db.$unuseAll().user.create({ data: { id: 1, private: true } });
            await db.$unuseAll().user.create({ data: { id: 2, private: false } });

            // user not updatable
            await expect(
                db.user.update({ where: { id: 1 }, data: { groups: { create: { id: 1, private: false } } } }),
            ).toBeRejectedByPolicy();

            // group not updatable
            await expect(
                db.user.update({ where: { id: 2 }, data: { groups: { create: { id: 1, private: true } } } }),
            ).toBeRejectedByPolicy();

            // both updatable
            await expect(
                db.user.update({
                    where: { id: 2 },
                    data: { groups: { create: { id: 1, private: false } } },
                    include: { groups: true },
                }),
            ).toResolveTruthy();

            // disconnect
            await expect(
                db.user.update({ where: { id: 2 }, data: { groups: { disconnect: { id: 1 } } } }),
            ).toResolveTruthy();

            // set
            await expect(
                db.user.update({ where: { id: 2 }, data: { groups: { set: [{ id: 1 }] } } }),
            ).toResolveTruthy();

            // delete
            await expect(
                db.user.update({ where: { id: 2 }, data: { groups: { delete: { id: 1 } } } }),
            ).toResolveTruthy();

            // recreate group as private
            await db.$unuseAll().group.create({ data: { id: 2, private: true } });

            // connect rejected
            await expect(
                db.user.update({ where: { id: 2 }, data: { groups: { connect: { id: 2 } } } }),
            ).toBeRejectedByPolicy();

            // disconnect rejected
            await db.$unuseAll().user.update({ where: { id: 2 }, data: { groups: { connect: { id: 2 } } } });
            await expect(
                db.user.update({
                    where: { id: 2 },
                    data: { groups: { disconnect: { id: 2 } } },
                    include: { groups: true },
                }),
            ).resolves.toMatchObject({
                groups: [{ id: 2 }], // verify not disconnected
            });

            // delete rejected
            await expect(
                db.user.update({
                    where: { id: 2 },
                    data: { groups: { delete: { id: 2 } } },
                    include: { groups: true },
                }),
            ).toBeRejectedNotFound();

            // set rejected
            await expect(
                db.user.update({
                    where: { id: 2 },
                    data: { groups: { set: [] } },
                    include: { groups: true },
                }),
            ).resolves.toMatchObject({
                groups: [{ id: 2 }], // verify not disconnected
            });

            await db.$unuseAll().group.update({ where: { id: 2 }, data: { private: false } });
            await db.$unuseAll().group.create({ data: { id: 3, private: true } });

            // set rejected
            await expect(
                db.user.update({
                    where: { id: 2 },
                    data: { groups: { set: [{ id: 3 }] } },
                    include: { groups: true },
                }),
            ).toBeRejectedByPolicy();

            // relation unchanged
            await expect(db.user.findUnique({ where: { id: 2 }, include: { groups: true } })).resolves.toMatchObject({
                groups: [{ id: 2 }],
            });

            // set success
            await db.$unuseAll().group.update({ where: { id: 3 }, data: { private: false } });
            await expect(
                db.user.update({
                    where: { id: 2 },
                    data: { groups: { set: [{ id: 3 }] } },
                    include: { groups: true },
                }),
            ).resolves.toMatchObject({
                groups: [{ id: 3 }],
            });
        });
    });

    describe('Upsert tests', () => {
        it('works with upsert', async () => {
            const db = await createPolicyTestClient(
                `
model Foo {
    id Int @id
    x  Int
    @@allow('create', x > 0)
    @@allow('update', x > 1)
    @@allow('read', true)
}
`,
            );
            // can't create
            await expect(
                db.foo.upsert({ where: { id: 1 }, create: { id: 1, x: 0 }, update: { x: 2 } }),
            ).toBeRejectedByPolicy();
            await expect(
                db.foo.upsert({ where: { id: 1 }, create: { id: 1, x: 1 }, update: { x: 2 } }),
            ).resolves.toMatchObject({ x: 1 });
            // can't update, but create violates unique constraint
            await expect(
                db.foo.upsert({ where: { id: 1 }, create: { id: 1, x: 1 }, update: { x: 1 } }),
            ).rejects.toSatisfy((e) => e.cause.message.toLowerCase().match(/(constraint)|(duplicate)/));
            await db.$unuseAll().foo.update({ where: { id: 1 }, data: { x: 2 } });
            // can update now
            await expect(
                db.foo.upsert({ where: { id: 1 }, create: { id: 1, x: 1 }, update: { x: 3 } }),
            ).resolves.toMatchObject({ x: 3 });
        });
    });

    describe('Update many tests', () => {
        it('works with update many', async () => {
            const db = await createPolicyTestClient(
                `
model Foo {
    id Int @id
    x  Int
    @@allow('create', true)
    @@allow('update', x > 1)
    @@allow('read', true)
}
`,
            );

            await db.foo.createMany({
                data: [
                    { id: 1, x: 1 },
                    { id: 2, x: 2 },
                    { id: 3, x: 3 },
                ],
            });
            await expect(db.foo.updateMany({ data: { x: 5 } })).resolves.toMatchObject({ count: 2 });
            await expect(db.foo.findMany()).resolves.toEqual(
                expect.arrayContaining([
                    { id: 1, x: 1 },
                    { id: 2, x: 5 },
                    { id: 3, x: 5 },
                ]),
            );
        });
    });

    describe('Query builder tests', () => {
        it('works with simple update', async () => {
            const db = await createPolicyTestClient(
                `
model Foo {
    id Int @id
    x  Int
    @@allow('create', true)
    @@allow('update', x > 1)
    @@allow('read', true)
}
`,
            );

            await db.foo.createMany({
                data: [
                    { id: 1, x: 1 },
                    { id: 2, x: 2 },
                    { id: 3, x: 3 },
                ],
            });

            // not updatable
            await expect(
                db.$qb.updateTable('Foo').set({ x: 5 }).where('id', '=', 1).executeTakeFirst(),
            ).resolves.toMatchObject({ numUpdatedRows: 0n });

            // with where
            await expect(
                db.$qb.updateTable('Foo').set({ x: 5 }).where('id', '=', 2).executeTakeFirst(),
            ).resolves.toMatchObject({ numUpdatedRows: 1n });
            await expect(db.foo.findUnique({ where: { id: 2 } })).resolves.toMatchObject({ x: 5 });

            // without where
            await expect(db.$qb.updateTable('Foo').set({ x: 6 }).executeTakeFirst()).resolves.toMatchObject({
                numUpdatedRows: 2n,
            });
            await expect(db.foo.findUnique({ where: { id: 1 } })).resolves.toMatchObject({ x: 1 });
        });

        it('does not throw for nonexistent row', async () => {
            const db = await createPolicyTestClient(
                `
model Foo {
    id Int @id
    x  Int
    @@allow('create', true)
    @@allow('update', x > 1)
    @@allow('read', true)
}
`,
            );

            await db.foo.createMany({ data: [{ id: 1, x: 2 }] });

            // nonexistent row — row does not exist at all, so postModelLevelCheck must NOT throw
            await expect(
                db.$qb.updateTable('Foo').set({ x: 5 }).where('id', '=', 999).executeTakeFirst(),
            ).resolves.toMatchObject({ numUpdatedRows: 0n });
        });

        it('works with insert on conflict do update', async () => {
            const db = await createPolicyTestClient(
                `
model Foo {
    id Int @id
    x  Int
    @@allow('create', true)
    @@allow('update', x > 1)
    @@allow('read', true)
}
`,
            );

            await db.foo.createMany({
                data: [
                    { id: 1, x: 1 },
                    { id: 2, x: 2 },
                    { id: 3, x: 3 },
                ],
            });

            const mysql = db.$schema.provider.type === 'mysql';

            // #1 not updatable
            const r = await db.$qb
                .insertInto('Foo')
                .values({ id: 1, x: 5 })
                .$if(mysql, (qb) => qb.onDuplicateKeyUpdate({ x: 5 }))
                .$if(!mysql, (qb) => qb.onConflict((oc: any) => oc.column('id').doUpdateSet({ x: 5 })))
                .executeTakeFirst();

            if (!mysql) {
                expect(r).toMatchObject({ numInsertedOrUpdatedRows: 0n });
            } else {
                // mysql's on duplicate key update returns rows affected even if no values are changed
                expect(r).toMatchObject({ numInsertedOrUpdatedRows: 1n });
            }
            // verify not updated
            await expect(db.foo.findUnique({ where: { id: 1 } })).resolves.toMatchObject({ x: 1 });

            await expect(db.foo.count()).resolves.toBe(3);
            await expect(db.foo.findUnique({ where: { id: 1 } })).resolves.toMatchObject({ x: 1 });

            if (!mysql) {
                // with where, #1 not updatable
                await expect(
                    db.$qb
                        .insertInto('Foo')
                        .values({ id: 1, x: 5 })
                        .onConflict((oc: any) => oc.column('id').doUpdateSet({ x: 5 }).where('Foo.id', '=', 1))
                        .executeTakeFirst(),
                ).resolves.toMatchObject({ numInsertedOrUpdatedRows: 0n });
                await expect(db.foo.count()).resolves.toBe(3);
                await expect(db.foo.findUnique({ where: { id: 1 } })).resolves.toMatchObject({ x: 1 });

                // with where, #2 updatable
                await expect(
                    db.$qb
                        .insertInto('Foo')
                        .values({ id: 2, x: 5 })
                        .onConflict((oc: any) => oc.column('id').doUpdateSet({ x: 6 }).where('Foo.id', '=', 2))
                        .executeTakeFirst(),
                ).resolves.toMatchObject({ numInsertedOrUpdatedRows: 1n });
                await expect(db.foo.count()).resolves.toBe(3);
                await expect(db.foo.findUnique({ where: { id: 2 } })).resolves.toMatchObject({ x: 6 });
            }
        });
    });
});
