import { loadSchema } from '@zenstackhq/testtools';
describe('issue 1576', () => {
    it('regression', async () => {
        const { enhance } = await loadSchema(
            `
model Profile {
  id Int @id @default(autoincrement())
  name String
  items Item[]
  type String
  @@delegate(type)
  @@allow('all', true)
}

model GoldProfile extends Profile {
  ticket Int
}

model Item {
  id Int @id @default(autoincrement())
  profileId Int
  profile Profile @relation(fields: [profileId], references: [id])
  type String
  @@delegate(type)
  @@allow('all', true)
}

model GoldItem extends Item {
  inventory Boolean
}
          `
        );

        const db = enhance();

        const profile = await db.goldProfile.create({
            data: {
                name: 'hello',
                ticket: 5,
            },
        });

        await expect(
            db.goldItem.createManyAndReturn({
                data: [
                    {
                        profileId: profile.id,
                        inventory: true,
                    },
                    {
                        profileId: profile.id,
                        inventory: true,
                    },
                ],
            })
        ).resolves.toEqual(
            expect.arrayContaining([
                expect.objectContaining({ profileId: profile.id, type: 'GoldItem', inventory: true }),
                expect.objectContaining({ profileId: profile.id, type: 'GoldItem', inventory: true }),
            ])
        );
    });
});
