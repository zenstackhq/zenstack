import { createPolicyTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

// https://github.com/zenstackhq/zenstack/issues/2620
describe('Regression: create delegate sub-model with policy referencing inherited field', () => {
    const schema = `
type Auth {
    id             String  @id
    organizationId String?
    @@auth
}

model Fund {
    id             String @id @default(uuid())
    organizationId String
    type           String

    @@delegate(type)
    @@allow('all', auth().organizationId == organizationId)
}

model GeneralFund extends Fund {
    balance Float @default(0)

    @@allow('all', auth().organizationId == organizationId)
}
`;

    it('should allow creating a GeneralFund when auth organizationId matches', async () => {
        const db = await createPolicyTestClient(schema);
        const orgId = 'org-1';
        const authDb = db.$setAuth({ id: 'user-1', organizationId: orgId });

        await expect(
            authDb.generalFund.create({
                data: { organizationId: orgId },
            }),
        ).resolves.toMatchObject({ organizationId: orgId });
    });

    it('should deny creating a GeneralFund when auth organizationId does not match', async () => {
        const db = await createPolicyTestClient(schema);
        const authDb = db.$setAuth({ id: 'user-1', organizationId: 'org-1' });

        await expect(
            authDb.generalFund.create({
                data: { organizationId: 'org-2' },
            }),
        ).toBeRejectedByPolicy();
    });
});
