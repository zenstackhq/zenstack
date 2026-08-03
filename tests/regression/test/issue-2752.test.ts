import { createPolicyTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

describe('Regression for issue 2752', () => {
    it('rejects an update with only an empty implicit-M2M `set: []` for a caller denied by the update policy', async () => {
        const db = await createPolicyTestClient(
            `
model User {
    id       Int       @id @default(autoincrement())
    profiles Profile[]

    @@allow('all', true)
}

model Profile {
    id      Int    @id @default(autoincrement())
    name    String
    ownerId Int
    owner   User   @relation(fields: [ownerId], references: [id])
    tags    Tag[]

    @@allow('read,create', true)
    @@allow('update', auth() == owner)
}

model Tag {
    id       String    @id
    profiles Profile[]

    @@allow('read,create', true)
    @@allow('update', auth() != null)
}
            `,
            { usePrismaPush: true },
        );

        const rawDb = db.$unuseAll();
        const owner = await rawDb.user.create({ data: {} });
        const other = await rawDb.user.create({ data: {} });
        await rawDb.tag.create({ data: { id: 'a' } });
        await rawDb.tag.create({ data: { id: 'b' } });
        const profile = await rawDb.profile.create({
            data: { name: 'p1', ownerId: owner.id, tags: { connect: [{ id: 'a' }, { id: 'b' }] } },
        });

        const asOther = db.$setAuth({ id: other.id });

        // non-empty set is rejected
        await expect(
            asOther.profile.update({ where: { id: profile.id }, data: { tags: { set: [{ id: 'a' }] } } }),
        ).toBeRejectedByPolicy();

        // empty set (disconnect-all) must be rejected too, instead of silently succeeding
        await expect(
            asOther.profile.update({ where: { id: profile.id }, data: { tags: { set: [] } } }),
        ).toBeRejectedByPolicy();

        // nothing was disconnected
        await expect(
            rawDb.profile.findUniqueOrThrow({ where: { id: profile.id }, include: { tags: true } }),
        ).resolves.toMatchObject({ tags: expect.arrayContaining([expect.objectContaining({ id: 'a' })]) });

        // the owner can do it
        const asOwner = db.$setAuth({ id: owner.id });
        await expect(
            asOwner.profile.update({ where: { id: profile.id }, data: { tags: { set: [] } } }),
        ).toResolveTruthy();
        await expect(
            rawDb.profile.findUniqueOrThrow({ where: { id: profile.id }, include: { tags: true } }),
        ).resolves.toMatchObject({ tags: [] });
    });

    it('rejects an implicit-M2M `disconnect` for a caller denied by the update policy', async () => {
        const db = await createPolicyTestClient(
            `
model User {
    id       Int       @id @default(autoincrement())
    profiles Profile[]

    @@allow('all', true)
}

model Profile {
    id      Int    @id @default(autoincrement())
    name    String
    ownerId Int
    owner   User   @relation(fields: [ownerId], references: [id])
    tags    Tag[]

    @@allow('read,create', true)
    @@allow('update', auth() == owner)
}

model Tag {
    id       String    @id
    profiles Profile[]

    @@allow('read,create', true)
    @@allow('update', auth() != null)
}
            `,
            { usePrismaPush: true },
        );

        const rawDb = db.$unuseAll();
        const owner = await rawDb.user.create({ data: {} });
        const other = await rawDb.user.create({ data: {} });
        await rawDb.tag.create({ data: { id: 'a' } });
        const profile = await rawDb.profile.create({
            data: { name: 'p1', ownerId: owner.id, tags: { connect: { id: 'a' } } },
        });

        const asOther = db.$setAuth({ id: other.id });

        await expect(
            asOther.profile.update({ where: { id: profile.id }, data: { tags: { disconnect: { id: 'a' } } } }),
        ).toBeRejectedByPolicy();

        // links intact
        await expect(
            rawDb.profile.findUniqueOrThrow({ where: { id: profile.id }, include: { tags: true } }),
        ).resolves.toMatchObject({ tags: [expect.objectContaining({ id: 'a' })] });
    });
});
