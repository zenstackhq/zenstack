import { loadSchema } from '@zenstackhq/testtools';

describe('Abstract models', () => {
    it('connect test1', async () => {
        const { enhance } = await loadSchema(
            `
        model User {
            id Int @id @default(autoincrement())
            profile Profile? @relation(fields: [profileId], references: [id])
            profileId Int? @unique

            @@allow('create,read', true)
            @@allow('update', auth().id == 1)
        }
        
        abstract model BaseProfile {
            id Int @id @default(autoincrement())
            user User?

            @@allow('all', true)
        }

        model Profile extends BaseProfile {
            name String
        }
        `
        );

        const db = enhance({ id: 2 });
        const user = await db.user.create({ data: { id: 1 } });
        const profile = await db.profile.create({ data: { id: 1, name: 'John' } });
        await expect(
            db.profile.update({ where: { id: 1 }, data: { user: { connect: { id: user.id } } } })
        ).toBeRejectedByPolicy();
        await expect(
            db.user.update({ where: { id: 1 }, data: { profile: { connect: { id: profile.id } } } })
        ).toBeRejectedByPolicy();

        const db1 = enhance({ id: 1 });
        await expect(
            db1.profile.update({ where: { id: 1 }, data: { user: { connect: { id: user.id } } } })
        ).toResolveTruthy();
        await expect(
            db1.user.update({ where: { id: 1 }, data: { profile: { connect: { id: profile.id } } } })
        ).toResolveTruthy();
    });

    it('connect test2', async () => {
        const { enhance } = await loadSchema(
            `
        model User {
            id Int @id @default(autoincrement())
            profile Profile?

            @@allow('all', true)
        }
        
        abstract model BaseProfile {
            id Int @id @default(autoincrement())
            user User? @relation(fields: [userId], references: [id])
            userId Int? @unique

            @@allow('create,read', true)
            @@allow('update', auth().id == 1)
        }

        model Profile extends BaseProfile {
            name String
        }
        `
        );

        const db = enhance({ id: 2 });
        const user = await db.user.create({ data: { id: 1 } });
        const profile = await db.profile.create({ data: { id: 1, name: 'John' } });
        await expect(
            db.profile.update({ where: { id: 1 }, data: { user: { connect: { id: user.id } } } })
        ).toBeRejectedByPolicy();
        await expect(
            db.user.update({ where: { id: 1 }, data: { profile: { connect: { id: profile.id } } } })
        ).toBeRejectedByPolicy();

        const db1 = enhance({ id: 1 });
        await expect(
            db1.profile.update({ where: { id: 1 }, data: { user: { connect: { id: user.id } } } })
        ).toResolveTruthy();
        await expect(
            db1.user.update({ where: { id: 1 }, data: { profile: { connect: { id: profile.id } } } })
        ).toResolveTruthy();
    });
});
