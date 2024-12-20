import { loadSchema } from '@zenstackhq/testtools';
import path from 'path';

describe('Encrypted test', () => {
    let origDir: string;

    beforeAll(async () => {
        origDir = path.resolve('.');
    });

    afterEach(async () => {
        process.chdir(origDir);
    });

    it('encrypted tests', async () => {
        const { enhance } = await loadSchema(`
    model User {
        id String @id @default(cuid())
        encrypted_value String @encrypted(saltLength: 16)
    
        @@allow('all', true)
    }`);

        const db = enhance();
        const r = await db.user.create({
            data: {
                id: '1',
                encrypted_value: 'abc123',
            },
        });

        expect(r.encrypted_value).toBe('abc123');
    });
});
