import { createTestClient } from '@zenstackhq/testtools';
import { describe, expect, it } from 'vitest';
import { schema } from '../schemas/omit/schema';

describe('Field omission tests', () => {
    it('respects schema-level omit', async () => {
        const db = await createTestClient(schema);
        const user = await db.user.create({
            data: { id: 1, name: 'User1', password: 'abc', posts: { create: { id: 1, title: 'Post1' } } },
        });
        // @ts-expect-error
        expect(user.password).toBeUndefined();

        const user1 = await db.user.findFirstOrThrow();
        // @ts-expect-error
        expect(user1.password).toBeUndefined();

        const userWithPosts = await db.user.findFirstOrThrow({ include: { posts: true } });
        // @ts-expect-error
        expect(userWithPosts.password).toBeUndefined();

        const user2 = await db.user.update({
            where: { id: 1 },
            data: { name: 'User2' },
        });

        // @ts-expect-error
        expect(user2.password).toBeUndefined();

        const data = await db.post.findFirstOrThrow({ include: { author: true } });
        // @ts-expect-error
        expect(data.author.password).toBeUndefined();

        const user3 = await db.user.delete({ where: { id: 1 } });
        // @ts-expect-error
        expect(user3.password).toBeUndefined();
    });

    it('respects client omit options', async () => {
        const options = { omit: { user: { name: true } }, dialect: {} as any } as const;
        const db = await createTestClient<typeof schema, typeof options>(schema, options);

        const user = await db.user.create({
            data: {
                id: 1,
                name: 'User1',
                password: 'abc',
                posts: { create: { id: 1, title: 'Post1' } },
            },
        });

        // inherited omit from schema
        // @ts-expect-error
        expect(user.password).toBeUndefined();

        // options-level omit
        // @ts-expect-error
        expect(user.name).toBeUndefined();

        const post = await db.post.findFirstOrThrow({ include: { author: true } });
        // @ts-expect-error
        expect(post.author.password).toBeUndefined();
        // @ts-expect-error
        expect(post.author.name).toBeUndefined();
    });

    it('allows override at query options level', async () => {
        // override schema-level omit
        const options = { omit: { user: { password: false } }, dialect: {} as any } as const;
        const db = await createTestClient<typeof schema, typeof options>(schema, options);
        const user1 = await db.user.create({
            data: {
                id: 1,
                name: 'User1',
                password: 'abc',
            },
        });
        expect(user1.password).toBeTruthy();
    });

    it('respects query-level omit', async () => {
        const db = await createTestClient(schema);
        const user = await db.user.create({
            data: { id: 1, name: 'User1', password: 'abc', posts: { create: { id: 1, title: 'Post1' } } },
            omit: { password: false },
        });
        expect(user.password).toBeTruthy();

        const user1 = await db.user.findFirstOrThrow({ omit: { password: false } });
        expect(user1.password).toBeTruthy();

        const user11 = await db.user.findFirstOrThrow({ omit: { name: true } });
        // @ts-expect-error
        expect(user11.name).toBeUndefined();

        const user2 = await db.user.findFirstOrThrow({ omit: { password: true } });
        // @ts-expect-error
        expect(user2.password).toBeUndefined();

        // override schema-level omit
        const user3 = await db.user.update({
            where: { id: 1 },
            data: { name: 'User2' },
            omit: { password: false },
        });
        expect(user3.password).toBeTruthy();

        const data = await db.post.findFirstOrThrow({ include: { author: { omit: { password: false } } } });
        expect(data.author.password).toBeTruthy();

        const user4 = await db.user.delete({ where: { id: 1 }, omit: { password: false } });
        expect(user4.password).toBeTruthy();
    });

    it('allows override at query level', async () => {
        // override options-level omit
        const options = { omit: { user: { name: true } }, dialect: {} as any } as const;
        const db = await createTestClient<typeof schema, typeof options>(schema, options);
        const user5 = await db.user.create({
            data: { id: 2, name: 'User2', password: 'abc' },
        });
        // @ts-expect-error
        expect(user5.name).toBeUndefined();
        const user6 = await db.user.findFirstOrThrow({ omit: { name: false } });
        expect(user6.name).toBeTruthy();
    });

    it('works with delegate models', async () => {
        const db = await createTestClient(schema);
        const sub = await db.sub.create({
            data: { id: 1, title: 'Sub1', content: 'Foo' },
        });
        // @ts-expect-error
        expect(sub.content).toBeUndefined();

        const read = await db.sub.findFirstOrThrow();
        // @ts-expect-error
        expect(read.content).toBeUndefined();

        const read1 = await db.sub.findFirstOrThrow({ omit: { content: false } });
        expect(read1.content).toBe('Foo');
    });

    it('respects query-level omit override settings', async () => {
        const base = await createTestClient(schema);
        const db = base.$setOptions({ ...base.$options, allowQueryTimeOmitOverride: false });
        await expect(
            db.user.create({
                data: { id: 1, name: 'User1', password: 'abc' },
                omit: { password: false },
            }),
        ).toBeRejectedByValidation();

        await db.user.create({ data: { id: 1, name: 'User1', password: 'abc' } });
        await expect(db.user.findFirstOrThrow({ omit: { password: false } })).toBeRejectedByValidation();

        // allow set omit as true
        const user = await db.user.findFirstOrThrow({ omit: { name: true } });
        // @ts-expect-error
        expect(user.name).toBeUndefined();
    });
});
