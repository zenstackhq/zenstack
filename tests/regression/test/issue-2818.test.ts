import { createTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

// https://github.com/zenstackhq/zenstack/issues/2818
describe('Regression for issue #2818', () => {
    it('supported enum array', async () => {
        const schema = `
enum TestTag {
  INFO @map("info")
  WARN @map("warn")

  @@map("post_tag")
}

model Test {
  id   Int       @id
  tag  TestTag?
  tags TestTag[]

  @@map("test")
}
`;

        const db = await createTestClient(schema, { usePrismaPush: true, provider: 'postgresql', debug: true });

        await db.test.create({ data: { id: 0 } });
        await db.test.create({ data: { id: 1, tag: 'INFO' } });
        await db.test.create({ data: { id: 2, tags: [] } });
        await db.test.create({ data: { id: 3, tags: ['INFO'] } });
        await db.test.create({ data: { id: 4, tags: ['INFO', 'WARN'] } });

        await expect(db.test.findMany({ orderBy: { id: 'asc' } })).resolves.toEqual([
            { id: 0, tag: null, tags: [] },
            { id: 1, tag: 'INFO', tags: [] },
            { id: 2, tag: null, tags: [] },
            { id: 3, tag: null, tags: ['INFO'] },
            { id: 4, tag: null, tags: ['INFO', 'WARN'] },
        ]);

        await db.$qb.updateTable('test').set({ tag: 'WARN' }).where('id', '=', 2).executeTakeFirst();
        await db.$qb
            .updateTable('test')
            .set({ tags: ['INFO', 'WARN'] })
            .where('id', '=', 2)
            .executeTakeFirst();
        await db.$qb.updateTable('test').set({ tags: [] }).where('id', '=', 4).executeTakeFirst();

        await expect(db.test.findMany({ orderBy: { id: 'asc' } })).resolves.toEqual([
            { id: 0, tag: null, tags: [] },
            { id: 1, tag: 'INFO', tags: [] },
            { id: 2, tag: 'WARN', tags: ['INFO', 'WARN'] },
            { id: 3, tag: null, tags: ['INFO'] },
            { id: 4, tag: null, tags: [] },
        ]);
    });
});
