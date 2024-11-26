import { ModelMeta } from '@zenstackhq/runtime/cross';

const fieldDefaults = {
    isId: false,
    isDataModel: false,
    isArray: false,
    isOptional: true,
    attributes: [],
    isRelationOwner: false,
    isForeignKey: false,
};

export const modelMeta: ModelMeta = {
    models: {
        user: {
            name: 'user',
            fields: {
                id: {
                    ...fieldDefaults,
                    type: 'String',
                    isId: true,
                    name: 'id',
                    isOptional: false,
                },
                name: { ...fieldDefaults, type: 'String', name: 'name' },
                email: { ...fieldDefaults, type: 'String', name: 'name', isOptional: false },
                posts: {
                    ...fieldDefaults,
                    type: 'Post',
                    isDataModel: true,
                    isArray: true,
                    name: 'posts',
                },
            },
            uniqueConstraints: { id: { name: 'id', fields: ['id'] } },
        },
        post: {
            name: 'post',
            fields: {
                id: {
                    ...fieldDefaults,
                    type: 'String',
                    isId: true,
                    name: 'id',
                    isOptional: false,
                },
                title: { ...fieldDefaults, type: 'String', name: 'title' },
                owner: {
                    ...fieldDefaults,
                    type: 'User',
                    name: 'owner',
                    isDataModel: true,
                    isRelationOwner: true,
                    foreignKeyMapping: { id: 'ownerId' },
                },
                ownerId: { ...fieldDefaults, type: 'String', name: 'ownerId', isForeignKey: true },
                category: {
                    ...fieldDefaults,
                    type: 'Category',
                    name: 'category',
                    isDataModel: true,
                    isOptional: true,
                    isRelationOwner: true,
                    backLink: 'posts',
                    foreignKeyMapping: { id: 'categoryId' },
                },
                categoryId: {
                    ...fieldDefaults,
                    type: 'String',
                    name: 'categoryId',
                    isForeignKey: true,
                    relationField: 'category',
                },
            },
            uniqueConstraints: { id: { name: 'id', fields: ['id'] } },
        },
        category: {
            name: 'category',
            fields: {
                id: {
                    ...fieldDefaults,
                    type: 'String',
                    isId: true,
                    name: 'id',
                    isOptional: false,
                },
                name: { ...fieldDefaults, type: 'String', name: 'name' },
                posts: {
                    ...fieldDefaults,
                    type: 'Post',
                    isDataModel: true,
                    isArray: true,
                    name: 'posts',
                },
            },
        },
    },
    deleteCascade: {
        user: ['Post'],
    },
};
