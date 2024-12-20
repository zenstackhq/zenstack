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
        const ENCRYPTION_KEY = 'c558Gq0YQK2QcqtkMF9BGXHCQn4dMF8w';

        const { enhance } = await loadSchema(`
    model User {
        id String @id @default(cuid())
        encrypted_value String @encrypted(secret: "${ENCRYPTION_KEY}")
    
        @@allow('all', true)
    }`);

        const db = enhance();

        const create = await db.user.create({
            data: {
                id: '1',
                encrypted_value: 'abc123',
            },
        });

        const read = await db.user.findUnique({
            where: {
                id: '1',
            },
        });

        expect(create.encrypted_value).toBe('abc123');
        expect(read.encrypted_value).toBe('abc123');
    });
});
