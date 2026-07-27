import { createTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

const schema = `
model Location {
    id        String     @id @default(cuid())
    name      String
    resources Resource[]
}

enum ResourceType {
    DESK
}

model Resource {
    id         String       @id @default(cuid())
    name       String
    type       ResourceType
    locationId String
    location   Location     @relation(fields: [locationId], references: [id], onDelete: Cascade)

    @@delegate(type)
}

model ResourceDesk extends Resource {
    employeeDeskSessions EmployeeDeskSession[]

    @@delegateMap(DESK)
}

model EmployeeDeskSession {
    id     String       @id @default(cuid())
    deskId String
    desk   ResourceDesk @relation(fields: [deskId], references: [id], onDelete: Cascade)
}
`;

describe('Regression for issue 2768', () => {
    async function createData() {
        const db = await createTestClient(schema);

        const l1 = await db.location.create({ data: { id: 'l1', name: 'l1' } });
        const l2 = await db.location.create({ data: { id: 'l2', name: 'l2' } });

        const desk1 = await db.resourceDesk.create({ data: { name: 'desk1', locationId: l1.id } });
        const desk2 = await db.resourceDesk.create({ data: { name: 'desk2', locationId: l2.id } });

        await db.employeeDeskSession.create({ data: { id: 's1', deskId: desk1.id } });
        await db.employeeDeskSession.create({ data: { id: 's2', deskId: desk2.id } });

        return db;
    }

    it('filters a to-one relation by a base-model foreign key field', async () => {
        const db = await createData();
        await expect(db.employeeDeskSession.findMany({ where: { desk: { locationId: 'l1' } } })).resolves.toEqual([
            expect.objectContaining({ id: 's1' }),
        ]);
    });

    it('filters a to-one relation by a base-model scalar field', async () => {
        const db = await createData();
        await expect(
            db.employeeDeskSession.findMany({ where: { desk: { name: { startsWith: 'desk1' } } } }),
        ).resolves.toEqual([expect.objectContaining({ id: 's1' })]);
    });

    it('filters a to-one relation by a base-model relation', async () => {
        const db = await createData();
        await expect(
            db.employeeDeskSession.findMany({ where: { desk: { location: { name: 'l2' } } } }),
        ).resolves.toEqual([expect.objectContaining({ id: 's2' })]);
    });

    it('filters a to-many relation by a field inherited from the delegate base', async () => {
        const db = await createTestClient(schema);

        const l1 = await db.location.create({ data: { name: 'l1' } });
        const l2 = await db.location.create({ data: { name: 'l2' } });

        const desk1 = await db.resourceDesk.create({ data: { name: 'desk1', locationId: l1.id } });
        await db.resourceDesk.create({ data: { name: 'desk2', locationId: l2.id } });

        await db.employeeDeskSession.create({ data: { id: 's1', deskId: desk1.id } });

        await expect(
            db.location.findMany({ where: { resources: { some: { name: 'desk1' } } } }),
        ).resolves.toEqual([expect.objectContaining({ id: l1.id })]);

        await expect(
            db.location.findMany({ where: { resources: { none: { name: 'desk1' } } } }),
        ).resolves.toEqual([expect.objectContaining({ id: l2.id })]);
    });
});
