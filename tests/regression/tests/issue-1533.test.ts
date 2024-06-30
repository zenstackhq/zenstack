import { createPostgresDb, dropPostgresDb, loadSchema } from '@zenstackhq/testtools';
describe('issue 1533', () => {
    it('regression', async () => {
        const dbUrl = await createPostgresDb('issue-1533');
        let prisma;

        try {
            const r = await loadSchema(
                `
            model Test {
                id       String @id @default(uuid()) @db.Uuid
                metadata Json
                @@allow('all', true)
            }
            `,
                { provider: 'postgresql', dbUrl }
            );

            prisma = r.prisma;
            const db = r.enhance();
            const Prisma = r.prismaModule;

            const testWithMetadata = await prisma.test.create({
                data: {
                    metadata: {
                        test: 'test',
                    },
                },
            });
            const testWithEmptyMetadata = await prisma.test.create({
                data: {
                    metadata: {},
                },
            });

            let result = await db.test.findMany({
                where: {
                    metadata: {
                        path: ['test'],
                        equals: Prisma.DbNull,
                    },
                },
            });

            expect(result).toHaveLength(1);
            expect(result).toEqual(expect.arrayContaining([expect.objectContaining({ id: testWithEmptyMetadata.id })]));

            result = await db.test.findMany({
                where: {
                    metadata: {
                        path: ['test'],
                        equals: 'test',
                    },
                },
            });

            expect(result).toHaveLength(1);
            expect(result).toEqual(expect.arrayContaining([expect.objectContaining({ id: testWithMetadata.id })]));
        } finally {
            if (prisma) {
                await prisma.$disconnect();
            }
            await dropPostgresDb('issue-1533');
        }
    });
});
