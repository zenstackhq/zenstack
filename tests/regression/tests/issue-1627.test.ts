import { loadSchema } from '@zenstackhq/testtools';
describe('issue 1627', () => {
    it('regression', async () => {
        const { prisma, enhance } = await loadSchema(
            `
model User {
  id          String @id
  memberships GymUser[]
}

model Gym {
  id      String @id
  members GymUser[]

  @@allow('all', true)
}

model GymUser {
  id      String @id
  userID  String
  user    User @relation(fields: [userID], references: [id])
  gymID   String?
  gym     Gym? @relation(fields: [gymID], references: [id])
  role    String

  @@allow('read',gym.members?[user == auth() && (role == "ADMIN" || role == "TRAINER")])
  @@unique([userID, gymID])
}
            `
        );

        await prisma.user.create({ data: { id: '1' } });

        await prisma.gym.create({
            data: {
                id: '1',
                members: {
                    create: {
                        id: '1',
                        user: { connect: { id: '1' } },
                        role: 'ADMIN',
                    },
                },
            },
        });

        const db = enhance();
        await expect(db.gymUser.findMany()).resolves.toHaveLength(0);
    });
});
