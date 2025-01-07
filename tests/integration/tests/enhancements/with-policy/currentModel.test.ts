import { loadModelWithError, loadSchema } from '@zenstackhq/testtools';

describe('currentModel tests', () => {
    it('works in models', async () => {
        const { enhance } = await loadSchema(
            `
            model User {
                id Int @id
                @@allow('read', true)
                @@allow('create', currentModel() == 'User')
            }
            
            model Post {
                id Int @id
                @@allow('read', true)
                @@allow('create', currentModel() == 'User')
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
                @@allow('create', currentModel('upper') == 'USER')
            }
            
            model Post {
                id Int @id
                @@allow('read', true)
                @@allow('create', currentModel('upper') == 'Post')
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
                @@allow('create', currentModel('lower') == 'user')
            }
            
            model Post {
                id Int @id
                @@allow('read', true)
                @@allow('create', currentModel('lower') == 'Post')
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
            model user {
                id Int @id
                @@allow('read', true)
                @@allow('create', currentModel('capitalize') == 'User')
            }
            
            model post {
                id Int @id
                @@allow('read', true)
                @@allow('create', currentModel('capitalize') == 'post')
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
            model USER {
                id Int @id
                @@allow('read', true)
                @@allow('create', currentModel('uncapitalize') == 'uSER')
            }
            
            model POST {
                id Int @id
                @@allow('read', true)
                @@allow('create', currentModel('uncapitalize') == 'POST')
            }
            `
        );

        const db = enhance();
        await expect(db.USER.create({ data: { id: 1 } })).toResolveTruthy();
        await expect(db.POST.create({ data: { id: 1 } })).toBeRejectedByPolicy();
    });

    it('works when inherited from abstract base', async () => {
        const { enhance } = await loadSchema(
            `
            abstract model Base {
                id Int @id
                @@allow('read', true)
                @@allow('create', currentModel() == 'User')
            }

            model User extends Base {
            }
            
            model Post extends Base {
            }
            `
        );

        const db = enhance();
        await expect(db.user.create({ data: { id: 1 } })).toResolveTruthy();
        await expect(db.post.create({ data: { id: 1 } })).toBeRejectedByPolicy();
    });

    it('works when inherited from delegate base', async () => {
        const { enhance } = await loadSchema(
            `
            model Base {
                id Int @id
                type String
                @@delegate(type)

                @@allow('read', true)
                @@allow('create', currentModel() == 'User')
            }

            model User extends Base {
            }
            
            model Post extends Base {
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
                id String @default(currentModel())
            }
            `
            )
        ).resolves.toContain('function "currentModel" is not allowed in the current context: DefaultValue');
    });

    it('complains when casing argument is invalid', async () => {
        await expect(
            loadModelWithError(
                `
            model User {
                id String @id
                @@allow('create', currentModel('foo') == 'User')
            }
            `
            )
        ).resolves.toContain('argument must be one of: "original", "upper", "lower", "capitalize", "uncapitalize"');
    });
});
