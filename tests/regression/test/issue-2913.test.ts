import { createPolicyTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

describe('Regression for issue 2913', () => {
    it('policies chaining check() through mapped models do not take exponential time to compile', async () => {
        // M12 -> M11 -> ... -> M0, each model readable only if its parent is
        const depth = 12;
        const schema = Array.from(
            { length: depth + 1 },
            (_, i) => `
model M${i} {
    id Int @id
    ${i > 0 ? `parentId Int @map('parent_id')\n    parent M${i - 1} @relation(fields: [parentId], references: [id])` : `visible Boolean @map('is_visible')`}
    ${i < depth ? `children M${i + 1}[]` : ''}

    @@allow('create', true)
    @@allow('read', ${i > 0 ? 'check(parent)' : 'visible'})
    @@map('m${i}')
}`,
        ).join('\n');

        const db: any = await createPolicyTestClient(schema);

        // two chains, only the first one has a visible root
        for (let i = 0; i <= depth; i++) {
            await db.$unuseAll()[`m${i}`].createMany({
                data: [1, 2].map((id) => (i === 0 ? { id, visible: id === 1 } : { id, parentId: id })),
            });
        }

        // warm up the connection so that the timing below is about building the query
        await expect(db.m0.findMany()).resolves.toEqual([{ id: 1, visible: true }]);

        const start = performance.now();
        const leaves = await db[`m${depth}`].findMany();
        const elapsed = performance.now() - start;

        expect(leaves).toEqual([{ id: 1, parentId: 1 }]);
        expect(elapsed).toBeLessThan(1000);
    });
});
