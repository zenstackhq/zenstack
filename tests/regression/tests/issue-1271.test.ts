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
            `
        );

        const db = enhance();

        const test = await db.test.create({
            data: {
                key: 'test1',
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

        const test2 = await db.test.upsert({
            where: {
                key_locale: {
                    key: 'test2',
                    locale: 'locale2',
                },
            },
            create: {
                key: 'test2',
                locale: 'locale2',
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
        expect(test2).toMatchObject({ key: 'test2', locale: 'locale2' });
        expect(test2.linkingTable).toHaveLength(1);
        expect(test2.linkingTable[0]).toMatchObject({ another_test_id: anotherTest.id });

        const linkingTable = test2.linkingTable[0];

        // connectOrCreate: connect case
        const test3 = await db.test.create({
            data: {
                key: 'test3',
                locale: 'locale3',
            },
        });
        console.log('test3 created:', test3);
        const updated2 = await db.linkingTable.update({
            where: {
                test_id_another_test_id: {
                    test_id: linkingTable.test_id,
                    another_test_id: linkingTable.another_test_id,
                },
            },
            data: {
                test: {
                    connectOrCreate: {
                        where: {
                            key_locale: {
                                key: test3.key,
                                locale: test3.locale,
                            },
                        },
                        create: {
                            key: 'test4',
                            locale: 'locale4',
                        },
                    },
                },
                another_test: { connect: { id: anotherTest.id } },
            },
            include: { test: true },
        });
        expect(updated2).toMatchObject({
            test: expect.objectContaining({ key: 'test3', locale: 'locale3' }),
            another_test_id: anotherTest.id,
        });

        // connectOrCreate: create case
        const updated3 = await db.linkingTable.update({
            where: {
                test_id_another_test_id: {
                    test_id: updated2.test_id,
                    another_test_id: updated2.another_test_id,
                },
            },
            data: {
                test: {
                    connectOrCreate: {
                        where: {
                            key_locale: {
                                key: 'test4',
                                locale: 'locale4',
                            },
                        },
                        create: {
                            key: 'test4',
                            locale: 'locale4',
                        },
                    },
                },
                another_test: { connect: { id: anotherTest.id } },
            },
            include: { test: true },
        });
        expect(updated3).toMatchObject({
            test: expect.objectContaining({ key: 'test4', locale: 'locale4' }),
            another_test_id: anotherTest.id,
        });
    });
});
