import { createTestClient, generateTsSchema } from '@zenstackhq/testtools';
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
        // ZModel only accepts list fields for PostgreSQL, so generate the schema for PostgreSQL and run it
        // against the configured test provider to also cover the other dialects' JSON array comparison
        const { schema: schemaDef } = await generateTsSchema(schema, 'postgresql');
        const db: any = await createTestClient(schemaDef);

        await db.example.create({ data: { id: 1, entries: [{ label: 'x' }] } });
        await db.example.create({ data: { id: 2, entries: [{ label: 'y' }, { label: 'x' }] } });
        await db.example.create({ data: { id: 3, entries: [] } });
        await db.example.create({ data: { id: 4, entries: [{ label: 'x' }, { label: 'y' }] } });
        await db.example.create({ data: { id: 5, entries: [{ label: 'x' }, { label: 'x' }] } });

        await expect(db.example.findMany({ where: { entries: { equals: [{ label: 'x' }] } } })).resolves.toEqual([
            { id: 1, entries: [{ label: 'x' }] },
        ]);
        await expect(
            db.example.findMany({ where: { entries: { equals: [{ label: 'y' }, { label: 'x' }] } } }),
        ).resolves.toEqual([{ id: 2, entries: [{ label: 'y' }, { label: 'x' }] }]);
        await expect(db.example.findMany({ where: { entries: { equals: [] } } })).resolves.toEqual([
            { id: 3, entries: [] },
        ]);
        await expect(
            db.example.findMany({ where: { entries: { equals: [{ label: 'x' }, { label: 'y' }] } } }),
        ).resolves.toEqual([{ id: 4, entries: [{ label: 'x' }, { label: 'y' }] }]);
        await expect(
            db.example.findMany({ where: { entries: { equals: [{ label: 'x' }, { label: 'x' }] } } }),
        ).resolves.toEqual([{ id: 5, entries: [{ label: 'x' }, { label: 'x' }] }]);
        await expect(db.example.findMany({ where: { entries: { equals: [{ label: 'z' }] } } })).resolves.toEqual([]);
    });
});
