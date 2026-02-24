import { createTestClient } from '@zenstackhq/testtools';
import { describe, it } from 'vitest';

describe('Regression for issue #2375', () => {
    it('verifies the issue', async () => {
        const db = await createTestClient(
            `
model TestRunResults {
    id    Int  @id @default(autoincrement())
    testRunStepResults TestRunStepResults[]
}

model TestRunStepResults {
    id               Int             @id @default(autoincrement())
    testRunResultId  Int
    testRunResult    TestRunResults  @relation(fields: [testRunResultId], references: [id])
    stepId           Int
    step             Steps           @relation(fields: [stepId], references: [id], onDelete: Cascade)
    sharedStepItemId Int?
    sharedStepItem   SharedStepItem? @relation(fields: [sharedStepItemId], references: [id], onDelete: SetNull)
    statusId         Int
}

model Steps {
    id    Int  @id @default(autoincrement())
    order Int  @default(0)
    testRunStepResults TestRunStepResults[]
}

model SharedStepItem {
    id    Int  @id @default(autoincrement())
    order Int
    testRunStepResults TestRunStepResults[]
}    
            `,
            { provider: 'postgresql' },
        );

        await db.testRunResults.create({
            data: {
                testRunStepResults: {
                    create: [
                        {
                            step: {
                                create: {
                                    order: 1,
                                },
                            },
                            sharedStepItem: {
                                create: {
                                    order: 1,
                                },
                            },
                            statusId: 1,
                        },
                        {
                            step: {
                                create: {
                                    order: 2,
                                },
                            },
                            sharedStepItem: {
                                create: {
                                    order: 2,
                                },
                            },
                            statusId: 1,
                        },
                    ],
                },
            },
        });

        await db.testRunStepResults.findMany({
            orderBy: [{ step: { order: 'asc' } }, { sharedStepItem: { order: 'asc' } }],
        });
    });
});
