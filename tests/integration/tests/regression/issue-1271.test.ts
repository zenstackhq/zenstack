import { loadSchema } from '@zenstackhq/testtools';

describe('issue 1271', () => {
    it('regression', async () => {
        const { enhance } = await loadSchema(
            `
            model User {
                id String @id @default(uuid())
              
                @@auth
                @@allow('all', true)
            }
              
            model Test {
                id String @id @default(uuid())
                linkingTable LinkingTable[]
                key String @default('test')
                locale String @default('EN')
              
                @@unique([key, locale])
                @@allow("all", true)
            }
              
            model LinkingTable {
                test_id String
                test Test @relation(fields: [test_id], references: [id])
              
                another_test_id String
                another_test AnotherTest @relation(fields: [another_test_id], references: [id])
              
                @@id([test_id, another_test_id])
                @@allow("all", true)
            }
              
            model AnotherTest {
                id String @id @default(uuid())
                status String
                linkingTable LinkingTable[]
              
                @@allow("all", true)
            }              
            `,
            { logPrismaQuery: true }
        );

        const db = enhance();

        const test = await db.test.create({
            data: {
                key: 'hello',
            },
        });
        const anotherTest = await db.anotherTest.create({
            data: {
                status: 'available',
            },
        });

        const updated = await db.test.upsert({
            where: {
                key_locale: {
                    key: test.key,
                    locale: test.locale,
                },
            },
            create: {
                linkingTable: {
                    create: {
                        another_test_id: anotherTest.id,
                    },
                },
            },
            update: {
                linkingTable: {
                    create: {
                        another_test_id: anotherTest.id,
                    },
                },
            },
            include: {
                linkingTable: true,
            },
        });

        expect(updated.linkingTable).toHaveLength(1);
        expect(updated.linkingTable[0]).toMatchObject({ another_test_id: anotherTest.id });

        const newKey = 'newKey';
        const newLocale = 'ZH';
        const created = await db.test.upsert({
            where: {
                key_locale: {
                    key: newKey,
                    locale: newLocale,
                },
            },
            create: {
                key: newKey,
                locale: newLocale,
                linkingTable: {
                    create: {
                        another_test_id: anotherTest.id,
                    },
                },
            },
            update: {
                linkingTable: {
                    create: {
                        another_test_id: anotherTest.id,
                    },
                },
            },
            include: {
                linkingTable: true,
            },
        });
        expect(created).toMatchObject({ key: newKey, locale: newLocale });
        expect(created.linkingTable).toHaveLength(1);
        expect(created.linkingTable[0]).toMatchObject({ another_test_id: anotherTest.id });
    });
});
