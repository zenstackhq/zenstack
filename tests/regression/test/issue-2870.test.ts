import { createPolicyTestClient, createTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

// https://github.com/zenstackhq/zenstack/issues/2870
describe('Regression for issue #2870', () => {
    const schema = `
model Item {
  id            String @id @default(cuid())
  itemKind      String
  rank          Int    @default(0)
  notesAsSource Note[] @relation("NoteSource")
  pinnedTaskId  String?
  pinnedTask    Task?  @relation("Pinned", fields: [pinnedTaskId], references: [id])
  tags          Tag[]  @relation("ItemTags")

  @@delegate(itemKind)
}

model Task extends Item {
  pinnedBy Item[] @relation("Pinned")
}

model Tag extends Item {
  taggedItems Item[] @relation("ItemTags")
}

model Note extends Item {
  sourceId String?
  source   Item?   @relation("NoteSource", fields: [sourceId], references: [id])
  comments Comment[]
}

model Comment {
  id     String  @id @default(cuid())
  noteId String?
  note   Note?   @relation(fields: [noteId], references: [id])
}
`;

    // explicit ids so that ordering by id differs from ordering by relation count
    async function setup() {
        const db = await createTestClient(schema, { usePrismaPush: true });
        const task = await db.task.create({ data: { id: 'z-task' } });
        const note = await db.note.create({ data: { id: 'a-note', sourceId: task.id, pinnedTaskId: task.id } });
        const tag = await db.tag.create({ data: { id: 'm-tag', taggedItems: { connect: { id: note.id } } } });
        return { db, task, note, tag };
    }

    const ids = (rows: { id: string }[]) => rows.map((r) => r.id).sort();

    it('filters a base model by a to-many relation into its own hierarchy', async () => {
        const { db, task, note, tag } = await setup();

        expect(ids(await db.item.findMany({ where: { notesAsSource: { some: {} } } }))).toEqual([task.id]);
        expect(ids(await db.item.findMany({ where: { notesAsSource: { none: {} } } }))).toEqual(
            [note.id, tag.id].sort(),
        );
        expect(ids(await db.item.findMany({ where: { notesAsSource: { every: { id: { not: note.id } } } } }))).toEqual(
            [note.id, tag.id].sort(),
        );
        await expect(db.item.count({ where: { notesAsSource: { some: {} } } })).resolves.toBe(1);
        expect(ids(await db.item.findMany({ where: { tags: { some: {} } } }))).toEqual([note.id]);
    });

    it('filters by a to-one relation into the same hierarchy', async () => {
        const { db, note } = await setup();

        expect(ids(await db.item.findMany({ where: { pinnedTask: { is: {} } } }))).toEqual([note.id]);
        expect(ids(await db.note.findMany({ where: { pinnedTask: { is: {} } } }))).toEqual([note.id]);
        expect(ids(await db.note.findMany({ where: { source: { is: { itemKind: 'Task' } } } }))).toEqual([note.id]);
    });

    it('counts a base model relation into its own hierarchy', async () => {
        const { db, task, note } = await setup();

        await expect(
            db.item.findUnique({ where: { id: task.id }, include: { _count: { select: { notesAsSource: true } } } }),
        ).resolves.toMatchObject({ _count: { notesAsSource: 1 } });
        await expect(
            db.item.findUnique({
                where: { id: task.id },
                select: { _count: { select: { notesAsSource: { where: { id: note.id } } } } },
            }),
        ).resolves.toEqual({ _count: { notesAsSource: 1 } });
        await expect(
            db.item.findUnique({ where: { id: note.id }, include: { _count: { select: { tags: true } } } }),
        ).resolves.toMatchObject({ _count: { tags: 1 } });
        await expect(
            db.item.findFirst({ orderBy: [{ notesAsSource: { _count: 'desc' } }, { id: 'asc' }] }),
        ).resolves.toMatchObject({ id: task.id });
    });

    it('orders by an inherited field of a to-one relation', async () => {
        const db = await createTestClient(schema, { usePrismaPush: true });
        const highTask = await db.task.create({ data: { rank: 2 } });
        const lowTask = await db.task.create({ data: { rank: 1 } });
        // each note's own rank is the opposite of its pinned task's rank
        const first = await db.note.create({ data: { rank: 2, pinnedTaskId: lowTask.id } });
        const second = await db.note.create({ data: { rank: 1, pinnedTaskId: highTask.id } });

        // outer model in the same hierarchy as the related model's base
        await expect(db.note.findMany({ orderBy: { pinnedTask: { rank: 'asc' } } })).resolves.toEqual([
            expect.objectContaining({ id: first.id }),
            expect.objectContaining({ id: second.id }),
        ]);

        // outer model outside the hierarchy
        const c1 = await db.comment.create({ data: { noteId: second.id } });
        const c2 = await db.comment.create({ data: { noteId: first.id } });
        await expect(db.comment.findMany({ orderBy: { note: { rank: 'desc' } } })).resolves.toEqual([
            expect.objectContaining({ id: c2.id }),
            expect.objectContaining({ id: c1.id }),
        ]);
    });

    it('includes relations into the same hierarchy', async () => {
        const { db, task, note, tag } = await setup();

        const taskWithNotes = await db.item.findUnique({ where: { id: task.id }, include: { notesAsSource: true } });
        expect(ids(taskWithNotes!.notesAsSource)).toEqual([note.id]);

        await expect(db.note.findUnique({ where: { id: note.id }, include: { source: true } })).resolves.toMatchObject({
            source: { id: task.id },
        });
        await expect(
            db.item.findUnique({ where: { id: note.id }, include: { pinnedTask: true } }),
        ).resolves.toMatchObject({ pinnedTask: { id: task.id } });

        const noteWithTags = await db.item.findUnique({ where: { id: note.id }, include: { tags: true } });
        expect(ids(noteWithTags!.tags)).toEqual([tag.id]);
    });

    it('gives the same result through the sub model', async () => {
        const { db, task } = await setup();

        expect(ids(await db.task.findMany({ where: { notesAsSource: { some: {} } } }))).toEqual([task.id]);
        expect(ids(await db.task.findMany({ where: { pinnedBy: { some: {} } } }))).toEqual([task.id]);
        await expect(
            db.task.findFirst({ include: { _count: { select: { notesAsSource: true } } } }),
        ).resolves.toMatchObject({ _count: { notesAsSource: 1 } });
    });

    it('includes relations into the same hierarchy with access policies', async () => {
        const db = await createPolicyTestClient(`
model Item {
  id            String @id @default(cuid())
  itemKind      String
  notesAsSource Note[] @relation("NoteSource")

  @@delegate(itemKind)
  @@allow('create', true)
  @@allow('read', notesAsSource?[true] || itemKind == 'Note')
}

model Task extends Item {}

model Note extends Item {
  sourceId String?
  source   Item?   @relation("NoteSource", fields: [sourceId], references: [id])
}
`);
        const raw = db.$unuseAll();
        const task = await raw.task.create({ data: {} });
        const hidden = await raw.task.create({ data: {} });
        const note = await raw.note.create({ data: { sourceId: task.id } });

        expect(ids(await db.item.findMany())).toEqual([task.id, note.id].sort());
        await expect(db.task.findUnique({ where: { id: hidden.id } })).resolves.toBeNull();
        await expect(db.note.findFirst({ include: { source: true } })).resolves.toMatchObject({
            source: { id: task.id },
        });
        const taskWithNotes = await db.item.findUnique({ where: { id: task.id }, include: { notesAsSource: true } });
        expect(ids(taskWithNotes!.notesAsSource)).toEqual([note.id]);
    });
});
