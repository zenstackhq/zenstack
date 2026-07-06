import { PolicyPlugin } from '@zenstackhq/plugin-policy';
import { createTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

describe('PolicyPlugin detection', () => {
    it('uses plugin id when constructor names are bundled or minified', async () => {
        const MinifiedPolicyPlugin = class a extends PolicyPlugin {};
        const plugin = new MinifiedPolicyPlugin();

        expect(plugin.id).toBe('policy');
        expect(plugin.constructor.name).toBe('a');

        const db = await createTestClient(
            `
model User {
    id String @id
    name String

    @@allow('all', true)
}
            `,
            { plugins: [plugin] },
        );

        await db.user.create({ data: { id: 'u1', name: 'User 1' } });

        await expect(db.user.delete({ where: { id: 'u1' } })).resolves.toEqual({ id: 'u1', name: 'User 1' });
    });
});
