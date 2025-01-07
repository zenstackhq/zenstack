/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

import { z } from 'zod';
import { ACTIONS_WITH_WRITE_PAYLOAD } from '../../constants';
import {
    FieldInfo,
    NestedWriteVisitor,
    enumerate,
    getModelFields,
    resolveField,
    type PrismaWriteActionType,
} from '../../cross';
import { CustomEncryption, DbClientContract, SimpleEncryption } from '../../types';
import { InternalEnhancementOptions } from './create-enhancement';
import { Logger } from './logger';
import { DefaultPrismaProxyHandler, PrismaProxyActions, makeProxy } from './proxy';
import { QueryUtils } from './query-utils';

/**
 * Gets an enhanced Prisma client that supports `@encrypted` attribute.
 *
 * @private
 */
export function withEncrypted<DbClient extends object = any>(
    prisma: DbClient,
    options: InternalEnhancementOptions
): DbClient {
    return makeProxy(
        prisma,
        options.modelMeta,
        (_prisma, model) => new EncryptedHandler(_prisma as DbClientContract, model, options),
        'encryption'
    );
}

class EncryptedHandler extends DefaultPrismaProxyHandler {
    private queryUtils: QueryUtils;
    private encoder = new TextEncoder();
    private decoder = new TextDecoder();
    private logger: Logger;
    private encryptionKey: CryptoKey | undefined;
    private encryptionKeyDigest: string | undefined;
    private decryptionKeys: Array<{ key: CryptoKey; digest: string }> = [];
    private encryptionMetaSchema = z.object({
        // version
        v: z.number(),
        // algorithm
        a: z.string(),
        // key digest
        k: z.string(),
    });

    // constants
    private readonly ENCRYPTION_KEY_BYTES = 32;
    private readonly IV_BYTES = 12;
    private readonly ALGORITHM = 'AES-GCM';
    private readonly ENCRYPTER_VERSION = 1;
    private readonly KEY_DIGEST_BYTES = 8;

    constructor(prisma: DbClientContract, model: string, options: InternalEnhancementOptions) {
        super(prisma, model, options);

        this.queryUtils = new QueryUtils(prisma, options);
        this.logger = new Logger(prisma);

        if (!options.encryption) {
            throw this.queryUtils.unknownError('Encryption options must be provided');
        }

        if (this.isCustomEncryption(options.encryption!)) {
            if (!options.encryption.encrypt || !options.encryption.decrypt) {
                throw this.queryUtils.unknownError('Custom encryption must provide encrypt and decrypt functions');
            }
        } else {
            if (!options.encryption.encryptionKey) {
                throw this.queryUtils.unknownError('Encryption key must be provided');
            }
            if (options.encryption.encryptionKey.length !== this.ENCRYPTION_KEY_BYTES) {
                throw this.queryUtils.unknownError(`Encryption key must be ${this.ENCRYPTION_KEY_BYTES} bytes`);
            }
        }
    }

    private isCustomEncryption(encryption: CustomEncryption | SimpleEncryption): encryption is CustomEncryption {
        return 'encrypt' in encryption && 'decrypt' in encryption;
    }

    private async loadKey(key: Uint8Array, keyUsages: KeyUsage[]): Promise<CryptoKey> {
        return crypto.subtle.importKey('raw', key, this.ALGORITHM, false, keyUsages);
    }

    private async computeKeyDigest(key: Uint8Array) {
        const rawDigest = await crypto.subtle.digest('SHA-256', key);
        return new Uint8Array(rawDigest.slice(0, this.KEY_DIGEST_BYTES)).reduce(
            (acc, byte) => acc + byte.toString(16).padStart(2, '0'),
            ''
        );
    }

    private async getEncryptionKey(): Promise<CryptoKey> {
        if (this.isCustomEncryption(this.options.encryption!)) {
            throw new Error('Unexpected custom encryption settings');
        }
        if (!this.encryptionKey) {
            this.encryptionKey = await this.loadKey(this.options.encryption!.encryptionKey, ['encrypt', 'decrypt']);
        }
        return this.encryptionKey;
    }

    private async getEncryptionKeyDigest() {
        if (this.isCustomEncryption(this.options.encryption!)) {
            throw new Error('Unexpected custom encryption settings');
        }
        if (!this.encryptionKeyDigest) {
            this.encryptionKeyDigest = await this.computeKeyDigest(this.options.encryption!.encryptionKey);
        }
        return this.encryptionKeyDigest;
    }

    private async findDecryptionKeys(keyDigest: string): Promise<CryptoKey[]> {
        if (this.isCustomEncryption(this.options.encryption!)) {
            throw new Error('Unexpected custom encryption settings');
        }

        if (this.decryptionKeys.length === 0) {
            const keys = [this.options.encryption!.encryptionKey, ...(this.options.encryption!.decryptionKeys || [])];
            this.decryptionKeys = await Promise.all(
                keys.map(async (key) => ({
                    key: await this.loadKey(key, ['decrypt']),
                    digest: await this.computeKeyDigest(key),
                }))
            );
        }

        return this.decryptionKeys.filter((entry) => entry.digest === keyDigest).map((entry) => entry.key);
    }

    private async encrypt(field: FieldInfo, data: string): Promise<string> {
        if (this.isCustomEncryption(this.options.encryption!)) {
            return this.options.encryption.encrypt(this.model, field, data);
        }

        const key = await this.getEncryptionKey();
        const iv = crypto.getRandomValues(new Uint8Array(this.IV_BYTES));
        const encrypted = await crypto.subtle.encrypt(
            {
                name: this.ALGORITHM,
                iv,
            },
            key,
            this.encoder.encode(data)
        );

        // combine IV and encrypted data into a single array of bytes
        const cipherBytes = [...iv, ...new Uint8Array(encrypted)];

        // encryption metadata
        const meta = { v: this.ENCRYPTER_VERSION, a: this.ALGORITHM, k: await this.getEncryptionKeyDigest() };

        // convert concatenated result to base64 string
        return `${btoa(JSON.stringify(meta))}.${btoa(String.fromCharCode(...cipherBytes))}`;
    }

    private async decrypt(field: FieldInfo, data: string): Promise<string> {
        if (this.isCustomEncryption(this.options.encryption!)) {
            return this.options.encryption.decrypt(this.model, field, data);
        }

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
        const { a: algorithm, k: keyDigest } = this.encryptionMetaSchema.parse(metaObj);

        // find a matching decryption key
        const keys = await this.findDecryptionKeys(keyDigest);
        if (keys.length === 0) {
            throw new Error('No matching decryption key found');
        }

        // convert base64 back to bytes
        const bytes = Uint8Array.from(atob(cipherText), (c) => c.charCodeAt(0));

        // extract IV from the head
        const iv = bytes.slice(0, this.IV_BYTES);
        const cipher = bytes.slice(this.IV_BYTES);
        let lastError: unknown;

        for (const key of keys) {
            let decrypted: ArrayBuffer;
            try {
                decrypted = await crypto.subtle.decrypt({ name: algorithm, iv }, key, cipher);
            } catch (err) {
                lastError = err;
                continue;
            }
            return this.decoder.decode(decrypted);
        }

        throw lastError;
    }

    // base override
    protected async preprocessArgs(action: PrismaProxyActions, args: any) {
        if (args && ACTIONS_WITH_WRITE_PAYLOAD.includes(action)) {
            await this.preprocessWritePayload(this.model, action as PrismaWriteActionType, args);
        }
        return args;
    }

    // base override
    protected async processResultEntity<T>(method: PrismaProxyActions, data: T): Promise<T> {
        if (!data || typeof data !== 'object') {
            return data;
        }

        for (const value of enumerate(data)) {
            await this.doPostProcess(value, this.model);
        }

        return data;
    }

    private async doPostProcess(entityData: any, model: string) {
        const realModel = this.queryUtils.getDelegateConcreteModel(model, entityData);

        for (const field of getModelFields(entityData)) {
            // don't decrypt null, undefined or empty string values
            if (!entityData[field]) continue;

            const fieldInfo = await resolveField(this.options.modelMeta, realModel, field);
            if (!fieldInfo) {
                continue;
            }

            if (fieldInfo.isDataModel) {
                const items =
                    fieldInfo.isArray && Array.isArray(entityData[field]) ? entityData[field] : [entityData[field]];
                for (const item of items) {
                    // recurse
                    await this.doPostProcess(item, fieldInfo.type);
                }
            } else {
                const shouldDecrypt = fieldInfo.attributes?.find((attr) => attr.name === '@encrypted');
                if (shouldDecrypt) {
                    try {
                        entityData[field] = await this.decrypt(fieldInfo, entityData[field]);
                    } catch (error) {
                        this.logger.warn(`Decryption failed, keeping original value: ${error}`);
                    }
                }
            }
        }
    }

    private async preprocessWritePayload(model: string, action: PrismaWriteActionType, args: any) {
        const visitor = new NestedWriteVisitor(this.options.modelMeta, {
            field: async (field, _action, data, context) => {
                // don't encrypt null, undefined or empty string values
                if (!data) return;

                const encAttr = field.attributes?.find((attr) => attr.name === '@encrypted');
                if (encAttr && field.type === 'String') {
                    try {
                        context.parent[field.name] = await this.encrypt(field, data);
                    } catch (error) {
                        this.queryUtils.unknownError(`Encryption failed for field ${field.name}: ${error}`);
                    }
                }
            },
        });

        await visitor.visit(model, action, args);
    }
}
