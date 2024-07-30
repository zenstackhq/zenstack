import { loadSchema } from '@zenstackhq/testtools';

describe('issue 1563', () => {
    it('regression', async () => {
        const { enhance } = await loadSchema(
            `
        model ModelA {
            id String @id @default(cuid())
            ref ModelB[]
        }

        model ModelB {
            id String @id @default(cuid())
            ref ModelA? @relation(fields: [refId], references: [id])
            refId String?

            @@validate(refId != null, "refId must be set")
        }
        `,
            { enhancements: ['validation'] }
        );

        const db = enhance();

        const a = await db.modelA.create({ data: {} });
        const b = await db.modelB.create({ data: { refId: a.id } });

        await expect(db.modelB.update({ where: { id: b.id }, data: { refId: a.id } })).toResolveTruthy();
    });
});
