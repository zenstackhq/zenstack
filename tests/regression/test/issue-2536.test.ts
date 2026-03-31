import { createPolicyTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

describe('Regression for issue #2536', () => {
    it('supports currentModel and currentOperation in nested expressions', async () => {
        const db = await createPolicyTestClient(
            `
            model User {
                id String @id
                groups Group[] @relation("UserGroups")
            }

            model Group {
                id String @id
                modelName String
                modelOperation String
                users User[] @relation("UserGroups")
            }

            model Foo {
                id String @id @default(cuid())
                @@allow('all', auth().groups?[modelName == currentModel() && modelOperation == currentOperation()])
            }
            `,
        );

        const readGroup = { modelName: 'Foo', modelOperation: 'read' };

        await expect(db.$setAuth({ id: 'user1', groups: [readGroup] }).foo.create({ data: {} })).toBeRejectedByPolicy();
        await expect(
            db
                .$setAuth({ id: 'user1', groups: [{ modelName: 'FooBar', modelOperation: 'create' }, readGroup] })
                .foo.create({ data: {} }),
        ).toBeRejectedByPolicy();
        await expect(
            db
                .$setAuth({ id: 'user1', groups: [{ modelName: 'Foo', modelOperation: 'read' }, readGroup] })
                .foo.create({ data: {} }),
        ).toBeRejectedByPolicy();
        await expect(
            db
                .$setAuth({ id: 'user1', groups: [{ modelName: 'Foo', modelOperation: 'create' }, readGroup] })
                .foo.create({ data: {} }),
        ).toResolveTruthy();
    });
});
