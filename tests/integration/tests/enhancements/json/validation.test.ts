import { loadModelWithError, loadSchema } from '@zenstackhq/testtools';

describe('JSON field typing', () => {
    it('is only supported by postgres', async () => {
        await expect(
            loadSchema(
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
        ).rejects.toThrow('Datasource provider "sqlite" does not support "@json" fields');
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
