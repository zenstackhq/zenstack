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
                email: { name: 'email', type: 'Email', optional: true, attributes: [length(1, 7)] },
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
        Email: {
            name: 'Email',
            base: 'String',
            fields: {
                this: { name: 'this', type: 'String', attributes: [{ name: '@email' }] },
            },
        },
    },
    plugins: {},
} as const satisfies SchemaDef;

describe('primitive typedef field validation', () => {
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

    it('applies both typedef and field attributes to a non-list typedef field', () => {
        expect(postSchema.safeParse({ id: 1, tags: ['a', 'b'], email: 'a@b.com' }).success).toBe(true);
        // too long: rejected by the field's @length
        expect(postSchema.safeParse({ id: 1, tags: ['a', 'b'], email: 'ab@cd.com' }).success).toBe(false);
        // not an email: rejected by the typedef's @email
        expect(postSchema.safeParse({ id: 1, tags: ['a', 'b'], email: 'abc' }).success).toBe(false);
    });
});
