import { createPolicyTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

describe('Regression for issue 2888', () => {
    it('a computed field referenced in @@allow does not throw "no such column" and evaluates its expression', async () => {
        const db = await createPolicyTestClient(
            `
model Model {
    id Int @id @default(autoincrement())
    x Int
    canEdit Boolean @computed

    @@allow('create,read', true)
    @@allow('update', canEdit)
}
            `,
            {
                provider: 'mysql',
                usePrismaPush: true,
                computedFields: {
                    model: {
                        canEdit: (eb: any) => eb.lit(true),
                    },
                },
            } as any,
        );

        await db.model.create({ data: { id: 1, x: 1 } });

        await expect(db.model.update({ where: { id: 1 }, data: { x: 2 } })).resolves.toMatchObject({
            x: 2,
        });
    });
});
