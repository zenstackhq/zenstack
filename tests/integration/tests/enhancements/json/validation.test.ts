import { loadModelWithError } from '@zenstackhq/testtools';

describe('JSON field typing', () => {
    it('is only supported by postgres', async () => {
        await expect(
            loadModelWithError(
                `
            type Profile {
                age Int @gt(0)
            }
            
            model User {
                id Int @id @default(autoincrement())
                profile Profile @json
                @@allow('all', true)
            }
            `
            )
        ).resolves.toContain('Custom-typed field is only supported with "postgresql" provider');
    });

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
});