import { createPolicyTestClient, createTestClient } from '@zenstackhq/testtools';
import { afterEach, describe, expect, it } from 'vitest';

describe('Delegate cascade delete', () => {
    let db: any;

    afterEach(async () => {
        await db?.$disconnect();
    });

    async function itemIds() {
        const rows = await db.$qb.selectFrom('Item').select('id').execute();
        return rows.map((r: { id: string }) => r.id).sort();
    }

    describe('with a base model relation that cascades back into the hierarchy', () => {
        const schema = `
model Item {
  id            String @id @default(cuid())
  itemKind      String
  notesAsSource Note[] @relation("NoteSource")

  @@delegate(itemKind)
}

model Task extends Item {}

model Note extends Item {
  sourceId String?
  source   Item?   @relation("NoteSource", fields: [sourceId], references: [id], onDelete: Cascade)
  threadId String?
  thread   Thread? @relation(fields: [threadId], references: [id], onDelete: Cascade)
}

model Thread {
  id    String @id @default(cuid())
  notes Note[]
}
`;

        it('deletes a row with no related rows', async () => {
            db = await createTestClient(schema, { usePrismaPush: true });
            const task = await db.task.create({ data: {} });
            await db.task.delete({ where: { id: task.id } });
            expect(await itemIds()).toEqual([]);
        });

        it('cascades through the base model relation', async () => {
            db = await createTestClient(schema, { usePrismaPush: true });
            const task = await db.task.create({ data: {} });
            await db.note.create({ data: { sourceId: task.id } });
            await db.task.delete({ where: { id: task.id } });
            expect(await itemIds()).toEqual([]);
        });

        it('cascades through a chain of rows', async () => {
            db = await createTestClient(schema, { usePrismaPush: true });
            const task = await db.task.create({ data: {} });
            const parent = await db.note.create({ data: { sourceId: task.id } });
            await db.note.create({ data: { sourceId: parent.id } });
            await db.task.delete({ where: { id: task.id } });
            expect(await itemIds()).toEqual([]);
        });

        it('cascades from a non-delegate model', async () => {
            db = await createTestClient(schema, { usePrismaPush: true });
            const thread = await db.thread.create({ data: {} });
            const note = await db.note.create({ data: { threadId: thread.id } });
            await db.note.create({ data: { sourceId: note.id } });
            await db.thread.delete({ where: { id: thread.id } });
            expect(await itemIds()).toEqual([]);
        });

        it('deletes cyclic data through the sub model', async () => {
            db = await createTestClient(schema, { usePrismaPush: true });
            const first = await db.note.create({ data: {} });
            const second = await db.note.create({ data: { sourceId: first.id } });
            await db.note.update({ where: { id: first.id }, data: { sourceId: second.id } });
            await db.note.delete({ where: { id: first.id } });
            expect(await itemIds()).toEqual([]);
        });

        it('deletes cyclic data through the base model', async () => {
            db = await createTestClient(schema, { usePrismaPush: true });
            const first = await db.note.create({ data: {} });
            const second = await db.note.create({ data: { sourceId: first.id } });
            await db.note.update({ where: { id: first.id }, data: { sourceId: second.id } });
            await expect(db.item.deleteMany({ where: { id: first.id } })).resolves.toEqual({ count: 1 });
            expect(await itemIds()).toEqual([]);

            const third = await db.note.create({ data: {} });
            const fourth = await db.note.create({ data: { sourceId: third.id } });
            await db.note.update({ where: { id: third.id }, data: { sourceId: fourth.id } });
            await db.item.delete({ where: { id: third.id } });
            expect(await itemIds()).toEqual([]);
        });

        it('deletes many rows filtered by a sub model field', async () => {
            db = await createTestClient(schema, { usePrismaPush: true });
            const thread = await db.thread.create({ data: {} });
            const task = await db.task.create({ data: {} });
            const kept = await db.note.create({ data: { sourceId: task.id } });
            const deleted = await db.note.create({ data: { threadId: thread.id } });
            await db.note.create({ data: { sourceId: deleted.id } });
            await expect(db.note.deleteMany({ where: { threadId: thread.id } })).resolves.toEqual({ count: 1 });
            expect(await itemIds()).toEqual([kept.id, task.id].sort());
        });

        it('deletes rows filtered by the related rows it cascades to', async () => {
            db = await createTestClient(schema, { usePrismaPush: true });
            const task = await db.task.create({ data: {} });
            await db.note.create({ data: { sourceId: task.id } });
            const kept = await db.task.create({ data: {} });
            await expect(db.task.deleteMany({ where: { notesAsSource: { some: {} } } })).resolves.toEqual({
                count: 1,
            });
            expect(await itemIds()).toEqual([kept.id]);
        });
    });

    describe('with a sub model relation', () => {
        const schema = `
model Item {
  id       String @id @default(cuid())
  itemKind String

  @@delegate(itemKind)
}

model Task extends Item {
  comments Comment[]
}

model Comment extends Item {
  taskId String?
  task   Task?   @relation(fields: [taskId], references: [id], onDelete: Cascade)
}
`;

        it('cascades when deleting through the sub model', async () => {
            db = await createTestClient(schema, { usePrismaPush: true });
            const task = await db.task.create({ data: {} });
            await db.comment.create({ data: { taskId: task.id } });
            await db.task.delete({ where: { id: task.id } });
            expect(await itemIds()).toEqual([]);
        });

        it('cascades when deleting through the base model', async () => {
            db = await createTestClient(schema, { usePrismaPush: true });
            const task = await db.task.create({ data: {} });
            await db.comment.create({ data: { taskId: task.id } });
            await db.item.delete({ where: { id: task.id } });
            expect(await itemIds()).toEqual([]);
        });

        it('applies a limit when deleting through the base model', async () => {
            db = await createTestClient(schema, { usePrismaPush: true });
            for (let i = 0; i < 2; i++) {
                const task = await db.task.create({ data: {} });
                await db.comment.create({ data: { taskId: task.id } });
            }
            await expect(db.item.deleteMany({ where: { itemKind: 'Task' }, limit: 1 })).resolves.toEqual({
                count: 1,
            });
            const [remainingTask] = await db.task.findMany();
            const [remainingComment] = await db.comment.findMany();
            expect(remainingComment.taskId).toBe(remainingTask.id);
            expect(await db.task.count()).toBe(1);
            expect(await db.comment.count()).toBe(1);
            expect(await itemIds()).toHaveLength(2);
        });

        it('deletes more related rows than fit in one statement', async () => {
            db = await createTestClient(schema, { usePrismaPush: true });
            const task = await db.task.create({ data: {} });
            const ids = Array.from({ length: 33000 }, (_, i) => `c${String(i).padStart(5, '0')}`);
            for (let i = 0; i < ids.length; i += 1000) {
                const batch = ids.slice(i, i + 1000);
                await db.$qb
                    .insertInto('Item')
                    .values(batch.map((id) => ({ id, itemKind: 'Comment' })))
                    .execute();
                await db.$qb
                    .insertInto('Comment')
                    .values(batch.map((id) => ({ id, taskId: task.id })))
                    .execute();
            }
            await db.task.delete({ where: { id: task.id } });
            expect(await itemIds()).toEqual([]);
        }, 120_000);
    });

    describe('with a compound id', () => {
        const schema = `
model Item {
  id       String @id @default(cuid())
  itemKind String

  @@delegate(itemKind)
}

model Note extends Item {
  groupA Int
  groupB Int
  group  Group @relation(fields: [groupA, groupB], references: [a, b], onDelete: Cascade)
}

model Group {
  a     Int
  b     Int
  notes Note[]

  @@id([a, b])
}
`;

        it('deletes many rows with compound ids', async () => {
            db = await createTestClient(schema, { usePrismaPush: true });
            for (let b = 0; b < 600; b++) {
                await db.group.create({ data: { a: 1, b, notes: { create: {} } } });
            }
            await expect(db.group.deleteMany({ where: { a: 1 } })).resolves.toEqual({ count: 600 });
            expect(await itemIds()).toEqual([]);
        }, 120_000);
    });

    describe('with access policies', () => {
        const schema = `
model Item {
  id       String @id @default(cuid())
  itemKind String

  @@delegate(itemKind)
  @@allow('all', true)
}

model Note extends Item {
  threadId String?
  thread   Thread? @relation(fields: [threadId], references: [id], onDelete: Cascade)
}

model Thread {
  id     String  @id @default(cuid())
  hidden Boolean @default(false)
  notes  Note[]

  @@allow('create,delete', true)
  @@allow('read', !hidden)
}
`;

        it('deletes rows that can be deleted but not read', async () => {
            db = await createPolicyTestClient(schema, { usePrismaPush: true });
            const raw = db.$unuseAll();
            await raw.thread.create({ data: { id: 'visible', notes: { create: {} } } });
            await raw.thread.create({ data: { id: 'hidden', hidden: true, notes: { create: {} } } });
            await expect(db.thread.deleteMany({})).resolves.toEqual({ count: 2 });
            expect(await raw.thread.count()).toBe(0);
            expect(await itemIds()).toEqual([]);
        });
    });
});
