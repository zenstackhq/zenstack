import { z } from 'zod';

export const ENCRYPTER_VERSION = 1;
export const ENCRYPTION_KEY_BYTES = 32;
export const IV_BYTES = 12;
export const ALGORITHM = 'AES-GCM';
export const KEY_DIGEST_BYTES = 8;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const encryptionMetaSchema = z.object({
    // version
    v: z.number(),
    // algorithm
    a: z.string(),
    // key digest
    k: z.string(),
});

export async function loadKey(key: Uint8Array, keyUsages: KeyUsage[]): Promise<CryptoKey> {
    return crypto.subtle.importKey('raw', key, ALGORITHM, false, keyUsages);
}

export async function getKeyDigest(key: Uint8Array) {
    const rawDigest = await crypto.subtle.digest('SHA-256', key);
    return new Uint8Array(rawDigest.slice(0, KEY_DIGEST_BYTES)).reduce(
        (acc, byte) => acc + byte.toString(16).padStart(2, '0'),
        ''
    );
}

export async function _encrypt(data: string, key: CryptoKey, keyDigest: string): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
    const encrypted = await crypto.subtle.encrypt(
        {
            name: ALGORITHM,
            iv,
        },
        key,
        encoder.encode(data)
    );

    // combine IV and encrypted data into a single array of bytes
    const cipherBytes = [...iv, ...new Uint8Array(encrypted)];

    // encryption metadata
    const meta = { v: ENCRYPTER_VERSION, a: ALGORITHM, k: keyDigest };

    // convert concatenated result to base64 string
    return `${btoa(JSON.stringify(meta))}.${btoa(String.fromCharCode(...cipherBytes))}`;
}

export async function _decrypt(data: string, findKey: (digest: string) => Promise<CryptoKey[]>): Promise<string> {
    const [metaText, cipherText] = data.split('.');
    if (!metaText || !cipherText) {
        throw new Error('Malformed encrypted data');
    }

    let metaObj: unknown;
    try {
        metaObj = JSON.parse(atob(metaText));
    } catch (error) {
        throw new Error('Malformed metadata');
    }

    // parse meta
    const { a: algorithm, k: keyDigest } = encryptionMetaSchema.parse(metaObj);

    // find a matching decryption key
    const keys = await findKey(keyDigest);
    if (keys.length === 0) {
        throw new Error('No matching decryption key found');
    }

    // convert base64 back to bytes
    const bytes = Uint8Array.from(atob(cipherText), (c) => c.charCodeAt(0));

    // extract IV from the head
    const iv = bytes.slice(0, IV_BYTES);
    const cipher = bytes.slice(IV_BYTES);
    let lastError: unknown;

    for (const key of keys) {
        let decrypted: ArrayBuffer;
        try {
            decrypted = await crypto.subtle.decrypt({ name: algorithm, iv }, key, cipher);
        } catch (err) {
            lastError = err;
            continue;
        }
        return decoder.decode(decrypted);
    }

    throw lastError;
}
