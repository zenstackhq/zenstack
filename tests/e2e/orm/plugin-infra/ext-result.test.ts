import { definePlugin, type ClientContract } from '@zenstackhq/orm';
import { createTestClient } from '@zenstackhq/testtools';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { schema } from './ext-result/schema';

describe('Plugin extended result fields', () => {
    let db: ClientContract<typeof schema>;

    beforeEach(async () => {
        db = await createTestClient(schema);
        await db.user.deleteMany();
    });

    afterEach(async () => {
        await db?.$disconnect();
    });

    it('should compute virtual fields on findMany results', async () => {
        const extDb = db.$use({
            id: 'greeting',
            result: {
                user: {
                    greeting: {
                        needs: { name: true },
                        compute: (user) => `Hello, ${user.name}!`,
                    },
                },
            },
        });

        await extDb.user.create({ data: { name: 'Alice' } });
        await extDb.user.create({ data: { name: 'Bob' } });

        const users = await extDb.user.findMany({ orderBy: { id: 'asc' } });
        expect(users).toHaveLength(2);
        expect(users[0]!.greeting).toBe('Hello, Alice!');
        expect(users[1]!.greeting).toBe('Hello, Bob!');
    });

    it('should compute virtual fields with definePlugin on findMany results', async () => {
        const plugin = definePlugin(schema, {
            id: 'greeting',
            result: {
                user: {
                    greeting: {
                        needs: { name: true },
                        compute: (user) => `Hello, ${user.name}!`,
                    },
                },
            },
        });

        const extDb = db.$use(plugin);

        await extDb.user.create({ data: { name: 'Alice' } });
        await extDb.user.create({ data: { name: 'Bob' } });

        const users = await extDb.user.findMany({ orderBy: { id: 'asc' } });
        expect(users).toHaveLength(2);
        expect(users[0]!.greeting).toBe('Hello, Alice!');
        expect(users[1]!.greeting).toBe('Hello, Bob!');
    });

    it('should compute virtual fields on findUnique', async () => {
        const extDb = db.$use({
            id: 'greeting',
            result: {
                user: {
                    greeting: {
                        needs: { name: true },
                        compute: (user) => `Hello, ${user.name}!`,
                    },
                },
            },
        });

        const created = await extDb.user.create({ data: { name: 'Alice' } });
        expect(created.greeting).toBe('Hello, Alice!');
        const user = await extDb.user.findUnique({ where: { id: created.id } });
        expect(user?.greeting).toBe('Hello, Alice!');
    });

    it('should compute virtual fields on findFirst', async () => {
        const extDb = db.$use({
            id: 'greeting',
            result: {
                user: {
                    upperName: {
                        needs: { name: true },
                        compute: (user) => user.name.toUpperCase(),
                    },
                },
            },
        });

        await extDb.user.create({ data: { name: 'Alice' } });
        const user = await extDb.user.findFirst();
        expect(user?.upperName).toBe('ALICE');
    });

    it('should compute virtual fields on findUniqueOrThrow and findFirstOrThrow', async () => {
        const extDb = db.$use({
            id: 'greeting',
            result: {
                user: {
                    upperName: {
                        needs: { name: true },
                        compute: (user) => user.name.toUpperCase(),
                    },
                },
            },
        });

        const created = await extDb.user.create({ data: { name: 'Alice' } });
        const user1 = await extDb.user.findUniqueOrThrow({ where: { id: created.id } });
        expect(user1.upperName).toBe('ALICE');

        const user2 = await extDb.user.findFirstOrThrow();
        expect(user2.upperName).toBe('ALICE');
    });

    it('should compute virtual fields on create, update, upsert, delete', async () => {
        const extDb = db.$use({
            id: 'greeting',
            result: {
                user: {
                    upperName: {
                        needs: { name: true },
                        compute: (user) => user.name.toUpperCase(),
                    },
                },
            },
        });

        // create
        const created = await extDb.user.create({ data: { name: 'Alice' } });
        expect(created.upperName).toBe('ALICE');

        // update
        const updated = await extDb.user.update({
            where: { id: created.id },
            data: { name: 'Bob' },
        });
        expect(updated.upperName).toBe('BOB');

        // upsert
        const upserted = await extDb.user.upsert({
            where: { id: created.id },
            create: { name: 'Charlie' },
            update: { name: 'Charlie' },
        });
        expect(upserted.upperName).toBe('CHARLIE');

        // delete
        const deleted = await extDb.user.delete({ where: { id: created.id } });
        expect(deleted.upperName).toBe('CHARLIE');
    });

    it('should compute virtual fields on createManyAndReturn', async () => {
        if ((db.$schema.provider.type as string) === 'mysql') {
            // MySQL does not support createManyAndReturn
            return;
        }

        const extDb = db.$use({
            id: 'greeting',
            result: {
                user: {
                    upperName: {
                        needs: { name: true },
                        compute: (user) => user.name.toUpperCase(),
                    },
                },
            },
        });

        const users = await extDb.user.createManyAndReturn({
            data: [{ name: 'Alice' }, { name: 'Bob' }],
        });
        expect(users).toHaveLength(2);
        expect(users[0]!.upperName).toBe('ALICE');
        expect(users[1]!.upperName).toBe('BOB');
    });

    it('should NOT compute virtual fields on count, exists, createMany, updateMany, deleteMany', async () => {
        const extDb = db.$use({
            id: 'greeting',
            result: {
                user: {
                    upperName: {
                        needs: { name: true },
                        compute: (user) => user.name.toUpperCase(),
                    },
                },
            },
        });

        await extDb.user.create({ data: { name: 'Alice' } });

        const count = await extDb.user.count();
        expect(count).toBe(1);
        expect((count as any).upperName).toBeUndefined();

        const exists = await extDb.user.exists({ where: { id: 1 } });
        expect(typeof exists).toBe('boolean');

        const createManyResult = await extDb.user.createMany({ data: [{ name: 'Bob' }] });
        expect(createManyResult.count).toBe(1);
        expect((createManyResult as any).upperName).toBeUndefined();

        const updateManyResult = await extDb.user.updateMany({
            where: { name: 'Bob' },
            data: { name: 'Charlie' },
        });
        expect(updateManyResult.count).toBe(1);
        expect((updateManyResult as any).upperName).toBeUndefined();

        const deleteManyResult = await extDb.user.deleteMany({ where: { name: 'Charlie' } });
        expect(deleteManyResult.count).toBe(1);
        expect((deleteManyResult as any).upperName).toBeUndefined();
    });

    it('should compute only selected virtual fields when using select', async () => {
        const extDb = db.$use({
            id: 'greeting',
            result: {
                user: {
                    upperName: {
                        needs: { name: true },
                        compute: (user) => user.name.toUpperCase(),
                    },
                    idDoubled: {
                        needs: { id: true },
                        compute: (user) => user.id * 2,
                    },
                },
            },
        });

        await extDb.user.create({ data: { name: 'Alice' } });

        // Select only upperName — needs (name) should be injected and stripped
        const users = await extDb.user.findMany({ select: { id: true, upperName: true } });
        expect(users[0]!.upperName).toBe('ALICE');
        expect((users[0] as any).idDoubled).toBeUndefined();
        // name was injected as a need but should be stripped from the result
        expect((users[0] as any).name).toBeUndefined();
        // id was explicitly selected
        expect(users[0]!.id).toBeDefined();
    });

    it('should not compute virtual fields when not selected explicitly', async () => {
        const extDb = db.$use({
            id: 'greeting',
            result: {
                user: {
                    upperName: {
                        needs: { name: true },
                        compute: (user) => user.name.toUpperCase(),
                    },
                },
            },
        });

        await extDb.user.create({ data: { name: 'Alice' } });

        // Select only id — virtual field not selected, should not appear
        const users = await extDb.user.findMany({ select: { id: true } });
        expect(users[0]!.id).toBeDefined();
        expect((users[0] as any).upperName).toBeUndefined();
    });

    it('should exclude virtual fields when using omit', async () => {
        const extDb = db.$use({
            id: 'greeting',
            result: {
                user: {
                    upperName: {
                        needs: { name: true },
                        compute: (user) => user.name.toUpperCase(),
                    },
                },
            },
        });

        await extDb.user.create({ data: { name: 'Alice' } });

        const users = await extDb.user.findMany({ omit: { upperName: true } });
        expect(users[0]!.name).toBe('Alice');
        expect((users[0] as any).upperName).toBeUndefined();
    });

    it('should still compute virtual fields when their needs dependency is omitted', async () => {
        const extDb = db.$use({
            id: 'greeting',
            result: {
                user: {
                    upperName: {
                        needs: { name: true },
                        compute: (user) => user.name.toUpperCase(),
                    },
                },
            },
        });

        await extDb.user.create({ data: { name: 'Alice' } });

        // omit the `name` field which is a `needs` dependency of `upperName`
        const users = await extDb.user.findMany({ omit: { name: true } });
        // upperName should still be computed even though its needs dep was omitted
        expect(users[0]!.upperName).toBe('ALICE');
        // the omitted `name` field should not appear in the result
        expect((users[0] as any).name).toBeUndefined();
    });

    it('should compose virtual fields from multiple plugins', async () => {
        const plugin1 = definePlugin({
            id: 'plugin1',
            result: {
                user: {
                    upperName: {
                        needs: { name: true },
                        compute: (user) => user.name.toUpperCase(),
                    },
                },
            },
        });

        const plugin2 = definePlugin({
            id: 'plugin2',
            result: {
                user: {
                    idDoubled: {
                        needs: { id: true },
                        compute: (user) => user.id * 2,
                    },
                },
            },
        });

        const extDb = db.$use(plugin1).$use(plugin2);
        await extDb.user.create({ data: { name: 'Alice' } });

        const users = await extDb.user.findMany();
        expect(users[0]!.upperName).toBe('ALICE');
        expect(users[0]!.idDoubled).toBe(2);
    });

    it('should remove virtual fields when plugin is removed via $unuse', async () => {
        const extDb = db.$use({
            id: 'greeting',
            result: {
                user: {
                    upperName: {
                        needs: { name: true },
                        compute: (user) => user.name.toUpperCase(),
                    },
                },
            },
        });

        await extDb.user.create({ data: { name: 'Alice' } });

        const users1 = await extDb.user.findMany();
        expect(users1[0]!.upperName).toBe('ALICE');

        const plainDb = extDb.$unuse('greeting');
        const users2 = await plainDb.user.findMany();
        expect((users2[0]! as any).upperName).toBeUndefined();
    });

    it('should remove all virtual fields when $unuseAll is called', async () => {
        const extDb = db
            .$use({
                id: 'p1',
                result: {
                    user: {
                        upperName: {
                            needs: { name: true },
                            compute: (user) => user.name.toUpperCase(),
                        },
                    },
                },
            })
            .$use({
                id: 'p2',
                result: {
                    user: {
                        idDoubled: {
                            needs: { id: true },
                            compute: (user) => user.id * 2,
                        },
                    },
                },
            });

        await extDb.user.create({ data: { name: 'Alice' } });

        const users1 = await extDb.user.findMany();
        expect(users1[0]!.upperName).toBe('ALICE');
        expect(users1[0]!.idDoubled).toBe(2);

        const cleanDb = extDb.$unuseAll();
        const users2 = await cleanDb.user.findMany();
        expect((users2[0]! as any).upperName).toBeUndefined();
        expect((users2[0]! as any).idDoubled).toBeUndefined();
    });

    it('should compute virtual fields inside $transaction', async () => {
        const extDb = db.$use({
            id: 'greeting',
            result: {
                user: {
                    upperName: {
                        needs: { name: true },
                        compute: (user) => user.name.toUpperCase(),
                    },
                },
            },
        });

        await extDb.$transaction(async (tx) => {
            const created = await tx.user.create({ data: { name: 'Alice' } });
            expect(created.upperName).toBe('ALICE');

            const found = await tx.user.findFirst();
            expect(found?.upperName).toBe('ALICE');
        });
    });

    it('should accept virtual fields in select/omit via Zod validation', async () => {
        const extDb = db.$use({
            id: 'greeting',
            result: {
                user: {
                    upperName: {
                        needs: { name: true },
                        compute: (user) => user.name.toUpperCase(),
                    },
                },
            },
        });

        await extDb.user.create({ data: { name: 'Alice' } });

        // select with virtual field should not throw
        await expect(extDb.user.findMany({ select: { id: true, upperName: true } })).resolves.toBeDefined();

        // omit with virtual field should not throw
        await expect(extDb.user.findMany({ omit: { upperName: true } })).resolves.toBeDefined();
    });

    it('should handle virtual fields that depend on multiple needs', async () => {
        const extDb = db.$use({
            id: 'full-info',
            result: {
                user: {
                    fullInfo: {
                        needs: { id: true, name: true },
                        compute: (user) => `${user.id}:${user.name}`,
                    },
                },
            },
        });

        const created = await extDb.user.create({ data: { name: 'Alice' } });
        const users = await extDb.user.findMany();
        expect(users[0]!.fullInfo).toBe(`${created.id}:Alice`);
    });

    it('should inject needs and strip them when using select with virtual field', async () => {
        const extDb = db.$use({
            id: 'full-info',
            result: {
                user: {
                    fullInfo: {
                        needs: { id: true, name: true },
                        compute: (user) => `${user.id}:${user.name}`,
                    },
                },
            },
        });

        await extDb.user.create({ data: { name: 'Alice' } });

        // Select only the virtual field — needs (id, name) are injected but stripped
        const users = await extDb.user.findMany({ select: { fullInfo: true } });
        expect(users).toHaveLength(1);
        expect(users[0]!.fullInfo).toMatch(/^\d+:Alice$/);
        // id and name were injected needs — should be stripped
        expect((users[0] as any).id).toBeUndefined();
        expect((users[0] as any).name).toBeUndefined();
    });

    it('should not strip needs fields that were explicitly selected', async () => {
        const extDb = db.$use({
            id: 'full-info',
            result: {
                user: {
                    upperName: {
                        needs: { name: true },
                        compute: (user) => user.name.toUpperCase(),
                    },
                },
            },
        });

        await extDb.user.create({ data: { name: 'Alice' } });

        // Explicitly select both the virtual field and its need
        const users = await extDb.user.findMany({ select: { name: true, upperName: true } });
        expect(users).toHaveLength(1);
        expect(users[0]!.upperName).toBe('ALICE');
        // name was explicitly selected — should NOT be stripped
        expect(users[0]!.name).toBe('Alice');
    });

    it('should have correct types when select includes ext result fields', async () => {
        const extDb = db.$use({
            id: 'typing-test',
            result: {
                user: {
                    upperName: {
                        needs: { name: true },
                        compute: (user) => user.name.toUpperCase(),
                    },
                    idDoubled: {
                        needs: { id: true },
                        compute: (user) => user.id * 2,
                    },
                },
            },
        });

        await extDb.user.create({ data: { name: 'Alice' } });

        // When selecting only upperName, the result type should include upperName but not idDoubled
        const selected = await extDb.user.findMany({ select: { upperName: true } });
        const first = selected[0]!;
        // upperName should be accessible
        const _upper: string = first.upperName;
        expect(_upper).toBe('ALICE');
        // idDoubled should NOT be in the type
        // @ts-expect-error - idDoubled was not selected
        first.idDoubled;
        // id should NOT be in the type (not selected)
        // @ts-expect-error - id was not selected
        first.id;

        // When omitting upperName, idDoubled should still be present
        const omitted = await extDb.user.findMany({ omit: { upperName: true } });
        const omittedFirst = omitted[0]!;
        // idDoubled should be accessible
        const _doubled: number = omittedFirst.idDoubled;
        expect(_doubled).toBe(2);
        // upperName should NOT be in the type
        // @ts-expect-error - upperName was omitted
        omittedFirst.upperName;

        // When no select/omit, both should be present
        const all = await extDb.user.findMany();
        const allFirst = all[0]!;
        const _u: string = allFirst.upperName;
        const _d: number = allFirst.idDoubled;
        expect(_u).toBe('ALICE');
        expect(_d).toBe(2);
    });

    it('should compute ext result fields on included relations', async () => {
        const extDb = db.$use({
            id: 'post-ext',
            result: {
                post: {
                    upperTitle: {
                        needs: { title: true },
                        compute: (post) => post.title.toUpperCase(),
                    },
                },
            },
        });

        const user = await extDb.user.create({ data: { name: 'Alice' } });
        await extDb.post.create({ data: { title: 'Hello World', authorId: user.id } });
        await extDb.post.create({ data: { title: 'Second Post', authorId: user.id } });

        const users = await extDb.user.findMany({ include: { posts: true } });
        expect(users).toHaveLength(1);
        expect(users[0]!.posts).toHaveLength(2);
        expect(users[0]!.posts[0]!.upperTitle).toBe('HELLO WORLD');
        expect(users[0]!.posts[1]!.upperTitle).toBe('SECOND POST');
    });

    it('should compute ext result fields on both parent and nested relations', async () => {
        const extDb = db.$use({
            id: 'both-ext',
            result: {
                user: {
                    upperName: {
                        needs: { name: true },
                        compute: (user) => user.name.toUpperCase(),
                    },
                },
                post: {
                    upperTitle: {
                        needs: { title: true },
                        compute: (post) => post.title.toUpperCase(),
                    },
                },
            },
        });

        await extDb.user.create({ data: { name: 'Alice' } });
        await extDb.post.create({ data: { title: 'Hello', authorId: 1 } });

        const users = await extDb.user.findMany({ include: { posts: true } });
        expect(users[0]!.upperName).toBe('ALICE');
        expect(users[0]!.posts[0]!.upperTitle).toBe('HELLO');
    });

    it('should handle ext result fields on nested relations with select', async () => {
        const extDb = db.$use({
            id: 'post-ext',
            result: {
                post: {
                    upperTitle: {
                        needs: { title: true },
                        compute: (post) => post.title.toUpperCase(),
                    },
                },
            },
        });

        await extDb.user.create({ data: { name: 'Alice' } });
        await extDb.post.create({ data: { title: 'Hello', authorId: 1 } });

        // Include posts with select that includes the ext result field
        const users = await extDb.user.findMany({
            include: { posts: { select: { id: true, upperTitle: true } } },
        });
        expect(users[0]!.posts[0]!.upperTitle).toBe('HELLO');
        // title was injected as a need but should be stripped
        expect((users[0]!.posts[0]! as any).title).toBeUndefined();
        // id was explicitly selected
        expect(users[0]!.posts[0]!.id).toBeDefined();
    });

    it('should NOT compute ext result fields on nested relations when omitted', async () => {
        const extDb = db.$use({
            id: 'post-ext',
            result: {
                post: {
                    upperTitle: {
                        needs: { title: true },
                        compute: (post) => post.title.toUpperCase(),
                    },
                },
            },
        });

        await extDb.user.create({ data: { name: 'Alice' } });
        await extDb.post.create({ data: { title: 'Hello', authorId: 1 } });

        const users = await extDb.user.findMany({
            include: { posts: { omit: { upperTitle: true } } },
        });
        expect(users[0]!.posts[0]!.title).toBe('Hello');
        expect((users[0]!.posts[0]! as any).upperTitle).toBeUndefined();
    });

    it('should compute ext result fields on relations fetched via select', async () => {
        const extDb = db.$use({
            id: 'post-ext',
            result: {
                post: {
                    upperTitle: {
                        needs: { title: true },
                        compute: (post) => post.title.toUpperCase(),
                    },
                },
            },
        });

        await extDb.user.create({ data: { name: 'Alice' } });
        await extDb.post.create({ data: { title: 'Hello', authorId: 1 } });

        // Use top-level select that includes a relation
        const users = await extDb.user.findMany({
            select: { id: true, posts: true },
        });
        expect(users[0]!.posts[0]!.upperTitle).toBe('HELLO');
    });

    it('should compute ext result fields on to-one nested relations', async () => {
        const extDb = db.$use({
            id: 'user-ext',
            result: {
                user: {
                    upperName: {
                        needs: { name: true },
                        compute: (user) => user.name.toUpperCase(),
                    },
                },
            },
        });

        await extDb.user.create({ data: { name: 'Alice' } });
        await extDb.post.create({ data: { title: 'Hello', authorId: 1 } });

        // Include to-one relation (post.author)
        const posts = await extDb.post.findMany({ include: { author: true } });
        expect(posts[0]!.author.upperName).toBe('ALICE');
    });

    it('should have correct types for ext result fields on nested relations', async () => {
        const extDb = db.$use({
            id: 'nested-types',
            result: {
                user: {
                    upperName: {
                        needs: { name: true },
                        compute: (user) => user.name.toUpperCase(),
                    },
                },
                post: {
                    upperTitle: {
                        needs: { title: true },
                        compute: (post) => post.title.toUpperCase(),
                    },
                },
            },
        });

        await extDb.user.create({ data: { name: 'Alice' } });
        await extDb.post.create({ data: { title: 'Hello', authorId: 1 } });

        // include: { posts: true } — nested posts should have upperTitle in the type
        const users = await extDb.user.findMany({ include: { posts: true } });
        const post = users[0]!.posts[0]!;
        const _title: string = post.upperTitle;
        expect(_title).toBe('HELLO');

        // to-one relation — author should have upperName in the type
        const posts = await extDb.post.findMany({ include: { author: true } });
        const author = posts[0]!.author;
        const _name: string = author.upperName;
        expect(_name).toBe('ALICE');

        // Without include, nested ext result fields should not appear
        const plainUsers = await extDb.user.findMany();
        // @ts-expect-error - posts not included, so no posts property
        plainUsers[0]!.posts;
        // But top-level ext result should work
        const _topLevel: string = plainUsers[0]!.upperName;
        expect(_topLevel).toBe('ALICE');
    });

    it('should ignore invalid model names in result config at runtime', async () => {
        const extDb = db.$use({
            id: 'bad-model',
            result: {
                userr: {
                    upperName: {
                        needs: { name: true },
                        compute: (user: any) => user.name.toUpperCase(),
                    },
                },
            } as any,
        });

        await extDb.user.create({ data: { name: 'Alice' } });
        // "userr" doesn't match any model, so no ext result fields are applied
        const users = await extDb.user.findMany();
        expect(users[0]).not.toHaveProperty('upperName');
    });

    it('should reject ext result fields that shadow real model fields', async () => {
        await db.user.create({ data: { name: 'Alice' } });

        const extDb = db.$use({
            id: 'shadow',
            result: {
                user: {
                    name: {
                        needs: { id: true },
                        compute: (user: any) => `name-${user.id}`,
                    },
                },
            } as any,
        });

        await expect(extDb.user.findMany()).rejects.toThrow(/conflicts with an existing model field/);
    });

    it('should reject ext result fields with invalid needs field names', async () => {
        const extDb = db.$use({
            id: 'bad-needs',
            result: {
                user: {
                    upperName: {
                        needs: { nonExistentField: true },
                        compute: (user: any) => String(user.nonExistentField),
                    },
                },
            } as any,
        });

        await expect(extDb.user.findMany()).rejects.toThrow(/invalid need "nonExistentField"/);
    });

    it('should type-error when compute accesses a field not in needs (inline plugin)', () => {
        db.$use({
            id: 'type-check-inline',
            result: {
                user: {
                    wrongField: {
                        needs: { id: true },
                        // @ts-expect-error - name is not in needs
                        compute: (user) => `Hello, ${user.name}!`,
                    },
                },
            },
        });
    });

    it('should type-error when compute accesses a field not in needs (definePlugin)', () => {
        definePlugin(schema, {
            id: 'type-check-define',
            result: {
                user: {
                    wrongField: {
                        needs: { id: true },
                        // @ts-expect-error - name is not in needs
                        compute: (user) => `Hello, ${user.name}!`,
                    },
                },
            },
        });
    });

    it('should reject ext result fields with relation fields in needs', async () => {
        const extDb = db.$use({
            id: 'bad-needs-relation',
            result: {
                user: {
                    postCount: {
                        needs: { posts: true },
                        compute: (user: any) => String(user.posts),
                    },
                },
            } as any,
        });

        await expect(extDb.user.findMany()).rejects.toThrow(/invalid need "posts"/);
    });
});
