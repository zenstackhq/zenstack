import { loadModelWithError, loadSchema } from '@zenstackhq/testtools';

describe('currentOperation tests', () => {
    it('works with specific rules', async () => {
        const { enhance } = await loadSchema(
            `
            model User {
                id Int @id
                @@allow('read', true)
                @@allow('create', currentOperation() == 'create')
            }
            model Post {
                id Int @id
                @@allow('read', true)
                @@allow('create', currentOperation() == 'read')
            }
            `
        );

        const db = enhance();
        await expect(db.user.create({ data: { id: 1 } })).toResolveTruthy();
        await expect(db.post.create({ data: { id: 1 } })).toBeRejectedByPolicy();
    });

    it('works with all rule', async () => {
        const { enhance } = await loadSchema(
            `
            model User {
                id Int @id
                @@allow('read', true)
                @@allow('all', currentOperation() == 'create')
            }
            model Post {
                id Int @id
                @@allow('read', true)
                @@allow('create', currentOperation() == 'read')
            }
            `
        );

        const db = enhance();
        await expect(db.user.create({ data: { id: 1 } })).toResolveTruthy();
        await expect(db.post.create({ data: { id: 1 } })).toBeRejectedByPolicy();
    });

    it('works with upper case', async () => {
        const { enhance } = await loadSchema(
            `
            model User {
                id Int @id
                @@allow('read', true)
                @@allow('create', currentOperation('upper') == 'CREATE')
            }
            model Post {
                id Int @id
                @@allow('read', true)
                @@allow('create', currentOperation('upper') == 'READ')
            }
            `
        );

        const db = enhance();
        await expect(db.user.create({ data: { id: 1 } })).toResolveTruthy();
        await expect(db.post.create({ data: { id: 1 } })).toBeRejectedByPolicy();
    });

    it('works with lower case', async () => {
        const { enhance } = await loadSchema(
            `
            model User {
                id Int @id
                @@allow('read', true)
                @@allow('create', currentOperation('lower') == 'create')
            }
            model Post {
                id Int @id
                @@allow('read', true)
                @@allow('create', currentOperation('lower') == 'read')
            }
            `
        );

        const db = enhance();
        await expect(db.user.create({ data: { id: 1 } })).toResolveTruthy();
        await expect(db.post.create({ data: { id: 1 } })).toBeRejectedByPolicy();
    });

    it('works with capitalization', async () => {
        const { enhance } = await loadSchema(
            `
            model User {
                id Int @id
                @@allow('read', true)
                @@allow('create', currentOperation('capitalize') == 'Create')
            }
            model Post {
                id Int @id
                @@allow('read', true)
                @@allow('create', currentOperation('capitalize') == 'create')
            }
            `
        );

        const db = enhance();
        await expect(db.user.create({ data: { id: 1 } })).toResolveTruthy();
        await expect(db.post.create({ data: { id: 1 } })).toBeRejectedByPolicy();
    });

    it('works with uncapitalization', async () => {
        const { enhance } = await loadSchema(
            `
            model User {
                id Int @id
                @@allow('read', true)
                @@allow('create', currentOperation('capitalize') == 'create')
            }
            model Post {
                id Int @id
                @@allow('read', true)
                @@allow('create', currentOperation('capitalize') == 'read')
            }
            `
        );

        const db = enhance();
        await expect(db.user.create({ data: { id: 1 } })).toResolveTruthy();
        await expect(db.post.create({ data: { id: 1 } })).toBeRejectedByPolicy();
    });

    it('complains when used outside policies', async () => {
        await expect(
            loadModelWithError(
                `
            model User {
                id String @default(currentOperation())
            }
            `
            )
        ).resolves.toContain('function "currentOperation" is not allowed in the current context: DefaultValue');
    });

    it('complains when casing argument is invalid', async () => {
        await expect(
            loadModelWithError(
                `
            model User {
                id String @id
                @@allow('create', currentOperation('foo') == 'User')
            }
            `
            )
        ).resolves.toContain('argument must be one of: "original", "upper", "lower", "capitalize", "uncapitalize"');
    });
});
