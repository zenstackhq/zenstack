import type { BetterAuthOptions } from '@better-auth/core';
import type { BetterAuthDBSchema } from 'better-auth/db';
import fs from 'node:fs';
import path from 'node:path';
import tmp from 'tmp';
import { describe, expect, it } from 'vitest';
import { type AdapterConfig, zenstackAdapter } from '../src/adapter';
import { generateSchema } from '../src/schema-generator';

const oauthClientSchema = {
    oauthClient: {
        modelName: 'oauthClient',
        fields: {
            name: {
                type: 'string',
                required: true,
            },
            scopes: {
                type: 'string[]',
                required: true,
            },
            retryDelays: {
                type: 'number[]',
                required: false,
            },
        },
    },
} satisfies BetterAuthDBSchema;

function makeAuthOptions() {
    return {
        plugins: [
            {
                id: 'oauth-provider',
                schema: oauthClientSchema,
            },
        ],
    } as unknown as BetterAuthOptions;
}

function makeDb(captured: { createData?: Record<string, unknown> }) {
    return {
        oauthClient: {
            create: async ({ data }: { data: Record<string, unknown> }) => {
                captured.createData = data;
                return data;
            },
        },
        $transaction: async <T>(cb: (tx: unknown) => Promise<T>) => cb(makeDb(captured)),
    };
}

async function createOauthClient(config: AdapterConfig) {
    const captured: { createData?: Record<string, unknown> } = {};
    const adapter = zenstackAdapter(makeDb(captured) as any, config)(makeAuthOptions());

    await adapter.create({
        model: 'oauthClient',
        data: {
            id: 'client-1',
            name: 'client',
            scopes: ['openid', 'profile'],
            retryDelays: [1, 2],
        },
        forceAllowId: true,
    });

    return captured.createData;
}

async function generateOauthClientSchema(config: AdapterConfig) {
    const { name: workDir, removeCallback } = tmp.dirSync({ unsafeCleanup: true });
    const schemaPath = path.join(workDir, 'schema.zmodel');

    try {
        const result = await generateSchema(schemaPath, oauthClientSchema, config, makeAuthOptions());
        return result.code;
    } finally {
        if (fs.existsSync(workDir)) {
            removeCallback();
        }
    }
}

describe('ZenStack Better Auth adapter', () => {
    it('preserves native array inputs for PostgreSQL (#2615)', async () => {
        const data = await createOauthClient({ provider: 'postgresql' });

        expect(data?.scopes).toEqual(['openid', 'profile']);
        expect(data?.retryDelays).toEqual([1, 2]);
    });

    it('serializes array inputs when native arrays are disabled (#2615)', async () => {
        const data = await createOauthClient({ provider: 'postgresql', supportsArrays: false });

        expect(data?.scopes).toBe(JSON.stringify(['openid', 'profile']));
        expect(data?.retryDelays).toBe(JSON.stringify([1, 2]));
    });

    it('generates native array fields when the adapter supports arrays (#2615)', async () => {
        const schema = await generateOauthClientSchema({ provider: 'postgresql' });

        expect(schema).toMatch(/scopes\s+String\[\]/);
        expect(schema).toMatch(/retryDelays\s+Int\[\]\?/);
    });

    it('generates JSON fields when the adapter does not support arrays (#2615)', async () => {
        const schema = await generateOauthClientSchema({ provider: 'sqlite' });

        expect(schema).toMatch(/scopes\s+Json/);
        expect(schema).toMatch(/retryDelays\s+Json\?/);
        expect(schema).not.toMatch(/scopes\s+String\[\]/);
        expect(schema).not.toMatch(/retryDelays\s+Int\[\]/);
    });
});
