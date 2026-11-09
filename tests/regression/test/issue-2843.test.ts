import { createTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

describe('Regression for issue #2843', () => {
    const schema = `
    type Entry {
        label String
    }

    model Example {
        id Int @id
        entries Entry[] @json
    }
    `;

    it('filters a typed JSON array field with equals', async () => {
        const db = await createTestClient(schema, { provider: 'postgresql' });

        await db.example.create({ data: { id: 1, entries: [{ label: 'x' }] } });
        await db.example.create({ data: { id: 2, entries: [{ label: 'y' }, { label: 'x' }] } });
        await db.example.create({ data: { id: 3, entries: [] } });

        await expect(db.example.findMany({ where: { entries: { equals: [{ label: 'x' }] } } })).resolves.toEqual([
            { id: 1, entries: [{ label: 'x' }] },
        ]);
        await expect(
            db.example.findMany({ where: { entries: { equals: [{ label: 'y' }, { label: 'x' }] } } }),
        ).resolves.toEqual([{ id: 2, entries: [{ label: 'y' }, { label: 'x' }] }]);
        await expect(db.example.findMany({ where: { entries: { equals: [] } } })).resolves.toEqual([
            { id: 3, entries: [] },
        ]);
        await expect(db.example.findMany({ where: { entries: { equals: [{ label: 'z' }] } } })).resolves.toEqual([]);
    });
});
