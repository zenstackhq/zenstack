import { createPolicyTestClient } from '@zenstackhq/testtools';
import { v4 as uuid } from 'uuid';
import { describe, expect, it } from 'vitest';

describe('Regression for issue #2394', () => {
    const UUID_SCHEMA = `
model Foo {
    id String @id @db.Uuid @default(dbgenerated("gen_random_uuid()"))
    x String

    @@allow('all', id == x)
}
`;

    it('works with policies', async () => {
        const db = await createPolicyTestClient(UUID_SCHEMA, {
            provider: 'postgresql',
            usePrismaPush: true,
        });

        await db.$unuseAll().foo.create({ data: { x: uuid() } });
        await expect(db.foo.findMany()).toResolveTruthy();
    });
});
