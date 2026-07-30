import { createTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';

// https://github.com/zenstackhq/zenstack/issues/2773
//
// `QueryNameMapper` is derived purely from the client's `$schema` and `$options`, but it was rebuilt
// for every derived executor/client. Building it is O(models x fields), plus an O(models x relations)
// pass on postgres, so on a large schema every `$transaction` paid that cost twice - once when
// `$transaction` derives a client, and once when the query derives a connection-scoped executor.
//
// These assert the invariant (the mapper is not rebuilt) rather than elapsed time, which would be
// both flaky and only an indirect proxy for it.

const schema = `
model Post {
    id    Int    @id @default(autoincrement())
    title String @map("post_title")

    @@map("posts_table")
}
`;

// Note: inside a transaction `$qb.getExecutor()` is kysely's own wrapping executor, so we read the
// ZenStack executor the client itself was built with. We read the underlying field rather than the
// accessor so that these assertions fail on a mapper-identity mismatch - the actual defect - rather
// than on a missing method.
function nameMapperOf(client: any) {
    return client.kyselyProps.executor.nameMapper;
}

describe('Regression for issue #2773', () => {
    it('reuses the name mapper for the client derived by $transaction', async () => {
        const db = await createTestClient(schema, { provider: 'postgresql' });
        const mapper = nameMapperOf(db);
        expect(mapper).toBeDefined();

        await db.$transaction(async (tx: any) => {
            expect(nameMapperOf(tx)).toBe(mapper);
        });
    });

    it('reuses the name mapper for connection-scoped and plugin-derived executors', async () => {
        const db = await createTestClient(schema, { provider: 'postgresql' });
        const executor = (db as any).kyselyProps.executor;
        const mapper = executor.nameMapper;
        expect(mapper).toBeDefined();

        expect(executor.withoutPlugins().nameMapper).toBe(mapper);
        expect(executor.withPlugin({}).nameMapper).toBe(mapper);
        expect(executor.withPluginAtFront({}).nameMapper).toBe(mapper);
        expect(executor.withPlugins([{}]).nameMapper).toBe(mapper);
        expect(executor.withConnectionProvider(executor.connectionProvider).nameMapper).toBe(mapper);
    });

    it('still builds a mapper for a client derived with different options', async () => {
        const db = await createTestClient(schema, { provider: 'postgresql' });
        const mapper = nameMapperOf(db);

        // `$use` derives a client with a NEW options object, and the mapper's dialect is built from
        // options - so this one must not inherit the existing mapper.
        const derived = db.$use({ id: 'noop', name: 'noop' } as any);
        expect(nameMapperOf(derived)).toBeDefined();
        expect(nameMapperOf(derived)).not.toBe(mapper);
    });

    it('applies @@map and @map identically inside and outside a transaction', async () => {
        const db = await createTestClient(schema, { provider: 'postgresql' });
        await db.post.create({ data: { title: 'hello' } });

        const outside = await db.post.findMany();
        expect(outside).toHaveLength(1);
        expect(outside[0].title).toBe('hello');

        const inside = await db.$transaction(async (tx: any) => tx.post.findMany());
        expect(inside).toEqual(outside);

        // the mapped table/column really are what the mapper produced
        const raw = await db.$qb
            .selectFrom('posts_table' as any)
            .selectAll()
            .execute();
        expect(raw).toHaveLength(1);
        expect((raw[0] as any).post_title).toBe('hello');
    });
});
