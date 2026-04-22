import { createPolicyTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

// https://github.com/zenstackhq/zenstack/issues/2595
describe('Regression for issue #2595', () => {
    const schema = `
model Transaction {
    id      String @id @default(cuid())
    variant String
    status  String @default("Draft")

    @@delegate(variant)
    @@allow('all', true)
    @@deny('post-update', before().status == 'Finalized' && status == 'Draft')
}

model Invoice extends Transaction {
    invoiceNumber String?
}
`;

    it('update on delegate sub-model with before() policy on base field does not error', async () => {
        const db = await createPolicyTestClient(schema);

        const invoice = await db.invoice.create({ data: {} });

        // Should succeed: status is Draft, so the post-update deny rule doesn't fire
        const updated = await db.invoice.update({
            where: { id: invoice.id },
            data: { invoiceNumber: 'INV-001' },
        });

        expect(updated.invoiceNumber).toBe('INV-001');
    });

    it('update is denied when before().status is Finalized', async () => {
        const db = await createPolicyTestClient(schema);

        const invoice = await db.invoice.create({ data: { status: 'Finalized' } });

        // Should be denied: before().status == 'Finalized' && status == 'Draft' would
        // become true if update changes status back to Draft
        await expect(
            db.invoice.update({
                where: { id: invoice.id },
                data: { status: 'Draft' },
            }),
        ).toBeRejectedByPolicy();
    });
});
