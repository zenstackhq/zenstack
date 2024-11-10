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
            },
            uniqueConstraints: { id: { name: 'id', fields: ['id'] } },
        },
    },
    deleteCascade: {
        user: ['Post'],
    },
};
