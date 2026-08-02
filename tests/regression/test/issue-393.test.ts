import { createTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

describe('Regression for issue #393', () => {
    it('verifies issue 393', async () => {
        const db = await createTestClient(
            `
model users {
  id String @id() @default(cuid())
  tz Int @default(-6) @db.SmallInt()
}`, {
    provider: 'postgresql',
},
        );
        await expect(db.users.create({ data: {} })).resolves.toMatchObject({ tz: -6 });
    });
});
