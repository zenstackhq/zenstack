import { createPostgresDb, dropPostgresDb, loadSchema } from '@zenstackhq/testtools';

describe('Regression for issue 1129', () => {
    let dbUrl: string;

    beforeAll(async () => {
        dbUrl = await createPostgresDb('regression-issue-1229');
    });

    afterAll(async () => {
        await dropPostgresDb('regression-issue-1229');
    });

    it('regression', async () => {
        const { enhance } = await loadSchema(
            `
            model Relation1 {
              id String @id @default(cuid())
              field1 String
              concrete Concrete[]
              @@allow('all', true)
            }
            
            model Relation2 {
              id String @id @default(cuid())
              field2 String
              concrete Concrete[]
              @@allow('all', true)
            }
            
            abstract model WithRelation1 {
              relation1Id String
              relation1 Relation1 @relation(fields: [relation1Id], references: [id])
            }
            abstract model WithRelation2 {
              relation2Id String
              relation2 Relation2 @relation(fields: [relation2Id], references: [id])
            }
            
            model Concrete extends WithRelation1, WithRelation2 {
              concreteField String
              @@id([relation1Id, relation2Id])
              @@allow('all', true)
            }
            `,
            { provider: 'postgresql', dbUrl }
        );

        const db = enhance();

        await db.$transaction(async (tx: any) => {
            await tx.relation2.createMany({
                data: [
                    {
                        id: 'relation2Id1',
                        field2: 'field2Value1',
                    },
                    {
                        id: 'relation2Id2',
                        field2: 'field2Value2',
                    },
                ],
            });

            await tx.relation1.create({
                data: {
                    field1: 'field1Value',
                    concrete: {
                        createMany: {
                            data: [
                                {
                                    concreteField: 'concreteFieldValue1',
                                    relation2Id: 'relation2Id1',
                                },
                                {
                                    concreteField: 'concreteFieldValue2',
                                    relation2Id: 'relation2Id2',
                                },
                            ],
                        },
                    },
                },
            });
        });
    });
});
