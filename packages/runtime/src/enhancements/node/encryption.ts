/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

import { ACTIONS_WITH_WRITE_PAYLOAD } from '../../constants';
import {
    FieldInfo,
    NestedWriteVisitor,
    enumerate,
    getModelFields,
    resolveField,
    type PrismaWriteActionType,
} from '../../cross';
import { Decrypter, Encrypter } from '../../encryption';
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
    private logger: Logger;
    private encryptionKey: CryptoKey | undefined;
    private encryptionKeyDigest: string | undefined;
    private decryptionKeys: Array<{ key: CryptoKey; digest: string }> = [];
    private encrypter: Encrypter | undefined;
    private decrypter: Decrypter | undefined;

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

            this.encrypter = new Encrypter(options.encryption.encryptionKey);
            this.decrypter = new Decrypter([
                options.encryption.encryptionKey,
                ...(options.encryption.decryptionKeys || []),
            ]);
        }
    }

    private isCustomEncryption(encryption: CustomEncryption | SimpleEncryption): encryption is CustomEncryption {
        return 'encrypt' in encryption && 'decrypt' in encryption;
    }

    private async encrypt(field: FieldInfo, data: string): Promise<string> {
        if (this.isCustomEncryption(this.options.encryption!)) {
            return this.options.encryption.encrypt(this.model, field, data);
        }

        return this.encrypter!.encrypt(data);
    }

    private async decrypt(field: FieldInfo, data: string): Promise<string> {
        if (this.isCustomEncryption(this.options.encryption!)) {
            return this.options.encryption.decrypt(this.model, field, data);
        }

        return this.decrypter!.decrypt(data);
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
