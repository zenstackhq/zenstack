import { describe, expect, it, vi } from 'vitest';
import { NestedWriteVisitor, type NestedWriteVisitorContext } from '../src/nested-write-visitor';
import { createField, createRelationField, createSchema } from './test-helpers';

describe('NestedWriteVisitor tests', () => {
    describe('create action', () => {
        it('visits create with simple data', async () => {
            const schema = createSchema({
                User: {
                    name: 'User',
                    fields: {
                        id: createField('id', 'String'),
                        name: createField('name', 'String'),
                    },
                    uniqueFields: {},
                    idFields: ['id'],
                },
            });

            const createCallback = vi.fn();
            const visitor = new NestedWriteVisitor(schema, { create: createCallback });

            await visitor.visit('User', 'create', {
                data: { name: 'Alice' },
            });

            expect(createCallback).toHaveBeenCalledTimes(1);
            expect(createCallback).toHaveBeenCalledWith(
                'User',
                { name: 'Alice' },
                expect.objectContaining({
                    parent: undefined,
                    field: undefined,
                }),
            );
        });

        it('visits nested create in relation', async () => {
            const schema = createSchema({
                User: {
                    name: 'User',
                    fields: {
                        id: createField('id', 'String'),
                        posts: createRelationField('posts', 'Post'),
                    },
                    uniqueFields: {},
                    idFields: ['id'],
                },
                Post: {
                    name: 'Post',
                    fields: {
                        id: createField('id', 'String'),
                        title: createField('title', 'String'),
                    },
                    uniqueFields: {},
                    idFields: ['id'],
                },
            });

            const createCallback = vi.fn();
            const visitor = new NestedWriteVisitor(schema, { create: createCallback });

            await visitor.visit('User', 'create', {
                data: {
                    name: 'Alice',
                    posts: {
                        create: { title: 'First Post' },
                    },
                },
            });

            expect(createCallback).toHaveBeenCalledTimes(2);
            expect(createCallback).toHaveBeenNthCalledWith(1, 'User', expect.any(Object), expect.any(Object));
            expect(createCallback).toHaveBeenNthCalledWith(2, 'Post', { title: 'First Post' }, expect.any(Object));
        });

        it('visits create with array data', async () => {
            const schema = createSchema({
                Post: {
                    name: 'Post',
                    fields: {
                        id: createField('id', 'String'),
                        comments: createRelationField('comments', 'Comment'),
                    },
                    uniqueFields: {},
                    idFields: ['id'],
                },
                Comment: {
                    name: 'Comment',
                    fields: {
                        id: createField('id', 'String'),
                        text: createField('text', 'String'),
                    },
                    uniqueFields: {},
                    idFields: ['id'],
                },
            });

            const createCallback = vi.fn();
            const visitor = new NestedWriteVisitor(schema, { create: createCallback });

            await visitor.visit('Post', 'create', {
                data: {
                    title: 'My Post',
                    comments: {
                        create: [{ text: 'Comment 1' }, { text: 'Comment 2' }],
                    },
                },
            });

            expect(createCallback).toHaveBeenCalledTimes(3); // 1 post + 2 comments
            expect(createCallback).toHaveBeenNthCalledWith(3, 'Comment', { text: 'Comment 1' }, expect.any(Object));
            expect(createCallback).toHaveBeenNthCalledWith(2, 'Comment', { text: 'Comment 2' }, expect.any(Object));
        });

        it('stops visiting when callback returns false', async () => {
            const schema = createSchema({
                User: {
                    name: 'User',
                    fields: {
                        id: createField('id', 'String'),
                        posts: createRelationField('posts', 'Post'),
                    },
                    uniqueFields: {},
                    idFields: ['id'],
                },
                Post: {
                    name: 'Post',
                    fields: {
                        id: createField('id', 'String'),
                        title: createField('title', 'String'),
                    },
                    uniqueFields: {},
                    idFields: ['id'],
                },
            });

            const createCallback = vi.fn(() => false);
            const visitor = new NestedWriteVisitor(schema, { create: createCallback });

            await visitor.visit('User', 'create', {
                data: {
                    name: 'Alice',
                    posts: {
                        create: { title: 'First Post' },
                    },
                },
            });

            // Should only visit User, not the nested post
            expect(createCallback).toHaveBeenCalledTimes(1);
        });

        it('allows callback to replace payload', async () => {
            const schema = createSchema({
                User: {
                    name: 'User',
                    fields: {
                        id: createField('id', 'String'),
                        name: createField('name', 'String'),
                    },
                    uniqueFields: {},
                    idFields: ['id'],
                },
            });

            const fieldCallback = vi.fn();
            const createCallback = vi.fn(() => ({ name: 'Bob' }));
            const visitor = new NestedWriteVisitor(schema, { create: createCallback, field: fieldCallback });

            await visitor.visit('User', 'create', {
                data: { name: 'Alice' },
            });

            // Field callback should see the replaced payload
            expect(fieldCallback).toHaveBeenCalledWith(
                expect.objectContaining({ name: 'name' }),
                'create',
                'Bob',
                expect.any(Object),
            );
        });
    });

    describe('createMany action', () => {
        it('visits createMany with data array', async () => {
            const schema = createSchema({
                User: {
                    name: 'User',
                    fields: {
                        id: createField('id', 'String'),
                        name: createField('name', 'String'),
                    },
                    uniqueFields: {},
                    idFields: ['id'],
                },
            });

            const createManyCallback = vi.fn();
            const visitor = new NestedWriteVisitor(schema, { createMany: createManyCallback });

            await visitor.visit('User', 'createMany', {
                data: [{ name: 'Alice' }, { name: 'Bob' }],
                skipDuplicates: true,
            });

            expect(createManyCallback).toHaveBeenCalledTimes(1);
            expect(createManyCallback).toHaveBeenCalledWith(
                'User',
                { data: [{ name: 'Alice' }, { name: 'Bob' }], skipDuplicates: true },
                expect.any(Object),
            );
        });
    });

    describe('update action', () => {
        it('visits update with simple data', async () => {
            const schema = createSchema({
                User: {
                    name: 'User',
                    fields: {
                        id: createField('id', 'String'),
                        name: createField('name', 'String'),
                    },
                    uniqueFields: {},
                    idFields: ['id'],
                },
            });

            const updateCallback = vi.fn();
            const visitor = new NestedWriteVisitor(schema, { update: updateCallback });

            await visitor.visit('User', 'update', {
                where: { id: '1' },
                data: { name: 'Updated' },
            });

            expect(updateCallback).toHaveBeenCalledTimes(1);
            expect(updateCallback).toHaveBeenCalledWith(
                'User',
                { where: { id: '1' }, data: { name: 'Updated' } },
                expect.any(Object),
            );
        });

        it('visits nested update in relation', async () => {
            const schema = createSchema({
                User: {
                    name: 'User',
                    fields: {
                        id: createField('id', 'String'),
                        posts: createRelationField('posts', 'Post'),
                    },
                    uniqueFields: {},
                    idFields: ['id'],
                },
                Post: {
                    name: 'Post',
                    fields: {
                        id: createField('id', 'String'),
                        title: createField('title', 'String'),
                    },
                    uniqueFields: {},
                    idFields: ['id'],
                },
            });

            const updateCallback = vi.fn();
            const visitor = new NestedWriteVisitor(schema, { update: updateCallback });

            await visitor.visit('User', 'update', {
                where: { id: '1' },
                data: {
                    posts: {
                        update: {
                            where: { id: 'p1' },
                            data: { title: 'Updated Title' },
                        },
                    },
                },
            });

            expect(updateCallback).toHaveBeenCalledTimes(2);
            expect(updateCallback).toHaveBeenNthCalledWith(2, 'Post', expect.any(Object), expect.any(Object));
        });

        it('visits update with array', async () => {
            const schema = createSchema({
                User: {
                    name: 'User',
                    fields: {
                        id: createField('id', 'String'),
                        posts: createRelationField('posts', 'Post'),
                    },
                    uniqueFields: {},
                    idFields: ['id'],
                },
                Post: {
                    name: 'Post',
                    fields: {
                        id: createField('id', 'String'),
                        title: createField('title', 'String'),
                    },
                    uniqueFields: {},
                    idFields: ['id'],
                },
            });

            const updateCallback = vi.fn();
            const visitor = new NestedWriteVisitor(schema, { update: updateCallback });

            await visitor.visit('User', 'update', {
                where: { id: '1' },
                data: {
                    posts: {
                        update: [
                            { where: { id: 'p1' }, data: { title: 'Title 1' } },
                            { where: { id: 'p2' }, data: { title: 'Title 2' } },
                        ],
                    },
                },
            });

            expect(updateCallback).toHaveBeenCalledTimes(3); // 1 user + 2 posts
        });
    });

    describe('updateMany action', () => {
        it('visits updateMany', async () => {
            const schema = createSchema({
                User: {
                    name: 'User',
                    fields: {
                        id: createField('id', 'String'),
                        active: createField('active', 'Boolean'),
                    },
                    uniqueFields: {},
                    idFields: ['id'],
                },
            });

            const updateManyCallback = vi.fn();
            const visitor = new NestedWriteVisitor(schema, { updateMany: updateManyCallback });

            await visitor.visit('User', 'updateMany', {
                where: { active: false },
                data: { active: true },
            });

            expect(updateManyCallback).toHaveBeenCalledTimes(1);
            expect(updateManyCallback).toHaveBeenCalledWith(
                'User',
                { where: { active: false }, data: { active: true } },
                expect.any(Object),
            );
        });
    });

    describe('upsert action', () => {
        it('visits upsert with create and update', async () => {
            const schema = createSchema({
                User: {
                    name: 'User',
                    fields: {
                        id: createField('id', 'String'),
                        name: createField('name', 'String'),
                    },
                    uniqueFields: {},
                    idFields: ['id'],
                },
            });

            const upsertCallback = vi.fn();
            const visitor = new NestedWriteVisitor(schema, { upsert: upsertCallback });

            await visitor.visit('User', 'upsert', {
                where: { id: '1' },
                create: { name: 'Alice' },
                update: { name: 'Updated Alice' },
            });

            expect(upsertCallback).toHaveBeenCalledTimes(1);
            expect(upsertCallback).toHaveBeenCalledWith(
                'User',
                {
                    where: { id: '1' },
                    create: { name: 'Alice' },
                    update: { name: 'Updated Alice' },
                },
                expect.any(Object),
            );
        });

        it('visits nested upsert in relation', async () => {
            const schema = createSchema({
                User: {
                    name: 'User',
                    fields: {
                        id: createField('id', 'String'),
                        profile: createRelationField('profile', 'Profile'),
                    },
                    uniqueFields: {},
                    idFields: ['id'],
                },
                Profile: {
                    name: 'Profile',
                    fields: {
                        id: createField('id', 'String'),
                        bio: createField('bio', 'String'),
                    },
                    uniqueFields: {},
                    idFields: ['id'],
                },
            });

            const upsertCallback = vi.fn();
            const visitor = new NestedWriteVisitor(schema, { upsert: upsertCallback });

            await visitor.visit('User', 'update', {
                where: { id: '1' },
                data: {
                    profile: {
                        upsert: {
                            where: { id: 'p1' },
                            create: { bio: 'New bio' },
                            update: { bio: 'Updated bio' },
                        },
                    },
                },
            });

            expect(upsertCallback).toHaveBeenCalledWith('Profile', expect.any(Object), expect.any(Object));
        });
    });

    describe('connect action', () => {
        it('visits connect with unique filter', async () => {
            const schema = createSchema({
                User: {
                    name: 'User',
                    fields: {
                        id: createField('id', 'String'),
                        posts: createRelationField('posts', 'Post'),
                    },
                    uniqueFields: {},
                    idFields: ['id'],
                },
                Post: {
                    name: 'Post',
                    fields: {
                        id: createField('id', 'String'),
                    },
                    uniqueFields: {},
                    idFields: ['id'],
                },
            });

            const connectCallback = vi.fn();
            const visitor = new NestedWriteVisitor(schema, { connect: connectCallback });

            await visitor.visit('User', 'update', {
                where: { id: '1' },
                data: {
                    posts: {
                        connect: { id: 'p1' },
                    },
                },
            });

            expect(connectCallback).toHaveBeenCalledTimes(1);
            expect(connectCallback).toHaveBeenCalledWith('Post', { id: 'p1' }, expect.any(Object));
        });

        it('visits connect with array', async () => {
            const schema = createSchema({
                User: {
                    name: 'User',
                    fields: {
                        id: createField('id', 'String'),
                        posts: createRelationField('posts', 'Post'),
                    },
                    uniqueFields: {},
                    idFields: ['id'],
                },
                Post: {
                    name: 'Post',
                    fields: {
                        id: createField('id', 'String'),
                    },
                    uniqueFields: {},
                    idFields: ['id'],
                },
            });

            const connectCallback = vi.fn();
            const visitor = new NestedWriteVisitor(schema, { connect: connectCallback });

            await visitor.visit('User', 'update', {
                where: { id: '1' },
                data: {
                    posts: {
                        connect: [{ id: 'p1' }, { id: 'p2' }],
                    },
                },
            });

            expect(connectCallback).toHaveBeenCalledTimes(2);
        });
    });

    describe('disconnect action', () => {
        it('visits disconnect with unique filter (to-many)', async () => {
            const schema = createSchema({
                User: {
                    name: 'User',
                    fields: {
                        id: createField('id', 'String'),
                        posts: createRelationField('posts', 'Post'),
                    },
                    uniqueFields: {},
                    idFields: ['id'],
                },
                Post: {
                    name: 'Post',
                    fields: {
                        id: createField('id', 'String'),
                    },
                    uniqueFields: {},
                    idFields: ['id'],
                },
            });

            const disconnectCallback = vi.fn();
            const visitor = new NestedWriteVisitor(schema, { disconnect: disconnectCallback });

            await visitor.visit('User', 'update', {
                where: { id: '1' },
                data: {
                    posts: {
                        disconnect: { id: 'p1' },
                    },
                },
            });

            expect(disconnectCallback).toHaveBeenCalledTimes(1);
            expect(disconnectCallback).toHaveBeenCalledWith('Post', { id: 'p1' }, expect.any(Object));
        });

        it('visits disconnect with boolean (to-one)', async () => {
            const schema = createSchema({
                User: {
                    name: 'User',
                    fields: {
                        id: createField('id', 'String'),
                        profile: createRelationField('profile', 'Profile', true),
                    },
                    uniqueFields: {},
                    idFields: ['id'],
                },
                Profile: {
                    name: 'Profile',
                    fields: {
                        id: createField('id', 'String'),
                    },
                    uniqueFields: {},
                    idFields: ['id'],
                },
            });

            const disconnectCallback = vi.fn();
            const visitor = new NestedWriteVisitor(schema, { disconnect: disconnectCallback });

            await visitor.visit('User', 'update', {
                where: { id: '1' },
                data: {
                    profile: {
                        disconnect: true,
                    },
                },
            });

            expect(disconnectCallback).toHaveBeenCalledTimes(1);
            expect(disconnectCallback).toHaveBeenCalledWith('Profile', true, expect.any(Object));
        });
    });

    describe('set action', () => {
        it('visits set with unique filters', async () => {
            const schema = createSchema({
                User: {
                    name: 'User',
                    fields: {
                        id: createField('id', 'String'),
                        posts: createRelationField('posts', 'Post'),
                    },
                    uniqueFields: {},
                    idFields: ['id'],
                },
                Post: {
                    name: 'Post',
                    fields: {
                        id: createField('id', 'String'),
                    },
                    uniqueFields: {},
                    idFields: ['id'],
                },
            });

            const setCallback = vi.fn();
            const visitor = new NestedWriteVisitor(schema, { set: setCallback });

            await visitor.visit('User', 'update', {
                where: { id: '1' },
                data: {
                    posts: {
                        set: [{ id: 'p1' }, { id: 'p2' }],
                    },
                },
            });

            expect(setCallback).toHaveBeenCalledTimes(2);
        });
    });

    describe('delete action', () => {
        it('visits delete with where clause', async () => {
            const schema = createSchema({
                User: {
                    name: 'User',
                    fields: {
                        id: createField('id', 'String'),
                    },
                    uniqueFields: {},
                    idFields: ['id'],
                },
            });

            const deleteCallback = vi.fn();
            const visitor = new NestedWriteVisitor(schema, { delete: deleteCallback });

            await visitor.visit('User', 'delete', {
                where: { id: '1' },
            });

            expect(deleteCallback).toHaveBeenCalledTimes(1);
            // For top-level delete, the callback receives the full args object including where
            expect(deleteCallback).toHaveBeenCalledWith('User', { id: '1' }, expect.any(Object));
        });

        it('visits nested delete in relation', async () => {
            const schema = createSchema({
                User: {
                    name: 'User',
                    fields: {
                        id: createField('id', 'String'),
                        posts: createRelationField('posts', 'Post'),
                    },
                    uniqueFields: {},
                    idFields: ['id'],
                },
                Post: {
                    name: 'Post',
                    fields: {
                        id: createField('id', 'String'),
                    },
                    uniqueFields: {},
                    idFields: ['id'],
                },
            });

            const deleteCallback = vi.fn();
            const visitor = new NestedWriteVisitor(schema, { delete: deleteCallback });

            await visitor.visit('User', 'update', {
                where: { id: '1' },
                data: {
                    posts: {
                        delete: { id: 'p1' },
                    },
                },
            });

            expect(deleteCallback).toHaveBeenCalledTimes(1);
            expect(deleteCallback).toHaveBeenCalledWith('Post', { id: 'p1' }, expect.any(Object));
        });
    });

    describe('deleteMany action', () => {
        it('visits deleteMany with where clause', async () => {
            const schema = createSchema({
                User: {
                    name: 'User',
                    fields: {
                        id: createField('id', 'String'),
                        active: createField('active', 'Boolean'),
                    },
                    uniqueFields: {},
                    idFields: ['id'],
                },
            });

            const deleteManyCallback = vi.fn();
            const visitor = new NestedWriteVisitor(schema, { deleteMany: deleteManyCallback });

            await visitor.visit('User', 'deleteMany', {
                where: { active: false },
            });

            expect(deleteManyCallback).toHaveBeenCalledTimes(1);
            // For top-level deleteMany, the callback receives the where clause directly
            expect(deleteManyCallback).toHaveBeenCalledWith('User', { active: false }, expect.any(Object));
        });
    });

    describe('connectOrCreate action', () => {
        it('visits connectOrCreate with where and create', async () => {
            const schema = createSchema({
                User: {
                    name: 'User',
                    fields: {
                        id: createField('id', 'String'),
                        posts: createRelationField('posts', 'Post'),
                    },
                    uniqueFields: {},
                    idFields: ['id'],
                },
                Post: {
                    name: 'Post',
                    fields: {
                        id: createField('id', 'String'),
                        title: createField('title', 'String'),
                    },
                    uniqueFields: {},
                    idFields: ['id'],
                },
            });

            const connectOrCreateCallback = vi.fn();
            const visitor = new NestedWriteVisitor(schema, { connectOrCreate: connectOrCreateCallback });

            await visitor.visit('User', 'update', {
                where: { id: '1' },
                data: {
                    posts: {
                        connectOrCreate: {
                            where: { id: 'p1' },
                            create: { title: 'New Post' },
                        },
                    },
                },
            });

            expect(connectOrCreateCallback).toHaveBeenCalledTimes(1);
            expect(connectOrCreateCallback).toHaveBeenCalledWith(
                'Post',
                { where: { id: 'p1' }, create: { title: 'New Post' } },
                expect.any(Object),
            );
        });
    });

    describe('field callback', () => {
        it('visits scalar fields during create', async () => {
            const schema = createSchema({
                User: {
                    name: 'User',
                    fields: {
                        id: createField('id', 'String'),
                        name: createField('name', 'String'),
                        email: createField('email', 'String'),
                    },
                    uniqueFields: {},
                    idFields: ['id'],
                },
            });

            const fieldCallback = vi.fn();
            const visitor = new NestedWriteVisitor(schema, { field: fieldCallback });

            await visitor.visit('User', 'create', {
                data: {
                    name: 'Alice',
                    email: 'alice@example.com',
                },
            });

            expect(fieldCallback).toHaveBeenCalledTimes(2);
            expect(fieldCallback).toHaveBeenCalledWith(
                expect.objectContaining({ name: 'name' }),
                'create',
                'Alice',
                expect.any(Object),
            );
            expect(fieldCallback).toHaveBeenCalledWith(
                expect.objectContaining({ name: 'email' }),
                'create',
                'alice@example.com',
                expect.any(Object),
            );
        });

        it('visits scalar fields during update', async () => {
            const schema = createSchema({
                User: {
                    name: 'User',
                    fields: {
                        id: createField('id', 'String'),
                        name: createField('name', 'String'),
                    },
                    uniqueFields: {},
                    idFields: ['id'],
                },
            });

            const fieldCallback = vi.fn();
            const visitor = new NestedWriteVisitor(schema, { field: fieldCallback });

            await visitor.visit('User', 'update', {
                where: { id: '1' },
                data: { name: 'Updated Name' },
            });

            expect(fieldCallback).toHaveBeenCalledWith(
                expect.objectContaining({ name: 'name' }),
                'update',
                'Updated Name',
                expect.any(Object),
            );
        });

        it('provides correct parent in context', async () => {
            const schema = createSchema({
                User: {
                    name: 'User',
                    fields: {
                        id: createField('id', 'String'),
                        name: createField('name', 'String'),
                    },
                    uniqueFields: {},
                    idFields: ['id'],
                },
            });

            const fieldCallback = vi.fn();
            const visitor = new NestedWriteVisitor(schema, { field: fieldCallback });

            const data = { name: 'Alice' };
            await visitor.visit('User', 'create', { data });

            expect(fieldCallback).toHaveBeenCalledWith(
                expect.anything(),
                'create',
                'Alice',
                expect.objectContaining({ parent: data }),
            );
        });
    });

    describe('context and nesting path', () => {
        it('builds nesting path correctly', async () => {
            const schema = createSchema({
                User: {
                    name: 'User',
                    fields: {
                        id: createField('id', 'String'),
                        posts: createRelationField('posts', 'Post'),
                    },
                    uniqueFields: {},
                    idFields: ['id'],
                },
                Post: {
                    name: 'Post',
                    fields: {
                        id: createField('id', 'String'),
                        comments: createRelationField('comments', 'Comment'),
                    },
                    uniqueFields: {},
                    idFields: ['id'],
                },
                Comment: {
                    name: 'Comment',
                    fields: {
                        id: createField('id', 'String'),
                        text: createField('text', 'String'),
                    },
                    uniqueFields: {},
                    idFields: ['id'],
                },
            });

            let commentContext: NestedWriteVisitorContext | undefined;
            const createCallback = vi.fn((model, _data, context) => {
                if (model === 'Comment') {
                    commentContext = context;
                }
            });

            const visitor = new NestedWriteVisitor(schema, { create: createCallback });

            await visitor.visit('User', 'create', {
                data: {
                    name: 'Alice',
                    posts: {
                        create: {
                            title: 'Post',
                            comments: {
                                create: { text: 'Comment' },
                            },
                        },
                    },
                },
            });

            expect(commentContext).toBeDefined();
            expect(commentContext!.nestingPath).toHaveLength(3);
            expect(commentContext!.nestingPath[0]?.model).toBe('User');
            expect(commentContext!.nestingPath[1]?.model).toBe('Post');
            expect(commentContext!.nestingPath[2]?.model).toBe('Comment');
        });

        it('includes field in nesting path', async () => {
            const schema = createSchema({
                User: {
                    name: 'User',
                    fields: {
                        id: createField('id', 'String'),
                        posts: createRelationField('posts', 'Post'),
                    },
                    uniqueFields: {},
                    idFields: ['id'],
                },
                Post: {
                    name: 'Post',
                    fields: {
                        id: createField('id', 'String'),
                        title: createField('title', 'String'),
                    },
                    uniqueFields: {},
                    idFields: ['id'],
                },
            });

            let postContext: NestedWriteVisitorContext | undefined;
            const createCallback = vi.fn((model, _data, context) => {
                if (model === 'Post') {
                    postContext = context;
                }
            });

            const visitor = new NestedWriteVisitor(schema, { create: createCallback });

            await visitor.visit('User', 'create', {
                data: {
                    posts: {
                        create: { title: 'Post' },
                    },
                },
            });

            expect(postContext).toBeDefined();
            expect(postContext!.field).toBeDefined();
            expect(postContext!.field?.name).toBe('posts');
        });

        it('includes where clause in nesting path for update', async () => {
            const schema = createSchema({
                User: {
                    name: 'User',
                    fields: {
                        id: createField('id', 'String'),
                        posts: createRelationField('posts', 'Post'),
                    },
                    uniqueFields: {},
                    idFields: ['id'],
                },
                Post: {
                    name: 'Post',
                    fields: {
                        id: createField('id', 'String'),
                        title: createField('title', 'String'),
                    },
                    uniqueFields: {},
                    idFields: ['id'],
                },
            });

            let postContext: NestedWriteVisitorContext | undefined;
            const updateCallback = vi.fn((model, _args, context) => {
                if (model === 'Post') {
                    postContext = context;
                }
            });

            const visitor = new NestedWriteVisitor(schema, { update: updateCallback });

            await visitor.visit('User', 'update', {
                where: { id: '1' },
                data: {
                    posts: {
                        update: {
                            where: { id: 'p1' },
                            data: { title: 'Updated' },
                        },
                    },
                },
            });

            expect(postContext).toBeDefined();
            expect(postContext!.nestingPath).toHaveLength(2);
            expect(postContext!.nestingPath[1]?.where).toEqual({ id: 'p1' });
        });
    });

    describe('edge cases', () => {
        it('handles null args gracefully', async () => {
            const schema = createSchema({
                User: {
                    name: 'User',
                    fields: {
                        id: createField('id', 'String'),
                    },
                    uniqueFields: {},
                    idFields: ['id'],
                },
            });

            const createCallback = vi.fn();
            const visitor = new NestedWriteVisitor(schema, { create: createCallback });

            await visitor.visit('User', 'create', null);

            expect(createCallback).not.toHaveBeenCalled();
        });

        it('handles undefined args gracefully', async () => {
            const schema = createSchema({
                User: {
                    name: 'User',
                    fields: {
                        id: createField('id', 'String'),
                    },
                    uniqueFields: {},
                    idFields: ['id'],
                },
            });

            const createCallback = vi.fn();
            const visitor = new NestedWriteVisitor(schema, { create: createCallback });

            await visitor.visit('User', 'create', undefined);

            expect(createCallback).not.toHaveBeenCalled();
        });

        it('handles fields not in schema gracefully', async () => {
            const schema = createSchema({
                User: {
                    name: 'User',
                    fields: {
                        id: createField('id', 'String'),
                    },
                    uniqueFields: {},
                    idFields: ['id'],
                },
            });

            const fieldCallback = vi.fn();
            const visitor = new NestedWriteVisitor(schema, { field: fieldCallback });

            await visitor.visit('User', 'create', {
                data: {
                    nonExistentField: 'value',
                },
            });

            // Should not visit non-existent field
            expect(fieldCallback).not.toHaveBeenCalled();
        });

        it('handles visitor with no callbacks', async () => {
            const schema = createSchema({
                User: {
                    name: 'User',
                    fields: {
                        id: createField('id', 'String'),
                    },
                    uniqueFields: {},
                    idFields: ['id'],
                },
            });

            const visitor = new NestedWriteVisitor(schema, {});

            await expect(
                visitor.visit('User', 'create', {
                    data: { name: 'Alice' },
                }),
            ).resolves.not.toThrow();
        });
    });

    describe('complex real-world scenarios', () => {
        it('handles deeply nested create operations', async () => {
            const schema = createSchema({
                User: {
                    name: 'User',
                    fields: {
                        id: createField('id', 'String'),
                        name: createField('name', 'String'),
                        posts: createRelationField('posts', 'Post'),
                    },
                    uniqueFields: {},
                    idFields: ['id'],
                },
                Post: {
                    name: 'Post',
                    fields: {
                        id: createField('id', 'String'),
                        title: createField('title', 'String'),
                        comments: createRelationField('comments', 'Comment'),
                    },
                    uniqueFields: {},
                    idFields: ['id'],
                },
                Comment: {
                    name: 'Comment',
                    fields: {
                        id: createField('id', 'String'),
                        text: createField('text', 'String'),
                        author: createRelationField('author', 'User'),
                    },
                    uniqueFields: {},
                    idFields: ['id'],
                },
            });

            const visitedModels: string[] = [];
            const createCallback = vi.fn((model) => {
                visitedModels.push(model);
            });

            const visitor = new NestedWriteVisitor(schema, { create: createCallback });

            await visitor.visit('User', 'create', {
                data: {
                    name: 'Alice',
                    posts: {
                        create: {
                            title: 'Post',
                            comments: {
                                create: {
                                    text: 'Comment',
                                    author: {
                                        create: { name: 'Bob' },
                                    },
                                },
                            },
                        },
                    },
                },
            });

            expect(visitedModels).toContain('User');
            expect(visitedModels).toContain('Post');
            expect(visitedModels).toContain('Comment');
            expect(visitedModels.filter((m) => m === 'User').length).toBe(2); // Alice and Bob
        });

        it('handles mixed operations in update', async () => {
            const schema = createSchema({
                User: {
                    name: 'User',
                    fields: {
                        id: createField('id', 'String'),
                        posts: createRelationField('posts', 'Post'),
                    },
                    uniqueFields: {},
                    idFields: ['id'],
                },
                Post: {
                    name: 'Post',
                    fields: {
                        id: createField('id', 'String'),
                        title: createField('title', 'String'),
                    },
                    uniqueFields: {},
                    idFields: ['id'],
                },
            });

            const createCallback = vi.fn();
            const updateCallback = vi.fn();
            const deleteCallback = vi.fn();
            const connectCallback = vi.fn();

            const visitor = new NestedWriteVisitor(schema, {
                create: createCallback,
                update: updateCallback,
                delete: deleteCallback,
                connect: connectCallback,
            });

            await visitor.visit('User', 'update', {
                where: { id: '1' },
                data: {
                    posts: {
                        create: { title: 'New Post' },
                        update: { where: { id: 'p1' }, data: { title: 'Updated' } },
                        delete: { id: 'p2' },
                        connect: { id: 'p3' },
                    },
                },
            });

            expect(createCallback).toHaveBeenCalledWith('Post', { title: 'New Post' }, expect.any(Object));
            expect(updateCallback).toHaveBeenCalledWith(
                'Post',
                { where: { id: 'p1' }, data: { title: 'Updated' } },
                expect.any(Object),
            );
            expect(deleteCallback).toHaveBeenCalledWith('Post', { id: 'p2' }, expect.any(Object));
            expect(connectCallback).toHaveBeenCalledWith('Post', { id: 'p3' }, expect.any(Object));
        });
    });
});
