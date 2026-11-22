import { ORMErrorReason } from '@zenstackhq/orm';
import { createPolicyTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

describe('Regression for issue 2888', () => {
    it('a computed field referenced in @@allow does not throw "no such column" and evaluates its expression', async () => {
        const db = await createPolicyTestClient(
            `
model Model {
    id Int @id @default(autoincrement())
    x Int
    canEdit Boolean @computed

    @@allow('create,read', true)
    @@allow('update', canEdit)
}
            `,
            {
                provider: 'mysql',
                usePrismaPush: true,
                computedFields: {
                    model: {
                        canEdit: (eb: any) => eb.lit(true),
                    },
                },
            } as any,
        );

        await db.model.create({ data: { id: 1, x: 1 } });

        await expect(db.model.update({ where: { id: 1 }, data: { x: 2 } })).resolves.toMatchObject({
            x: 2,
        });
    });

    it('binds computed expression to the right row and denies when false', async () => {
        const db = await createPolicyTestClient(
            `
model Model {
    id Int @id @default(autoincrement())
    x Int
    canEdit Boolean @computed

    @@allow('create,read', true)
    @@allow('update', canEdit)
}
            `,
            {
                computedFields: {
                    Model: {
                        canEdit: (eb: any, ctx: any) => eb(eb.ref(`${ctx.modelAlias}.x`), '>', 0),
                    },
                },
            } as any,
        );

        await db.model.create({ data: { id: 1, x: 1 } });
        await db.model.create({ data: { id: 2, x: 0 } });

        await expect(db.model.update({ where: { id: 1 }, data: { x: 2 } })).resolves.toMatchObject({ x: 2 });
        await expect(db.model.update({ where: { id: 2 }, data: { x: 5 } })).toBeRejectedNotFound();
    });

    it('computed field reached through a relation member access', async () => {
        const db = await createPolicyTestClient(
            `
model User {
    id Int @id @default(autoincrement())
    status String
    isActive Boolean @computed
    posts Post[]
    @@allow('all', true)
}

model Post {
    id Int @id @default(autoincrement())
    owner User @relation(fields: [ownerId], references: [id])
    ownerId Int
    @@allow('create', true)
    @@allow('read', owner.isActive)
}
            `,
            {
                computedFields: {
                    User: {
                        isActive: (eb: any, ctx: any) => eb(eb.ref(`${ctx.modelAlias}.status`), '=', 'active'),
                    },
                },
            } as any,
        );

        await db.$unuseAll().user.create({ data: { id: 1, status: 'active', posts: { create: { id: 1 } } } });
        await db.$unuseAll().user.create({ data: { id: 2, status: 'inactive', posts: { create: { id: 2 } } } });

        await expect(db.post.findMany()).resolves.toEqual([expect.objectContaining({ id: 1 })]);
    });

    it('computed field inherited from a delegate base model', async () => {
        const db = await createPolicyTestClient(
            `
model Asset {
    id Int @id @default(autoincrement())
    visibility String
    isPublic Boolean @computed
    type String
    @@delegate(type)
    @@allow('create', true)
}

model Video extends Asset {
    duration Int
    @@allow('create', true)
    @@allow('read', isPublic)
}
            `,
            {
                computedFields: {
                    Asset: {
                        isPublic: (eb: any, ctx: any) => eb(eb.ref(`${ctx.modelAlias}.visibility`), '=', 'public'),
                    },
                },
            } as any,
        );

        await db.$unuseAll().video.create({ data: { id: 1, visibility: 'public', duration: 1 } });
        await db.$unuseAll().video.create({ data: { id: 2, visibility: 'private', duration: 1 } });

        await expect(db.video.findMany()).resolves.toEqual([expect.objectContaining({ id: 1 })]);
    });

    it('before().computedField in post-update policy', async () => {
        const db = await createPolicyTestClient(
            `
model Model {
    id Int @id @default(autoincrement())
    x Int
    canEdit Boolean @computed

    @@allow('all', true)
    @@deny('post-update', !before().canEdit)
}
            `,
            {
                computedFields: {
                    Model: {
                        canEdit: (eb: any, ctx: any) => eb(eb.ref(`${ctx.modelAlias}.x`), '>', 0),
                    },
                },
            } as any,
        );

        await db.model.create({ data: { id: 1, x: 1 } });
        await db.model.create({ data: { id: 2, x: 0 } });

        await expect(db.model.update({ where: { id: 1 }, data: { x: 2 } })).resolves.toMatchObject({ x: 2 });
        await expect(db.model.update({ where: { id: 2 }, data: { x: 5 } })).toBeRejectedByPolicy();
    });

    it('computed field in create policy (value-object context)', async () => {
        const db = await createPolicyTestClient(
            `
model Model {
    id Int @id @default(autoincrement())
    x Int
    canCreate Boolean @computed

    @@allow('read', true)
    @@allow('create', canCreate)
}
            `,
            {
                computedFields: {
                    Model: {
                        canCreate: (eb: any, ctx: any) => eb(eb.ref(`${ctx.modelAlias}.x`), '>', 0),
                    },
                },
            } as any,
        );

        await expect(db.model.create({ data: { id: 1, x: 1 } })).resolves.toMatchObject({ x: 1 });
        await expect(db.model.create({ data: { id: 2, x: 0 } })).toBeRejectedByPolicy();
    });

    it('before() on a computed field inherited from a delegate base, and relation access to it', async () => {
        const db = await createPolicyTestClient(
            `
model Owner {
    id Int @id @default(autoincrement())
    videos Video[]
    @@allow('all', true)
}

model Asset {
    id Int @id @default(autoincrement())
    visibility String
    isPublic Boolean @computed
    type String
    @@delegate(type)
    @@allow('all', true)
}

model Video extends Asset {
    duration Int
    owner Owner @relation(fields: [ownerId], references: [id])
    ownerId Int
    comments Comment[]
    @@allow('all', true)
    @@deny('post-update', !before().isPublic)
}

model Comment {
    id Int @id @default(autoincrement())
    videoId Int
    video Video @relation(fields: [videoId], references: [id])
    @@allow('create', true)
    @@allow('read', video.isPublic)
}
            `,
            {
                computedFields: {
                    Asset: {
                        isPublic: (eb: any, ctx: any) => eb(eb.ref(`${ctx.modelAlias}.visibility`), '=', 'public'),
                    },
                },
            } as any,
        );

        await db.owner.create({ data: { id: 1 } });
        await db.video.create({ data: { id: 1, visibility: 'public', duration: 1, ownerId: 1 } });
        await db.video.create({ data: { id: 2, visibility: 'private', duration: 1, ownerId: 1 } });
        await db.$unuseAll().comment.create({ data: { id: 1, videoId: 1 } });
        await db.$unuseAll().comment.create({ data: { id: 2, videoId: 2 } });

        await expect(db.comment.findMany()).resolves.toEqual([expect.objectContaining({ id: 1 })]);
        await expect(db.video.update({ where: { id: 1 }, data: { duration: 2 } })).resolves.toMatchObject({
            duration: 2,
        });
        await expect(db.video.update({ where: { id: 2 }, data: { duration: 2 } })).toBeRejectedByPolicy();
    });

    it('parameterized computed field in policy is rejected with a clear error', async () => {
        const db = await createPolicyTestClient(
            `
model Model {
    id Int @id @default(autoincrement())
    x Int
    score(min: Int) Int @computed
    @@allow('create', true)
    @@allow('read', score > 0)
}
            `,
            {
                computedFields: {
                    Model: {
                        score: (eb: any, ctx: any, args: any) => eb(eb.ref(`${ctx.modelAlias}.x`), '-', args?.min ?? 0),
                    },
                },
            } as any,
        );
        await db.$unuseAll().model.create({ data: { id: 1, x: 1 } });
        await expect(db.model.findMany()).rejects.toMatchObject({
            reason: ORMErrorReason.CONFIG_ERROR,
            message: expect.stringContaining('Parameterized computed field "score"'),
        });
    });

    it('parameterized computed field referenced via before() is rejected with a clear error', async () => {
        const db = await createPolicyTestClient(
            `
model Model {
    id Int @id @default(autoincrement())
    x Int
    score(min: Int) Int @computed
    @@allow('create,read,update', true)
    @@allow('post-update', before().score > 0)
}
            `,
            {
                computedFields: {
                    Model: {
                        // the default would let the update through if the impl were called without args
                        score: (eb: any, ctx: any, args: any) => eb(eb.ref(`${ctx.modelAlias}.x`), '-', args?.min ?? 0),
                    },
                },
            } as any,
        );
        await db.model.create({ data: { id: 1, x: 1 } });
        await expect(db.model.update({ where: { id: 1 }, data: { x: 2 } })).rejects.toMatchObject({
            reason: ORMErrorReason.CONFIG_ERROR,
            message: expect.stringContaining('Parameterized computed field "score"'),
        });
    });
});
