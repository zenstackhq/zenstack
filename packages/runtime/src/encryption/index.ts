import { _decrypt, _encrypt, ENCRYPTION_KEY_BYTES, getKeyDigest, loadKey } from './utils';

/**
 * Default encrypter
 */
export class Encrypter {
    private key: CryptoKey | undefined;
    private keyDigest: string | undefined;

    constructor(private readonly encryptionKey: Uint8Array) {
        if (encryptionKey.length !== ENCRYPTION_KEY_BYTES) {
            throw new Error(`Encryption key must be ${ENCRYPTION_KEY_BYTES} bytes`);
        }
    }

    /**
     * Encrypts the given data
     */
    async encrypt(data: string): Promise<string> {
        if (!this.key) {
            this.key = await loadKey(this.encryptionKey, ['encrypt']);
        }

        if (!this.keyDigest) {
            this.keyDigest = await getKeyDigest(this.encryptionKey);
        }

        return _encrypt(data, this.key, this.keyDigest);
    }
}

/**
 * Default decrypter
 */
export class Decrypter {
    private keys: Array<{ key: CryptoKey; digest: string }> = [];

    constructor(private readonly decryptionKeys: Uint8Array[]) {
        if (decryptionKeys.length === 0) {
            throw new Error('At least one decryption key must be provided');
        }

        for (const key of decryptionKeys) {
            if (key.length !== ENCRYPTION_KEY_BYTES) {
                throw new Error(`Decryption key must be ${ENCRYPTION_KEY_BYTES} bytes`);
            }
        }
    }

    /**
     * Decrypts the given data
     */
    async decrypt(data: string): Promise<string> {
        if (this.keys.length === 0) {
            this.keys = await Promise.all(
                this.decryptionKeys.map(async (key) => ({
                    key: await loadKey(key, ['decrypt']),
                    digest: await getKeyDigest(key),
                }))
            );
        }

        return _decrypt(data, async (digest) =>
            this.keys.filter((entry) => entry.digest === digest).map((entry) => entry.key)
        );
    }
}
