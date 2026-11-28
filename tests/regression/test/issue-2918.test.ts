import { createTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

// https://github.com/zenstackhq/zenstack/issues/2918
describe('Regression for issue 2918', () => {
    const schema = `
model Item {
    id   Int      @id @default(autoincrement())
    flag Boolean?
}
    `;

    it('stores null in an optional Boolean field instead of false', async () => {
        const db = await createTestClient(schema);

        const item = await db.item.create({ data: { flag: true } });
        await expect(db.item.update({ where: { id: item.id }, data: { flag: null } })).resolves.toMatchObject({
            flag: null,
        });
        await expect(db.item.create({ data: { flag: null } })).resolves.toMatchObject({ flag: null });
        await db.item.createMany({ data: [{ flag: null }] });
        await db.item.create({ data: { flag: true } });
        await db.item.updateMany({ where: { flag: true }, data: { flag: null } });

        // the column itself is NULL, not 0
        await expect(db.item.count({ where: { flag: null } })).resolves.toBe(4);
        await expect(db.item.count({ where: { flag: false } })).resolves.toBe(0);
    });

    it('matches null rows with an equals: null filter', async () => {
        const db = await createTestClient(schema);

        await db.item.createMany({ data: [{ flag: true }, { flag: false }] });
        // omitting the field leaves the column NULL
        const empty = await db.item.create({ data: {} });

        await expect(db.item.findMany({ where: { flag: { equals: null } } })).resolves.toEqual([
            { id: empty.id, flag: null },
        ]);
        await expect(db.item.count({ where: { flag: { not: { equals: null } } } })).resolves.toBe(2);
    });
});
