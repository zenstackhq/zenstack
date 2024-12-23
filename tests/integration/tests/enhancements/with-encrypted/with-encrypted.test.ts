import { FieldInfo } from '@zenstackhq/runtime';
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

    it('Simple encryption test', async () => {
        const { enhance } = await loadSchema(`
    model User {
        id String @id @default(cuid())
        encrypted_value String @encrypted()
    
        @@allow('all', true)
    }`);

        const sudoDb = enhance(undefined, { kinds: [] });
        const db = enhance(undefined, { encryption: { encryptionKey: 'c558Gq0YQK2QcqtkMF9BGXHCQn4dMF8w' } });

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

        const sudoRead = await sudoDb.user.findUnique({
            where: {
                id: '1',
            },
        });

        expect(create.encrypted_value).toBe('abc123');
        expect(read.encrypted_value).toBe('abc123');
        expect(sudoRead.encrypted_value).not.toBe('abc123');
    });

    it('Custom encryption test', async () => {
        const { enhance } = await loadSchema(`
    model User {
        id String @id @default(cuid())
        encrypted_value String @encrypted()
    
        @@allow('all', true)
    }`);

        const sudoDb = enhance(undefined, { kinds: [] });
        const db = enhance(undefined, {
            encryption: {
                encrypt: async (model: string, field: FieldInfo, data: string) => {
                    // Add _enc to the end of the input
                    return data + '_enc';
                },
                decrypt: async (model: string, field: FieldInfo, cipher: string) => {
                    // Remove _enc from the end of the input explicitly
                    if (cipher.endsWith('_enc')) {
                        return cipher.slice(0, -4); // Remove last 4 characters (_enc)
                    }

                    return cipher;
                },
            },
        });

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

        const sudoRead = await sudoDb.user.findUnique({
            where: {
                id: '1',
            },
        });

        expect(create.encrypted_value).toBe('abc123');
        expect(read.encrypted_value).toBe('abc123');
        expect(sudoRead.encrypted_value).toBe('abc123_enc');
    });
});
