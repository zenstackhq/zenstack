import { createTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

// https://github.com/zenstackhq/zenstack/issues/2755
describe('Regression for issue 2755', () => {
    it.each(['sqlite', 'postgresql'] as const)(
        'supports filtering by enum fields in typed JSON (%s)',
        async (provider) => {
            const schema = `
enum BKPType {
    CAPSTONE
    OTHER
}

type BKPProposal {
    name    String
    bkpType BKPType?
}

model BKP {
    id       String      @id @default(cuid())
    proposal BKPProposal @json
}
`;

            const db = await createTestClient(schema, { provider });

            await db.bKP.create({
                data: { id: '1', proposal: { name: 'p1', bkpType: 'CAPSTONE' } },
            });
            await db.bKP.create({
                data: { id: '2', proposal: { name: 'p2', bkpType: 'OTHER' } },
            });
            await db.bKP.create({
                data: { id: '3', proposal: { name: 'p3' } },
            });

            await expect(
                db.bKP.findMany({
                    where: { proposal: { bkpType: 'CAPSTONE' } },
                }),
            ).resolves.toEqual([expect.objectContaining({ id: '1' })]);

            await expect(
                db.bKP.findMany({
                    where: { proposal: { bkpType: { not: 'CAPSTONE' } } },
                }),
            ).resolves.toEqual([expect.objectContaining({ id: '2' })]);

            await expect(
                db.bKP.findMany({
                    where: { proposal: { bkpType: { in: ['CAPSTONE', 'OTHER'] } } },
                }),
            ).resolves.toEqual([expect.objectContaining({ id: '1' }), expect.objectContaining({ id: '2' })]);
        },
    );
});
