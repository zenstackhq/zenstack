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
    ${i > 0 ? `parentId Int\n    parent M${i - 1} @relation(fields: [parentId], references: [id])` : ''}
    ${i < depth ? `children M${i + 1}[]` : ''}

    @@allow('create', true)
    @@allow('read', ${i > 0 ? 'check(parent)' : 'true'})
    @@map('m${i}')
}`,
        ).join('\n');

        const db: any = await createPolicyTestClient(schema);

        const start = performance.now();
        await expect(db[`m${depth}`].findMany()).resolves.toEqual([]);
        expect(performance.now() - start).toBeLessThan(1000);
    });
});
