import { createPolicyTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

// https://github.com/zenstackhq/zenstack/issues/2351
describe('Regression for issue 2351', () => {
    it('should correctly query delegate model that inherits from a model using a mixin abstract type', async () => {
        const db = await createPolicyTestClient(
            `
type BaseEntity {
    id        String   @id @default(cuid())
    createdOn DateTime @default(now())
    updatedOn DateTime @updatedAt
    isDeleted Boolean  @default(false)
    isArchived Boolean @default(false)
}

enum DataType {
    DataText
    DataNumber
}

model RoutineData with BaseEntity {
    dataType DataType
    routineId String
    Routine   Routine  @relation(fields: [routineId], references: [id])    
    @@delegate(dataType)
    @@allow('all', auth().id == Routine.userId)
}

model Routine {
    id     String        @id @default(cuid())
    userId String
    User   User          @relation(fields: [userId], references: [id])
    data   RoutineData[]
    @@allow('all', true)
}

model User {
    id      String     @id @default(cuid())
    name    String
    routines Routine[]
    @@allow('all', true)
}

model DataText extends RoutineData {
    textValue String
}
            `,
            { usePrismaPush: true },
        );

        const user = await db.user.create({
            data: {
                name: 'Test User',
            },
        });

        const routine = await db.routine.create({
            data: {
                userId: user.id,
            },
        });

        const authDb = db.$setAuth({ id: user.id });
        const created = await authDb.dataText.create({
            data: { textValue: 'hello', routineId: routine.id },
        });
        expect(created.textValue).toBe('hello');
        expect(created.isDeleted).toBe(false);
        expect(created.isArchived).toBe(false);

        const found = await authDb.dataText.findUnique({
            where: { id: created.id },
        });
        expect(found).not.toBeNull();
        expect(found!.textValue).toBe('hello');
        expect(found!.createdOn).toBeDefined();
    });
});
