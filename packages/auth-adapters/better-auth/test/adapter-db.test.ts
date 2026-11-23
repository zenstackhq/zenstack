import type { BetterAuthOptions } from '@better-auth/core';
import type { BetterAuthDBSchema } from 'better-auth/db';
import { createTestClient } from '@zenstackhq/testtools';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { zenstackAdapter } from '../src/adapter';

const zmodel = `
model SsoProvider {
    id         String @id
    providerId String @unique
    issuer     String
}

model DeviceCode {
    id     String  @id
    status String
    userId String?
}

model ApiToken {
    id     String @id
    token  String @unique
    userId String
}
`;

// Plugin models, so better-auth's adapter factory knows the fields and transforms `where` like it does at runtime.
const pluginSchema = {
    ssoProvider: {
        modelName: 'ssoProvider',
        fields: {
            providerId: { type: 'string', required: true, unique: true },
            issuer: { type: 'string', required: true },
        },
    },
    deviceCode: {
        modelName: 'deviceCode',
        fields: {
            status: { type: 'string', required: true },
            userId: { type: 'string', required: false },
        },
    },
    apiToken: {
        modelName: 'apiToken',
        fields: {
            token: { type: 'string', required: true, unique: true },
            userId: { type: 'string', required: true },
        },
    },
} satisfies BetterAuthDBSchema;

const authOptions = {
    plugins: [{ id: 'test-models', schema: pluginSchema }],
} as unknown as BetterAuthOptions;

describe('ZenStack Better Auth adapter with a database', () => {
    let db: any;
    let adapter: ReturnType<ReturnType<typeof zenstackAdapter>>;

    beforeEach(async () => {
        db = await createTestClient(zmodel);
        const provider = db.$schema.provider.type === 'postgresql' ? 'postgresql' : 'sqlite';
        adapter = zenstackAdapter(db, { provider })(authOptions);
    });

    afterEach(async () => {
        await db?.$disconnect();
    });

    it('updates with a unique field plus extra conditions, like @better-auth/sso row locks (#2694)', async () => {
        await db.ssoProvider.create({ data: { id: 'sso-1', providerId: 'acme', issuer: 'https://idp.acme.test' } });

        const row = await adapter.update<{ id: string; providerId: string }>({
            model: 'ssoProvider',
            where: [
                { field: 'id', value: 'sso-1' },
                { field: 'providerId', value: 'acme' },
            ],
            update: { providerId: 'acme' },
        });

        expect(row).toMatchObject({ id: 'sso-1', providerId: 'acme' });
    });

    it('updates with a compound where inside a transaction (#2694)', async () => {
        await db.ssoProvider.create({ data: { id: 'sso-1', providerId: 'acme', issuer: 'https://idp.acme.test' } });

        const row = await adapter.transaction((trx) =>
            trx.update<{ id: string; issuer: string }>({
                model: 'ssoProvider',
                where: [
                    { field: 'id', value: 'sso-1' },
                    { field: 'providerId', value: 'acme' },
                ],
                update: { issuer: 'https://idp2.acme.test' },
            }),
        );

        expect(row).toMatchObject({ id: 'sso-1', issuer: 'https://idp2.acme.test' });
    });

    it('updates a single row when the where has no unique field (#2694)', async () => {
        await db.deviceCode.create({ data: { id: 'device-1', status: 'pending', userId: null } });
        await db.deviceCode.create({ data: { id: 'device-2', status: 'pending', userId: null } });

        const row = await adapter.update<{ id: string }>({
            model: 'deviceCode',
            where: [{ field: 'status', value: 'pending' }],
            update: { status: 'approved' },
        });

        await expect(db.deviceCode.count({ where: { status: 'approved' } })).resolves.toBe(1);
        await expect(db.deviceCode.findUnique({ where: { id: row!.id } })).resolves.toMatchObject({
            status: 'approved',
        });
    });

    it('returns null when a compound update matches nothing (#2694)', async () => {
        await db.ssoProvider.create({ data: { id: 'sso-1', providerId: 'acme', issuer: 'https://idp.acme.test' } });

        const row = await adapter.update({
            model: 'ssoProvider',
            where: [
                { field: 'id', value: 'sso-1' },
                { field: 'providerId', value: 'other' },
            ],
            update: { providerId: 'other' },
        });

        expect(row).toBeNull();
        await expect(db.ssoProvider.findUnique({ where: { id: 'sso-1' } })).resolves.toMatchObject({
            providerId: 'acme',
        });
    });

    it('claims a row only once with a compare-and-swap update, like device authorization (#2694)', async () => {
        await db.deviceCode.create({ data: { id: 'device-1', status: 'pending', userId: null } });
        const claim = (userId: string) =>
            adapter.update<{ id: string; userId: string | null }>({
                model: 'deviceCode',
                where: [
                    { field: 'id', value: 'device-1' },
                    { field: 'status', value: 'pending' },
                    { field: 'userId', value: null },
                ],
                update: { userId },
            });

        await expect(claim('user-1')).resolves.toMatchObject({ id: 'device-1', userId: 'user-1' });
        await expect(claim('user-2')).resolves.toBeNull();
        await expect(db.deviceCode.findUnique({ where: { id: 'device-1' } })).resolves.toMatchObject({
            userId: 'user-1',
        });
    });

    it('updates without a unique field and returns the updated row (#2694)', async () => {
        await db.deviceCode.create({ data: { id: 'device-1', status: 'pending', userId: null } });

        const row = await adapter.update({
            model: 'deviceCode',
            where: [{ field: 'status', value: 'pending' }],
            update: { status: 'approved' },
        });

        // the update changes the filtered field, so the row must not be read back with the original filter
        expect(row).toMatchObject({ id: 'device-1', status: 'approved' });
    });

    it('returns null when updating a missing row by id (#2694)', async () => {
        const row = await adapter.update({
            model: 'deviceCode',
            where: [{ field: 'id', value: 'missing' }],
            update: { status: 'approved' },
        });

        expect(row).toBeNull();
    });

    it('updates rows matched with OR conditions (#2694)', async () => {
        await db.deviceCode.create({ data: { id: 'device-1', status: 'pending', userId: null } });

        const row = await adapter.update({
            model: 'deviceCode',
            where: [
                { field: 'status', value: 'denied', connector: 'OR' },
                { field: 'status', value: 'pending', connector: 'OR' },
            ],
            update: { status: 'approved' },
        });

        expect(row).toMatchObject({ id: 'device-1', status: 'approved' });
    });

    it('deletes with a unique field plus extra conditions (#2694)', async () => {
        await db.apiToken.create({ data: { id: 'token-1', token: 'secret', userId: 'user-1' } });

        await adapter.delete({
            model: 'apiToken',
            where: [
                { field: 'id', value: 'token-1' },
                { field: 'userId', value: 'user-1' },
            ],
        });

        await expect(db.apiToken.findUnique({ where: { id: 'token-1' } })).resolves.toBeNull();
    });

    it('keeps the row when a compound delete matches nothing (#2694)', async () => {
        await db.apiToken.create({ data: { id: 'token-1', token: 'secret', userId: 'user-1' } });

        await expect(
            adapter.delete({
                model: 'apiToken',
                where: [
                    { field: 'id', value: 'token-1' },
                    { field: 'userId', value: 'user-2' },
                ],
            }),
        ).resolves.toBeUndefined();

        await expect(db.apiToken.findUnique({ where: { id: 'token-1' } })).resolves.not.toBeNull();
    });

    it('deletes without a unique field (#2694)', async () => {
        await db.apiToken.create({ data: { id: 'token-1', token: 'secret', userId: 'user-1' } });
        await db.apiToken.create({ data: { id: 'token-2', token: 'other', userId: 'user-2' } });

        await adapter.delete({ model: 'apiToken', where: [{ field: 'userId', value: 'user-1' }] });

        await expect(db.apiToken.findMany({ orderBy: { id: 'asc' } })).resolves.toMatchObject([{ id: 'token-2' }]);
    });

    it('does not throw when deleting a missing row by id', async () => {
        await expect(
            adapter.delete({ model: 'apiToken', where: [{ field: 'id', value: 'missing' }] }),
        ).resolves.toBeUndefined();
    });
});
