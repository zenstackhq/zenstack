import { loadSchema } from '@zenstackhq/testtools';

describe('issue 1964', () => {
    it('regression1', async () => {
        const { enhance } = await loadSchema(
            `
model User {
  id    Int    @id
  orgId String
}

model Author {
  id    Int    @id @default(autoincrement())
  orgId String
  name  String
  posts Post[]

  @@unique([orgId, name])
  @@allow('all', auth().orgId == orgId)
}

model Post {
  id       Int     @id @default(autoincrement())
  orgId    String
  title    String
  author   Author  @relation(fields: [authorId], references: [id])
  authorId Int

  @@allow('all', auth().orgId == orgId)
}
            `,
            {
                previewFeatures: ['strictUndefinedChecks'],
                logPrismaQuery: true,
            }
        );

        const db = enhance({ id: 1, orgId: 'org' });

        const newauthor = await db.author.create({
            data: {
                name: `Foo ${Date.now()}`,
                orgId: 'org',
                posts: {
                    createMany: { data: [{ title: 'Hello', orgId: 'org' }] },
                },
            },
            include: { posts: true },
        });

        await expect(
            db.author.update({
                where: { orgId_name: { orgId: 'org', name: newauthor.name } },
                data: {
                    name: `Bar ${Date.now()}`,
                    posts: { deleteMany: { id: { equals: newauthor.posts[0].id } } },
                },
            })
        ).toResolveTruthy();
    });

    it('regression2', async () => {
        const { enhance } = await loadSchema(
            `
model User {
  id    Int    @id @default(autoincrement())
  slug  String @unique
  profile Profile?
  @@allow('all', true)
}

model Profile {
  id    Int    @id @default(autoincrement())
  slug  String @unique
  name  String
  addresses Address[]
  userId Int? @unique
  user User? @relation(fields: [userId], references: [id])
  @@allow('all', true)
}

model Address {
  id    Int    @id @default(autoincrement())
  profileId Int @unique
  profile Profile @relation(fields: [profileId], references: [id])
  city String
  @@allow('all', true)
}
            `,
            {
                previewFeatures: ['strictUndefinedChecks'],
                logPrismaQuery: true,
            }
        );

        const db = enhance({ id: 1, orgId: 'org' });

        await db.user.create({
            data: {
                slug: `user1`,
                profile: {
                    create: {
                        name: `My Profile`,
                        slug: 'profile1',
                        addresses: {
                            create: { id: 1, city: 'City' },
                        },
                    },
                },
            },
        });

        await expect(
            db.user.update({
                where: { slug: 'user1' },
                data: {
                    profile: {
                        update: {
                            addresses: {
                                deleteMany: { id: { equals: 1 } },
                            },
                        },
                    },
                },
            })
        ).toResolveTruthy();

        await expect(db.address.count()).resolves.toEqual(0);
    });
});
