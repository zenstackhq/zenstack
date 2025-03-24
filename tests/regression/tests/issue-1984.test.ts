import { loadModel, loadModelWithError, loadSchema } from '@zenstackhq/testtools';

describe('issue 1984', () => {
    it('regression1', async () => {
        const { enhance } = await loadSchema(
            `
            model User {
                id Int @id @default(autoincrement())
                access String

                @@allow('all', 
                    contains(auth().access, currentModel()) || 
                    contains(auth().access, currentOperation()))
            }
            `
        );

        const db1 = enhance();
        await expect(db1.user.create({ data: { access: 'foo' } })).toBeRejectedByPolicy();

        const db2 = enhance({ id: 1, access: 'aUser' });
        await expect(db2.user.create({ data: { access: 'aUser' } })).toResolveTruthy();

        const db3 = enhance({ id: 1, access: 'do-create-read' });
        await expect(db3.user.create({ data: { access: 'do-create-read' } })).toResolveTruthy();

        const db4 = enhance({ id: 1, access: 'do-read' });
        await expect(db4.user.create({ data: { access: 'do-read' } })).toBeRejectedByPolicy();
    });

    it('regression2', async () => {
        await expect(
            loadModelWithError(
                `
            model User {
                id Int @id @default(autoincrement())
                modelName String
                @@validate(contains(modelName, currentModel()))
            }
            `
            )
        ).resolves.toContain('function "currentModel" is not allowed in the current context: ValidationRule');
    });

    it('regression3', async () => {
        await expect(
            loadModelWithError(
                `
            model User {
                id Int @id @default(autoincrement())
                modelName String @contains(currentModel())
            }
            `
            )
        ).resolves.toContain('function "currentModel" is not allowed in the current context: ValidationRule');
    });
});
