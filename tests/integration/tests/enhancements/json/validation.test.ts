import { loadModel, loadModelWithError, loadSchema } from '@zenstackhq/testtools';

describe('JSON field typing', () => {
    it('requires field to have @json attribute', async () => {
        await expect(
            loadModelWithError(
                `
            type Profile {
                age Int @gt(0)
            }
            
            model User {
                id Int @id @default(autoincrement())
                profile Profile
                @@allow('all', true)
            }
            `
            )
        ).resolves.toContain('Custom-typed field must have @json attribute');
    });

    it('disallows normal member accesses in policy rules', async () => {
        await expect(
            loadModelWithError(
                `
            type Profile {
                age Int @gt(0)
            }
            
            model User {
                id Int @id @default(autoincrement())
                profile Profile @json
                @@allow('all', profile.age > 18)
            }
            `
            )
        ).resolves.toContain(`Could not resolve reference to MemberAccessTarget named 'age'.`);
    });

    it('allows auth member accesses in policy rules', async () => {
        await expect(
            loadModel(
                `
            type Profile {
                age Int @gt(0)
            }
            
            model User {
                id Int @id @default(autoincrement())
                profile Profile @json
                @@allow('all', auth().profile.age > 18)
            }
            `
            )
        ).toResolveTruthy();
    });

    it('disallows normal collection accesses in policy rules', async () => {
        await expect(
            loadModelWithError(
                `
            type Profile {
                roles Role[]
            }

            type Role {
                name String
            }
            
            model User {
                id Int @id @default(autoincrement())
                profile Profile @json
                @@allow('all', profile.roles?[name == 'ADMIN'])
            }
            `
            )
        ).resolves.toContain(`Could not resolve reference to MemberAccessTarget named 'roles'.`);

        await expect(
            loadModelWithError(
                `
            type Profile {
                role String
            }
            
            model User {
                id Int @id @default(autoincrement())
                profiles Profile[] @json
                @@allow('all', profiles?[role == 'ADMIN'])
            }
            `
            )
        ).resolves.toContain(`Could not resolve reference to ReferenceTarget named 'role'.`);
    });

    it('disallows auth collection accesses in policy rules', async () => {
        await expect(
            loadModel(
                `
            type Profile {
                roles Role[]
            }

            type Role {
                name String
            }
            
            model User {
                id Int @id @default(autoincrement())
                profile Profile @json
                @@allow('all', auth().profile.roles?[name == 'ADMIN'])
            }
            `
            )
        ).toResolveTruthy();
    });

    it('only allows whitelisted type-level attributes', async () => {
        await expect(
            loadModel(
                `
            type User {
                id Int @id
                @@auth
            }
            `
            )
        ).toResolveTruthy();

        await expect(
            loadModelWithError(
                `
            type User {
                id Int @id
                @@allow('all', true)
            }
            `
            )
        ).resolves.toContain('attribute "@@allow" cannot be used on type declarations');
    });
});
