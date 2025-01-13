import { createPostgresDb, dropPostgresDb, loadSchema } from '@zenstackhq/testtools';

describe('issue 1955', () => {
    it('simple policy', async () => {
        const dbUrl = await createPostgresDb('issue-1955-1');
        let _prisma: any;

        try {
            const { enhance, prisma } = await loadSchema(
                `
            model Post {
                id Int @id @default(autoincrement())
                name String
                expections String[]

                @@allow('all', true)
            }
            `,
                { provider: 'postgresql', dbUrl }
            );
            _prisma = prisma;

            const db = enhance();
            await expect(
                db.post.createManyAndReturn({
                    data: [
                        {
                            name: 'bla',
                        },
                        {
                            name: 'blu',
                        },
                    ],
                })
            ).resolves.toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ name: 'bla' }),
                    expect.objectContaining({ name: 'blu' }),
                ])
            );
        } finally {
            await _prisma.$disconnect();
            await dropPostgresDb('issue-1955');
        }
    });

    it('complex policy', async () => {
        const dbUrl = await createPostgresDb('issue-1955-2');
        let _prisma: any;

        try {
            const { enhance, prisma } = await loadSchema(
                `
            model Post {
                id Int @id @default(autoincrement())
                name String
                expections String[]
                comments Comment[]

                @@allow('all', comments^[private])
            }

            model Comment {
                id Int @id @default(autoincrement())
                private Boolean @default(false)
                postId Int
                post Post @relation(fields: [postId], references: [id])
            }
            `,
                { provider: 'postgresql', dbUrl }
            );
            _prisma = prisma;

            const db = enhance();
            await expect(
                db.post.createManyAndReturn({
                    data: [
                        {
                            name: 'bla',
                        },
                        {
                            name: 'blu',
                        },
                    ],
                })
            ).resolves.toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ name: 'bla' }),
                    expect.objectContaining({ name: 'blu' }),
                ])
            );
        } finally {
            await _prisma.$disconnect();
            await dropPostgresDb('issue-1955-2');
        }
    });
});
