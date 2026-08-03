import { createTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

describe('Regression for issue #423', () => {
    it('verifies non-validation attributes for BigInt does not fail', async () => {
        const db = await createTestClient(
            `
model SampleBigInt {  
  id            BigInt       @id @map("sample_id")
  data          String
}`,
        );
        await expect(db.SampleBigInt.create({ data: { data: 'create', id: BigInt(1) } })).resolves.toMatchObject({
            id: BigInt(1),
            data: 'create',
        });
        await expect(
            db.SampleBigInt.update({ data: { data: 'update' }, where: { id: BigInt(1) } }),
        ).resolves.toMatchObject({ id: BigInt(1), data: 'update' });
    });
});
