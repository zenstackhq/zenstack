import { ExpressionUtils, type AttributeApplication, type SchemaDef } from '@zenstackhq/schema';
import { describe, expect, it } from 'vitest';
import { createSchemaFactory } from '../src';

function length(min: number, max: number): AttributeApplication {
    return {
        name: '@length',
        args: [
            { name: 'min', value: ExpressionUtils.literal(min) },
            { name: 'max', value: ExpressionUtils.literal(max) },
        ],
    };
}

const schema = {
    provider: { type: 'postgresql' },
    models: {
        Post: {
            name: 'Post',
            fields: {
                id: { name: 'id', type: 'Int', id: true, attributes: [{ name: '@id' }] },
                tags: { name: 'tags', type: 'Tag', array: true, attributes: [length(2, 3)] },
                labels: { name: 'labels', type: 'String', array: true, optional: true, attributes: [length(1, 2)] },
            },
            idFields: ['id'],
            uniqueFields: { id: { type: 'Int' } },
        },
    },
    typeDefs: {
        Tag: {
            name: 'Tag',
            base: 'String',
            fields: {
                this: { name: 'this', type: 'String', attributes: [length(1, 10)] },
            },
        },
    },
    plugins: {},
} as const satisfies SchemaDef;

describe('list field validation', () => {
    const postSchema = createSchemaFactory(schema).makeModelSchema('Post');

    it('applies field attributes to the list and typedef attributes to each item', () => {
        expect(postSchema.safeParse({ id: 1, tags: ['a', 'b'] }).success).toBe(true);
        expect(postSchema.safeParse({ id: 1, tags: ['a', 'b', 'c'] }).success).toBe(true);
        expect(postSchema.safeParse({ id: 1, tags: ['ab'] }).success).toBe(false);
        expect(postSchema.safeParse({ id: 1, tags: ['a', 'b', 'c', 'd'] }).success).toBe(false);
        expect(postSchema.safeParse({ id: 1, tags: ['a', ''] }).success).toBe(false);
        expect(postSchema.safeParse({ id: 1, tags: ['a', 'abcdefghijk'] }).success).toBe(false);
    });

    it('applies field attributes to the list for scalar list fields', () => {
        expect(postSchema.safeParse({ id: 1, tags: ['a', 'b'], labels: ['abc'] }).success).toBe(true);
        expect(postSchema.safeParse({ id: 1, tags: ['a', 'b'], labels: ['', 'abcdef'] }).success).toBe(true);
        expect(postSchema.safeParse({ id: 1, tags: ['a', 'b'], labels: [] }).success).toBe(false);
        expect(postSchema.safeParse({ id: 1, tags: ['a', 'b'], labels: ['a', 'b', 'c'] }).success).toBe(false);
        expect(postSchema.safeParse({ id: 1, tags: ['a', 'b'], labels: null }).success).toBe(true);
    });
});
