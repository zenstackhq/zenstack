import { createPolicyTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

describe('Regression for issue #2385', () => {
    it('should not generate "missing FROM-clause entry" when including a relation with a static-value @@allow policy', async () => {
        const db = await createPolicyTestClient(
            `
model User {
    id           String        @id @default(uuid())
    name         String
    associations Association[]
    createdAt    DateTime      @default(now())
    updatedAt    DateTime      @updatedAt

    @@allow("read", auth().id == id)
}

model Association {
    id        String   @id @default(uuid())
    name      String
    userId    String   @db.VarChar @map("user_id")
    user      User     @relation(fields: [userId], references: [id])
    createdAt DateTime @default(now()) @allow("read", auth().id == userId)
    updatedAt DateTime @updatedAt

    @@allow("read", auth().id == userId)
}
            `,
        );

        const rawDb = db.$unuseAll();
        const user = await rawDb.user.create({
            data: {
                name: 'John Doe',
            },
        });

        await rawDb.association.create({
            data: {
                name: 'Association for John',
                userId: user.id,
            },
        });

        const userDb = db.$setAuth(user);

        await expect(
            userDb.user.findMany({
                include: { associations: true },
            }),
        ).toResolveTruthy();
    });
});
