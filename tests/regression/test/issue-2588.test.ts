import { createTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

// https://github.com/zenstackhq/zenstack/issues/2588
describe('Regression for issue 2588', () => {
    const schema = `
model Asset {
    id        String   @id @default(uuid())
    createdAt DateTime @default(now())
    assetType String
    @@delegate(assetType)
}

model Notification extends Asset {
    title String
}
`;

    async function setup() {
        const db = await createTestClient(schema);
        const a = await db.notification.create({
            data: { title: 'A', createdAt: new Date('2025-01-01T00:00:00Z') },
        });
        const b = await db.notification.create({
            data: { title: 'B', createdAt: new Date('2025-01-02T00:00:00Z') },
        });
        const c = await db.notification.create({
            data: { title: 'C', createdAt: new Date('2025-01-03T00:00:00Z') },
        });
        return { db, a, b, c };
    }

    it('cursor + orderBy on delegate parent field does not error', async () => {
        const { db, b } = await setup();

        const result = await db.notification.findMany({
            cursor: { id: b.id },
            orderBy: { createdAt: 'asc' },
        });

        expect(result.map((n: any) => n.title)).toEqual(['B', 'C']);
    });

    it('cursor + skip + orderBy on delegate parent field works', async () => {
        const { db, a } = await setup();

        const result = await db.notification.findMany({
            cursor: { id: a.id },
            skip: 1,
            orderBy: { createdAt: 'asc' },
            take: 25,
        });

        expect(result.map((n: any) => n.title)).toEqual(['B', 'C']);
    });

    it('cursor + multiple orderBy mixing child and delegate fields', async () => {
        const { db, a } = await setup();

        const result = await db.notification.findMany({
            cursor: { id: a.id },
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        });

        expect(result.map((n: any) => n.title)).toEqual(['A', 'B', 'C']);
    });

    it('cursor + orderBy on child field still works', async () => {
        const { db, b } = await setup();

        const result = await db.notification.findMany({
            cursor: { id: b.id },
            orderBy: { title: 'asc' },
        });

        expect(result.map((n: any) => n.title)).toEqual(['B', 'C']);
    });
});
