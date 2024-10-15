import { loadModel } from '@zenstackhq/testtools';

describe('issue 1695', () => {
    it('regression', async () => {
        await loadModel(
            `
            abstract model SoftDelete {
                deleted Int @default(0) @omit
            }

            model MyModel extends SoftDelete {
                id      String @id @default(cuid())
                name    String

                @@deny('update', deleted != 0 && future().deleted != 0)
                @@deny('read', this.deleted != 0)
            }
            `
        );
    });
});
