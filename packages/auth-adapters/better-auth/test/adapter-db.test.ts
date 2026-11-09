import type { BetterAuthOptions } from '@better-auth/core';
import type { BetterAuthDBSchema } from 'better-auth/db';
import { createTestClient } from '@zenstackhq/testtools';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

model OneTimeToken {
    id         String   @id
    identifier String
    value      String
    expiresAt  DateTime
}

model UsageCounter {
    id         String    @id
    key        String
    remaining  Int
    lastUsedAt DateTime?
}

model ClientGrant {
    clientId String
    userId   String
    uses     Int
    @@id([clientId, userId], name: "grantKey")
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
    oneTimeToken: {
        modelName: 'oneTimeToken',
        fields: {
            identifier: { type: 'string', required: true },
            value: { type: 'string', required: true },
            expiresAt: { type: 'date', required: true },
        },
    },
    usageCounter: {
        modelName: 'usageCounter',
        fields: {
            key: { type: 'string', required: true },
            remaining: { type: 'number', required: true },
            lastUsedAt: { type: 'date', required: false },
        },
    },
    clientGrant: {
        modelName: 'clientGrant',
        fields: {
            clientId: { type: 'string', required: true },
            userId: { type: 'string', required: true },
            uses: { type: 'number', required: true },
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

    describe('consumeOne (#2820)', () => {
        const future = () => new Date(Date.now() + 60_000);

        it('deletes and returns the row, then returns null on a second consume', async () => {
            await db.oneTimeToken.create({
                data: { id: 'ott-1', identifier: 'reset-password:abc', value: 'user-1', expiresAt: future() },
            });
            const transaction = vi.spyOn(db, '$transaction');

            const consume = () =>
                adapter.consumeOne<{ id: string; value: string }>({
                    model: 'oneTimeToken',
                    where: [{ field: 'identifier', value: 'reset-password:abc' }],
                });

            await expect(consume()).resolves.toMatchObject({ id: 'ott-1', value: 'user-1' });
            await expect(consume()).resolves.toBeNull();
            await expect(db.oneTimeToken.count()).resolves.toBe(0);
            // the adapter's own method ran, not better-auth's generic fallback
            expect(transaction).toHaveBeenCalled();
        });

        it('consumes by id', async () => {
            await db.oneTimeToken.create({
                data: { id: 'ott-1', identifier: 'verify', value: 'v', expiresAt: future() },
            });
            const consume = () =>
                adapter.consumeOne({ model: 'oneTimeToken', where: [{ field: 'id', value: 'ott-1' }] });

            await expect(consume()).resolves.toMatchObject({ id: 'ott-1' });
            await expect(consume()).resolves.toBeNull();
        });

        it('deletes only one of several rows matching a non-unique where', async () => {
            await db.oneTimeToken.create({
                data: { id: 'ott-1', identifier: 'same', value: 'a', expiresAt: future() },
            });
            await db.oneTimeToken.create({
                data: { id: 'ott-2', identifier: 'same', value: 'b', expiresAt: future() },
            });

            const row = await adapter.consumeOne<{ id: string }>({
                model: 'oneTimeToken',
                where: [{ field: 'identifier', value: 'same' }],
            });

            expect(row).not.toBeNull();
            await expect(db.oneTimeToken.count()).resolves.toBe(1);
            await expect(db.oneTimeToken.findUnique({ where: { id: row!.id } })).resolves.toBeNull();
        });

        it('keeps the row and returns null when the guard does not match', async () => {
            await db.oneTimeToken.create({
                data: { id: 'ott-1', identifier: 'verify', value: 'v', expiresAt: new Date(Date.now() - 60_000) },
            });

            await expect(
                adapter.consumeOne({
                    model: 'oneTimeToken',
                    where: [
                        { field: 'identifier', value: 'verify' },
                        { field: 'expiresAt', operator: 'gt', value: new Date() },
                    ],
                }),
            ).resolves.toBeNull();
            await expect(db.oneTimeToken.count()).resolves.toBe(1);
        });

        it('hands the row to exactly one of several concurrent callers', async () => {
            await db.oneTimeToken.create({
                data: { id: 'ott-1', identifier: 'verify', value: 'v', expiresAt: future() },
            });

            const results = await Promise.all(
                Array.from({ length: 5 }, () =>
                    adapter.consumeOne({ model: 'oneTimeToken', where: [{ field: 'identifier', value: 'verify' }] }),
                ),
            );

            expect(results.filter((r) => r !== null)).toHaveLength(1);
            await expect(db.oneTimeToken.count()).resolves.toBe(0);
        });

        it('works inside an adapter transaction', async () => {
            await db.oneTimeToken.create({
                data: { id: 'ott-1', identifier: 'verify', value: 'v', expiresAt: future() },
            });

            const row = await adapter.transaction((trx) =>
                trx.consumeOne({ model: 'oneTimeToken', where: [{ field: 'identifier', value: 'verify' }] }),
            );

            expect(row).toMatchObject({ id: 'ott-1' });
            await expect(db.oneTimeToken.count()).resolves.toBe(0);
        });

        it('is rolled back with the adapter transaction it runs in', async () => {
            await db.oneTimeToken.create({
                data: { id: 'ott-1', identifier: 'verify', value: 'v', expiresAt: future() },
            });

            await expect(
                adapter.transaction(async (trx) => {
                    await trx.consumeOne({ model: 'oneTimeToken', where: [{ field: 'identifier', value: 'verify' }] });
                    throw new Error('rollback');
                }),
            ).rejects.toThrow('rollback');

            await expect(db.oneTimeToken.count()).resolves.toBe(1);
        });
    });

    describe('incrementOne (#2820)', () => {
        beforeEach(async () => {
            await db.usageCounter.create({ data: { id: 'counter-1', key: 'api-key-1', remaining: 2 } });
        });

        const useOne = (a: Pick<typeof adapter, 'incrementOne'> = adapter) =>
            a.incrementOne<{ id: string; remaining: number }>({
                model: 'usageCounter',
                where: [
                    { field: 'key', value: 'api-key-1' },
                    { field: 'remaining', operator: 'gt', value: 0 },
                ],
                increment: { remaining: -1 },
                set: { lastUsedAt: new Date() },
            });

        it('decrements while the guard holds, then returns null without writing', async () => {
            const transaction = vi.spyOn(db, '$transaction');

            await expect(useOne()).resolves.toMatchObject({ id: 'counter-1', remaining: 1 });
            await expect(useOne()).resolves.toMatchObject({ id: 'counter-1', remaining: 0 });
            await expect(useOne()).resolves.toBeNull();

            const row = await db.usageCounter.findUnique({ where: { id: 'counter-1' } });
            expect(row.remaining).toBe(0);
            expect(row.lastUsedAt).toBeInstanceOf(Date);
            // the adapter's own method ran, not better-auth's generic fallback
            expect(transaction).toHaveBeenCalled();
        });

        it('never passes the guard under concurrent callers', async () => {
            const results = await Promise.all(Array.from({ length: 5 }, () => useOne()));

            expect(results.filter((r) => r !== null)).toHaveLength(2);
            await expect(db.usageCounter.findUnique({ where: { id: 'counter-1' } })).resolves.toMatchObject({
                remaining: 0,
            });
        });

        it('increments by id', async () => {
            await expect(
                adapter.incrementOne({
                    model: 'usageCounter',
                    where: [{ field: 'id', value: 'counter-1' }],
                    increment: { remaining: 3 },
                }),
            ).resolves.toMatchObject({ remaining: 5 });
        });

        it('updates only one of several rows matching a non-unique where', async () => {
            await db.usageCounter.create({ data: { id: 'counter-2', key: 'api-key-1', remaining: 2 } });

            await useOne();

            const rows = await db.usageCounter.findMany({ orderBy: { id: 'asc' } });
            expect(rows.map((r: { remaining: number }) => r.remaining).sort()).toEqual([1, 2]);
        });

        it('returns null when no row matches', async () => {
            await expect(
                adapter.incrementOne({
                    model: 'usageCounter',
                    where: [{ field: 'id', value: 'missing' }],
                    increment: { remaining: 1 },
                }),
            ).resolves.toBeNull();
        });

        it('works inside an adapter transaction and is rolled back with it', async () => {
            await expect(adapter.transaction((trx) => useOne(trx))).resolves.toMatchObject({ remaining: 1 });

            await expect(
                adapter.transaction(async (trx) => {
                    await trx.incrementOne({
                        model: 'usageCounter',
                        where: [{ field: 'id', value: 'counter-1' }],
                        increment: { remaining: -1 },
                    });
                    throw new Error('rollback');
                }),
            ).rejects.toThrow('rollback');

            await expect(db.usageCounter.findUnique({ where: { id: 'counter-1' } })).resolves.toMatchObject({
                remaining: 1,
            });
        });
    });

    describe('models with a compound id', () => {
        beforeEach(async () => {
            await db.clientGrant.create({ data: { clientId: 'client-1', userId: 'user-1', uses: 1 } });
            await db.clientGrant.create({ data: { clientId: 'client-1', userId: 'user-2', uses: 1 } });
        });

        it('consumes one row', async () => {
            await expect(
                adapter.consumeOne({ model: 'clientGrant', where: [{ field: 'userId', value: 'user-1' }] }),
            ).resolves.toMatchObject({ clientId: 'client-1', userId: 'user-1' });
            await expect(db.clientGrant.findMany()).resolves.toMatchObject([{ userId: 'user-2' }]);
        });

        it('increments one row', async () => {
            await expect(
                adapter.incrementOne({
                    model: 'clientGrant',
                    where: [{ field: 'userId', value: 'user-1' }],
                    increment: { uses: 1 },
                }),
            ).resolves.toMatchObject({ userId: 'user-1', uses: 2 });
            await expect(
                db.clientGrant.findUnique({ where: { grantKey: { clientId: 'client-1', userId: 'user-2' } } }),
            ).resolves.toMatchObject({ uses: 1 });
        });

        it('updates one row without a unique field (named compound id)', async () => {
            await expect(
                adapter.update({
                    model: 'clientGrant',
                    where: [
                        { field: 'clientId', value: 'client-1' },
                        { field: 'uses', value: 1 },
                    ],
                    update: { uses: 5 },
                }),
            ).resolves.toMatchObject({ uses: 5 });
            await expect(db.clientGrant.count({ where: { uses: 5 } })).resolves.toBe(1);
        });
    });
});
