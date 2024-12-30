/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

import {
    FieldInfo,
    NestedWriteVisitor,
    enumerate,
    getModelFields,
    resolveField,
    type PrismaWriteActionType,
} from '../../cross';
import { DbClientContract, CustomEncryption, SimpleEncryption } from '../../types';
import { InternalEnhancementOptions } from './create-enhancement';
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
        'encrypted'
    );
}

class EncryptedHandler extends DefaultPrismaProxyHandler {
    private queryUtils: QueryUtils;
    private encoder = new TextEncoder();
    private decoder = new TextDecoder();

    constructor(prisma: DbClientContract, model: string, options: InternalEnhancementOptions) {
        super(prisma, model, options);

        this.queryUtils = new QueryUtils(prisma, options);

        if (!options.encryption) throw new Error('Encryption options must be provided');

        if (this.isCustomEncryption(options.encryption!)) {
            if (!options.encryption.encrypt || !options.encryption.decrypt)
                throw new Error('Custom encryption must provide encrypt and decrypt functions');
        } else {
            if (!options.encryption.encryptionKey) throw new Error('Encryption key must be provided');
            if (options.encryption.encryptionKey.length !== 32) throw new Error('Encryption key must be 32 bytes');
        }
    }

    private async getKey(secret: Uint8Array): Promise<CryptoKey> {
        return crypto.subtle.importKey('raw', secret, 'AES-GCM', false, ['encrypt', 'decrypt']);
    }

    private isCustomEncryption(encryption: CustomEncryption | SimpleEncryption): encryption is CustomEncryption {
        return 'encrypt' in encryption && 'decrypt' in encryption;
    }

    private async encrypt(field: FieldInfo, data: string): Promise<string> {
        if (this.isCustomEncryption(this.options.encryption!)) {
            return this.options.encryption.encrypt(this.model, field, data);
        }

        const key = await this.getKey(this.options.encryption!.encryptionKey);
        const iv = crypto.getRandomValues(new Uint8Array(12));

        const encrypted = await crypto.subtle.encrypt(
            {
                name: 'AES-GCM',
                iv,
            },
            key,
            this.encoder.encode(data)
        );

        // Combine IV and encrypted data into a single array of bytes
        const bytes = [...iv, ...new Uint8Array(encrypted)];

        // Convert bytes to base64 string
        return btoa(String.fromCharCode(...bytes));
    }

    private async decrypt(field: FieldInfo, data: string): Promise<string> {
        if (this.isCustomEncryption(this.options.encryption!)) {
            return this.options.encryption.decrypt(this.model, field, data);
        }

        const key = await this.getKey(this.options.encryption!.encryptionKey);

        // Convert base64 back to bytes
        const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));

        // First 12 bytes are IV, rest is encrypted data
        const decrypted = await crypto.subtle.decrypt(
            {
                name: 'AES-GCM',
                iv: bytes.slice(0, 12),
            },
            key,
            bytes.slice(12)
        );

        return this.decoder.decode(decrypted);
    }

    // base override
    protected async preprocessArgs(action: PrismaProxyActions, args: any) {
        const actionsOfInterest: PrismaProxyActions[] = ['create', 'createMany', 'update', 'updateMany', 'upsert'];
        if (args && args.data && actionsOfInterest.includes(action)) {
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
            const fieldInfo = await resolveField(this.options.modelMeta, realModel, field);

            if (!fieldInfo) {
                continue;
            }

            const shouldDecrypt = fieldInfo.attributes?.find((attr) => attr.name === '@encrypted');
            if (shouldDecrypt) {
                // Don't decrypt null, undefined or empty string values
                if (!entityData[field]) continue;

                try {
                    entityData[field] = await this.decrypt(fieldInfo, entityData[field]);
                } catch (error) {
                    console.warn('Decryption failed, keeping original value:', error);
                }
            }
        }
    }

    private async preprocessWritePayload(model: string, action: PrismaWriteActionType, args: any) {
        const visitor = new NestedWriteVisitor(this.options.modelMeta, {
            field: async (field, _action, data, context) => {
                // Don't encrypt null, undefined or empty string values
                if (!data) return;

                const encAttr = field.attributes?.find((attr) => attr.name === '@encrypted');
                if (encAttr && field.type === 'String') {
                    try {
                        context.parent[field.name] = await this.encrypt(field, data);
                    } catch (error) {
                        throw new Error(`Encryption failed for field ${field.name}: ${error}`);
                    }
                }
            },
        });

        await visitor.visit(model, action, args);
    }
}
