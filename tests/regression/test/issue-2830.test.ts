import { createTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

// https://github.com/zenstackhq/zenstack/issues/2830
describe('Regression for issue #2830', () => {
    const schema = `
model Parent {
    id       Int     @id @default(autoincrement())
    name     String
    children Child[]
}

model Child {
    id            Int          @id @default(autoincrement())
    position      Int
    parent        Parent       @relation(fields: [parentId], references: [id])
    parentId      Int
    grandchildren Grandchild[]
}

model Grandchild {
    id      Int   @id @default(autoincrement())
    name    String
    child   Child @relation(fields: [childId], references: [id])
    childId Int
}
`;

    async function seed(db: any) {
        await db.parent.create({
            data: {
                name: 'p1',
                children: {
                    create: [
                        { position: 2, grandchildren: { create: [{ name: 'g2' }] } },
                        { position: 1, grandchildren: { create: [{ name: 'g1a' }, { name: 'g1b' }] } },
                    ],
                },
            },
        });
    }

    it('keeps nested includes working when the PK is omitted on an ordered relation', async () => {
        const db = await createTestClient(schema);
        await seed(db);

        const result = await db.parent.findMany({
            include: {
                children: {
                    omit: { id: true },
                    orderBy: { position: 'asc' },
                    include: { grandchildren: true },
                },
            },
        });

        expect(result).toHaveLength(1);
        const children = result[0]!.children;
        expect(children.map((c: any) => c.position)).toEqual([1, 2]);
        expect(children[0]).not.toHaveProperty('id');
        expect(children[0]!.grandchildren.map((g: any) => g.name).sort()).toEqual(['g1a', 'g1b']);
        expect(children[1]!.grandchildren.map((g: any) => g.name)).toEqual(['g2']);
        // grandchildren are not affected by the parent-level omit
        expect(children[0]!.grandchildren[0]).toHaveProperty('id');
    });

    it('keeps nested includes working when the FK is omitted on a paginated relation', async () => {
        const db = await createTestClient(schema);
        await seed(db);

        const result = await db.parent.findMany({
            include: {
                children: {
                    omit: { id: true, parentId: true },
                    orderBy: { position: 'desc' },
                    take: 1,
                    include: { grandchildren: { omit: { childId: true } } },
                },
            },
        });

        expect(result[0]!.children).toHaveLength(1);
        expect(result[0]!.children[0]!.position).toBe(2);
        expect(result[0]!.children[0]).not.toHaveProperty('id');
        expect(result[0]!.children[0]).not.toHaveProperty('parentId');
        expect(result[0]!.children[0]!.grandchildren).toEqual([expect.objectContaining({ name: 'g2' })]);
        expect(result[0]!.children[0]!.grandchildren[0]).not.toHaveProperty('childId');
    });

    it('respects schema-level @omit on an ordered relation with nested include', async () => {
        const db = await createTestClient(schema.replace('position      Int', 'position      Int @omit'));
        await seed(db);

        const result = await db.parent.findMany({
            include: {
                children: {
                    orderBy: { position: 'asc' },
                    include: { grandchildren: true },
                },
            },
        });
        const children = result[0]!.children;
        expect(children).toHaveLength(2);
        expect(children[0]).not.toHaveProperty('position');
        expect(children[0]!.grandchildren).toHaveLength(2);
        expect(children[1]!.grandchildren).toHaveLength(1);
    });
});
