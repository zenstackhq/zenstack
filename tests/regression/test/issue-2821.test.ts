import { createTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

// https://github.com/zenstackhq/zenstack/issues/2821
describe('Regression for issue #2821', () => {
    it('supported enum array', async () => {
        const schema = `
enum OkStatus {
  OK @map("ok")
  NO @map("no")

  @@map("ok_status")
}

model Post {
  id     Int      @id
  status OkStatus
}
`;

        const db = await createTestClient(schema, { usePrismaPush: true, provider: 'postgresql', debug: true });

        await db.post.create({ data: { id: 1, status: 'NO' } });
        await db.post.create({ data: { id: 2, status: 'OK' } });
        await db.post.create({ data: { id: 3, status: 'NO' } });
        await db.post.create({ data: { id: 4, status: 'OK' } });

        const ascVariant1 = await db.$qb.selectFrom('Post').select('status').orderBy('status', 'asc').execute();
        const ascVariant2 = await db.$qb.selectFrom('Post').select('status').orderBy('Post.status', 'asc').execute();
        const ascVariant3 = await db.$qb
            .selectFrom('Post')
            .select('status as otherName')
            .orderBy('status', 'asc')
            .execute();

        expect(ascVariant1).toEqual([{ status: 'OK' }, { status: 'OK' }, { status: 'NO' }, { status: 'NO' }]);
        expect(ascVariant2).toEqual([{ status: 'OK' }, { status: 'OK' }, { status: 'NO' }, { status: 'NO' }]);
        expect(ascVariant3).toEqual([
            { otherName: 'OK' },
            { otherName: 'OK' },
            { otherName: 'NO' },
            { otherName: 'NO' },
        ]);

        const descVariant1 = await db.$qb.selectFrom('Post').select('status').orderBy('status', 'desc').execute();
        const descVariant2 = await db.$qb.selectFrom('Post').select('status').orderBy('Post.status', 'desc').execute();
        const descVariant3 = await db.$qb
            .selectFrom('Post')
            .select('status as otherName')
            .orderBy('status', 'desc')
            .execute();

        expect(descVariant1).toEqual([{ status: 'NO' }, { status: 'NO' }, { status: 'OK' }, { status: 'OK' }]);
        expect(descVariant2).toEqual([{ status: 'NO' }, { status: 'NO' }, { status: 'OK' }, { status: 'OK' }]);
        expect(descVariant3).toEqual([
            { otherName: 'NO' },
            { otherName: 'NO' },
            { otherName: 'OK' },
            { otherName: 'OK' },
        ]);
    });
});
