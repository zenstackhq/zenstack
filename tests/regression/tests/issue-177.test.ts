import { loadModelWithError } from '@zenstackhq/testtools';

describe('issue 177', () => {
    it('regression', async () => {
        await expect(
            loadModelWithError(
                `
            model Foo {
                id String @id @default(cuid())
              
                bar   Bar     @relation(fields: [barId1, barId2], references: [id1, id2])
                barId1 String?
                barId2 String
            }
              
            model Bar {
                id1  String @default(cuid())
                id2  String @default(cuid())
                foos Foo[]

                @@id([id1, id2])
            }              
            `
            )
        ).resolves.toContain('relation "bar" is not optional, but field "barId1" is optional');
    });
});
