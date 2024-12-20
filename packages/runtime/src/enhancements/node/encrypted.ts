/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */

import { NestedWriteVisitor, type PrismaWriteActionType } from '../../cross';
import { DbClientContract } from '../../types';
import { InternalEnhancementOptions } from './create-enhancement';
import { DefaultPrismaProxyHandler, PrismaProxyActions, makeProxy } from './proxy';

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

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const getKey = async (secret: string): Promise<CryptoKey> => {
    return crypto.subtle.importKey('raw', encoder.encode(secret).slice(0, 32), 'AES-GCM', false, [
        'encrypt',
        'decrypt',
    ]);
};
const encryptFunc = async (data: string, secret: string): Promise<string> => {
    const key = await getKey(secret);
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const encrypted = await crypto.subtle.encrypt(
        {
            name: 'AES-GCM',
            iv,
        },
        key,
        encoder.encode(data)
    );

    // Combine IV and encrypted data into a single array of bytes
    const bytes = [...iv, ...new Uint8Array(encrypted)];

    // Convert bytes to base64 string
    return btoa(String.fromCharCode(...bytes));
};

const decryptFunc = async (encryptedData: string, secret: string): Promise<string> => {
    const key = await getKey(secret);

    // Convert base64 back to bytes
    const bytes = Uint8Array.from(atob(encryptedData), (c) => c.charCodeAt(0));

    // First 12 bytes are IV, rest is encrypted data
    const decrypted = await crypto.subtle.decrypt(
        {
            name: 'AES-GCM',
            iv: bytes.slice(0, 12),
        },
        key,
        bytes.slice(12)
    );

    return decoder.decode(decrypted);
};

class EncryptedHandler extends DefaultPrismaProxyHandler {
    constructor(prisma: DbClientContract, model: string, options: InternalEnhancementOptions) {
        super(prisma, model, options);
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
    protected async processResultEntity(action: PrismaProxyActions, args: any) {
        return args;
    }

    private async preprocessWritePayload(model: string, action: PrismaWriteActionType, args: any) {
        const visitor = new NestedWriteVisitor(this.options.modelMeta, {
            field: async (field, _action, data, context) => {
                const encAttr = field.attributes?.find((attr) => attr.name === '@encrypted');
                if (encAttr && field.type === 'String') {
                    // encrypt value

                    let secret: string = encAttr.args.find((arg) => arg.name === 'secret')?.value as string;

                    context.parent[field.name] = await encryptFunc(data, secret);
                }
            },
        });

        await visitor.visit(model, action, args);
    }
}
