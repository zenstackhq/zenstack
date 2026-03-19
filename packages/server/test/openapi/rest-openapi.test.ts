import { createTestClient } from '@zenstackhq/testtools';
import { beforeAll, describe, expect, it } from 'vitest';
import { RestApiHandler } from '../../src/api/rest';

const schema = `
type Address {
    city String
}

model User {
    myId String @id @default(cuid())
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt
    email String @unique @email
    posts Post[]
    likes PostLike[]
    profile Profile?
    address Address? @json
    someJson Json?
}

model Profile {
    id Int @id @default(autoincrement())
    gender String
    user User @relation(fields: [userId], references: [myId])
    userId String @unique
}

model Post {
    id Int @id @default(autoincrement())
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt
    title String @length(1, 10)
    author User? @relation(fields: [authorId], references: [myId])
    authorId String?
    published Boolean @default(false)
    publishedAt DateTime?
    viewCount Int @default(0)
    comments Comment[]
    likes PostLike[]
    setting Setting?
}

model Comment {
    id Int @id @default(autoincrement())
    post Post @relation(fields: [postId], references: [id])
    postId Int
    content String
}

model Setting {
    id Int @id @default(autoincrement())
    boost Int
    post Post @relation(fields: [postId], references: [id])
    postId Int @unique
}

model PostLike {
    postId Int
    userId String
    superLike Boolean
    post Post @relation(fields: [postId], references: [id])
    user User @relation(fields: [userId], references: [myId])
    likeInfos PostLikeInfo[]
    @@id([postId, userId])
}

model PostLikeInfo {
    id Int @id @default(autoincrement())
    text String
    postId Int
    userId String
    postLike PostLike @relation(fields: [postId, userId], references: [postId, userId])
}
`;

describe('REST OpenAPI spec generation', () => {
    let handler: RestApiHandler;
    let spec: any;

    beforeAll(async () => {
        const client = await createTestClient(schema);
        handler = new RestApiHandler({
            schema: client.$schema,
            endpoint: 'http://localhost/api',
        });
        spec = await handler.generateSpec();
    });

    it('document structure is valid', () => {
        expect(spec.openapi).toBe('3.1.0');
        expect(spec.info).toBeDefined();
        expect(spec.info.title).toBe('ZenStack Generated API');
        expect(spec.info.version).toBe('1.0.0');
        expect(spec.servers).toEqual([{ url: 'http://localhost/api' }]);
        expect(spec.paths).toBeDefined();
        expect(spec.components).toBeDefined();
        expect(spec.components.schemas).toBeDefined();
    });

    it('model paths exist', () => {
        expect(spec.paths['/user']).toBeDefined();
        expect(spec.paths['/user/{id}']).toBeDefined();
        expect(spec.paths['/post']).toBeDefined();
        expect(spec.paths['/post/{id}']).toBeDefined();
        expect(spec.paths['/comment']).toBeDefined();
        expect(spec.paths['/comment/{id}']).toBeDefined();
    });

    it('HTTP methods on collection path', () => {
        expect(spec.paths['/user'].get).toBeDefined();
        expect(spec.paths['/user'].post).toBeDefined();
    });

    it('HTTP methods on single resource path', () => {
        expect(spec.paths['/user/{id}'].get).toBeDefined();
        expect(spec.paths['/user/{id}'].patch).toBeDefined();
        expect(spec.paths['/user/{id}'].delete).toBeDefined();
    });

    it('relation paths exist', () => {
        expect(spec.paths['/user/{id}/posts']).toBeDefined();
        expect(spec.paths['/user/{id}/relationships/posts']).toBeDefined();
        expect(spec.paths['/post/{id}/comments']).toBeDefined();
    });

    it('relationship path has correct methods', () => {
        const relPath = spec.paths['/user/{id}/relationships/posts'];
        expect(relPath.get).toBeDefined();
        expect(relPath.put).toBeDefined();
        expect(relPath.patch).toBeDefined();
        // posts is a collection, so should have POST
        expect(relPath.post).toBeDefined();
    });

    it('model schemas exist', () => {
        expect(spec.components.schemas['User']).toBeDefined();
        expect(spec.components.schemas['UserCreateRequest']).toBeDefined();
        expect(spec.components.schemas['UserUpdateRequest']).toBeDefined();
        expect(spec.components.schemas['UserResponse']).toBeDefined();
        expect(spec.components.schemas['UserListResponse']).toBeDefined();
        expect(spec.components.schemas['Post']).toBeDefined();
        expect(spec.components.schemas['PostCreateRequest']).toBeDefined();
    });

    it('field types in schemas', () => {
        const userSchema = spec.components.schemas['User'];
        expect(userSchema.properties).toBeDefined();
        // email -> string
        expect(userSchema.properties['email']).toMatchObject({ type: 'string' });
        // myId -> string
        expect(userSchema.properties['myId']).toMatchObject({ type: 'string' });

        const postSchema = spec.components.schemas['Post'];
        expect(postSchema.properties).toBeDefined();
        // viewCount -> integer
        expect(postSchema.properties['viewCount']).toMatchObject({ type: 'integer' });
        // published -> boolean
        expect(postSchema.properties['published']).toMatchObject({ type: 'boolean' });
        // createdAt -> date-time
        expect(postSchema.properties['createdAt']).toMatchObject({ type: 'string', format: 'date-time' });
    });

    it('required fields marked in create schema', () => {
        const createReq = spec.components.schemas['CommentCreateRequest'];
        expect(createReq).toBeDefined();
        const dataProps = createReq.properties?.data?.properties;
        expect(dataProps).toBeDefined();
        // content is required, non-optional non-default
        const attrRequired = createReq.properties?.data?.properties?.attributes?.required ?? [];
        expect(attrRequired).toContain('content');
    });

    it('shared component schemas exist', () => {
        expect(spec.components.schemas['_jsonapi']).toBeDefined();
        expect(spec.components.schemas['_errors']).toBeDefined();
        expect(spec.components.schemas['_errorResponse']).toBeDefined();
        expect(spec.components.schemas['_resourceIdentifier']).toBeDefined();
        expect(spec.components.schemas['_toOneRelationship']).toBeDefined();
        expect(spec.components.schemas['_toManyRelationship']).toBeDefined();
    });

    it('shared parameters exist', () => {
        expect(spec.components.parameters['id']).toBeDefined();
        expect(spec.components.parameters['include']).toBeDefined();
        expect(spec.components.parameters['sort']).toBeDefined();
        expect(spec.components.parameters['pageOffset']).toBeDefined();
        expect(spec.components.parameters['pageLimit']).toBeDefined();
    });

    it('filter parameters appear on list operations', () => {
        const listOp = spec.paths['/post'].get;
        expect(listOp).toBeDefined();
        const paramNames = listOp.parameters.map((p: any) => ('name' in p ? p.name : p.$ref));
        expect(paramNames).toContain('filter[viewCount]');
        expect(paramNames).toContain('filter[published]');
        expect(paramNames).toContain('filter[title]');
        // String ops
        expect(paramNames).toContain('filter[title][$contains]');
        // Numeric ops
        expect(paramNames).toContain('filter[viewCount][$lt]');
        expect(paramNames).toContain('filter[viewCount][$gt]');
    });

    it('modelNameMapping is reflected in paths', async () => {
        const client = await createTestClient(schema);
        const mappedHandler = new RestApiHandler({
            schema: client.$schema,
            endpoint: 'http://localhost/api',
            modelNameMapping: { User: 'users', Post: 'posts' },
        });
        const mappedSpec = await mappedHandler.generateSpec();
        expect(mappedSpec.paths?.['/users']).toBeDefined();
        expect(mappedSpec.paths?.['/posts']).toBeDefined();
        // Original paths should not exist
        expect(mappedSpec.paths?.['/user']).toBeUndefined();
        expect(mappedSpec.paths?.['/post']).toBeUndefined();
    });

    it('compound ID model paths exist', () => {
        // PostLike has @@id([postId, userId])
        expect(spec.paths['/postLike']).toBeDefined();
        expect(spec.paths['/postLike/{id}']).toBeDefined();
    });

    it('custom openApiOptions are reflected in info', async () => {
        const client = await createTestClient(schema);
        const customHandler = new RestApiHandler({
            schema: client.$schema,
            endpoint: 'http://localhost/api',
        });
        const customSpec = await customHandler.generateSpec({
            title: 'My Custom API',
            version: '2.0.0',
            description: 'A custom description',
        });
        expect(customSpec.info.title).toBe('My Custom API');
        expect(customSpec.info.version).toBe('2.0.0');
        expect((customSpec.info as any).description).toBe('A custom description');
    });
});

describe('REST OpenAPI spec generation - queryOptions', () => {
    it('omit excludes fields from read schema', async () => {
        const client = await createTestClient(schema);
        const handler = new RestApiHandler({
            schema: client.$schema,
            endpoint: 'http://localhost/api',
            queryOptions: { omit: { User: { email: true } } },
        });
        const s = await handler.generateSpec();
        const userSchema = s.components?.schemas?.['User'] as any;
        expect(userSchema.properties['myId']).toBeDefined();
        expect(userSchema.properties['email']).toBeUndefined();
    });

    it('slicing excludedModels removes model from spec', async () => {
        const client = await createTestClient(schema);
        const handler = new RestApiHandler({
            schema: client.$schema,
            endpoint: 'http://localhost/api',
            queryOptions: { slicing: { excludedModels: ['Post'] as any } },
        });
        const s = await handler.generateSpec();
        expect(s.paths?.['/user']).toBeDefined();
        expect(s.paths?.['/post']).toBeUndefined();
        expect(s.components?.schemas?.['Post']).toBeUndefined();

        // Relation paths to excluded model should not exist
        expect(s.paths?.['/user/{id}/posts']).toBeUndefined();
        expect(s.paths?.['/user/{id}/relationships/posts']).toBeUndefined();

        // Relation fields to excluded model should not appear in read schema
        const userSchema = s.components?.schemas?.['User'] as any;
        expect(userSchema.properties['posts']).toBeUndefined();
        expect(userSchema.properties['email']).toBeDefined();
    });

    it('slicing includedModels limits models in spec', async () => {
        const client = await createTestClient(schema);
        const handler = new RestApiHandler({
            schema: client.$schema,
            endpoint: 'http://localhost/api',
            queryOptions: { slicing: { includedModels: ['User'] as any } },
        });
        const s = await handler.generateSpec();
        expect(s.paths?.['/user']).toBeDefined();
        expect(s.paths?.['/post']).toBeUndefined();
    });

    it('slicing excludedOperations removes HTTP methods from paths', async () => {
        const client = await createTestClient(schema);
        const handler = new RestApiHandler({
            schema: client.$schema,
            endpoint: 'http://localhost/api',
            queryOptions: {
                slicing: {
                    models: {
                        post: { excludedOperations: ['create', 'delete'] },
                    },
                } as any,
            },
        });
        const s = await handler.generateSpec();

        // Collection path: GET (findMany) should exist, POST (create) should not
        expect((s.paths as any)['/post'].get).toBeDefined();
        expect((s.paths as any)['/post'].post).toBeUndefined();

        // Single path: GET (findUnique) and PATCH (update) should exist, DELETE should not
        expect((s.paths as any)['/post/{id}'].get).toBeDefined();
        expect((s.paths as any)['/post/{id}'].patch).toBeDefined();
        expect((s.paths as any)['/post/{id}'].delete).toBeUndefined();
    });

    it('slicing excludedOperations on all CRUD ops removes paths entirely', async () => {
        const client = await createTestClient(schema);
        const handler = new RestApiHandler({
            schema: client.$schema,
            endpoint: 'http://localhost/api',
            queryOptions: {
                slicing: {
                    models: {
                        post: { excludedOperations: ['findMany', 'create', 'findUnique', 'update', 'delete'] },
                    },
                } as any,
            },
        });
        const s = await handler.generateSpec();

        // Both collection and single paths should be absent (empty path objects are not emitted)
        expect(s.paths?.['/post']).toBeUndefined();
        expect(s.paths?.['/post/{id}']).toBeUndefined();
    });

    it('slicing includedOperations limits HTTP methods in paths', async () => {
        const client = await createTestClient(schema);
        const handler = new RestApiHandler({
            schema: client.$schema,
            endpoint: 'http://localhost/api',
            queryOptions: {
                slicing: {
                    models: {
                        post: { includedOperations: ['findMany', 'findUnique'] },
                    },
                } as any,
            },
        });
        const s = await handler.generateSpec();

        // Collection: only GET
        expect((s.paths as any)['/post'].get).toBeDefined();
        expect((s.paths as any)['/post'].post).toBeUndefined();

        // Single: only GET
        expect((s.paths as any)['/post/{id}'].get).toBeDefined();
        expect((s.paths as any)['/post/{id}'].patch).toBeUndefined();
        expect((s.paths as any)['/post/{id}'].delete).toBeUndefined();
    });

    it('slicing $all excludedOperations applies to all models', async () => {
        const client = await createTestClient(schema);
        const handler = new RestApiHandler({
            schema: client.$schema,
            endpoint: 'http://localhost/api',
            queryOptions: {
                slicing: {
                    models: {
                        $all: { excludedOperations: ['delete'] },
                    },
                } as any,
            },
        });
        const s = await handler.generateSpec();

        // DELETE should be absent on all models
        expect((s.paths as any)['/user/{id}'].delete).toBeUndefined();
        expect((s.paths as any)['/post/{id}'].delete).toBeUndefined();
        expect((s.paths as any)['/comment/{id}'].delete).toBeUndefined();

        // Other methods should still exist
        expect((s.paths as any)['/user/{id}'].get).toBeDefined();
        expect((s.paths as any)['/user/{id}'].patch).toBeDefined();
    });

    it('slicing excludedFilterKinds removes filter params for a field', async () => {
        const client = await createTestClient(schema);
        const handler = new RestApiHandler({
            schema: client.$schema,
            endpoint: 'http://localhost/api',
            queryOptions: {
                slicing: {
                    models: {
                        post: {
                            fields: {
                                title: { excludedFilterKinds: ['Like'] },
                                viewCount: { excludedFilterKinds: ['Range'] },
                            },
                        },
                    },
                } as any,
            },
        });
        const s = await handler.generateSpec();
        const listOp = (s.paths as any)['/post'].get;
        const paramNames = listOp.parameters.map((p: any) => ('name' in p ? p.name : p.$ref));

        // Equality filters should still exist
        expect(paramNames).toContain('filter[title]');
        expect(paramNames).toContain('filter[viewCount]');

        // Like filters for title should be excluded
        expect(paramNames).not.toContain('filter[title][$contains]');
        expect(paramNames).not.toContain('filter[title][$startsWith]');

        // Range filters for viewCount should be excluded
        expect(paramNames).not.toContain('filter[viewCount][$lt]');
        expect(paramNames).not.toContain('filter[viewCount][$gt]');
    });

    it('slicing includedFilterKinds limits filter params for a field', async () => {
        const client = await createTestClient(schema);
        const handler = new RestApiHandler({
            schema: client.$schema,
            endpoint: 'http://localhost/api',
            queryOptions: {
                slicing: {
                    models: {
                        post: {
                            fields: {
                                title: { includedFilterKinds: ['Equality'] },
                            },
                        },
                    },
                } as any,
            },
        });
        const s = await handler.generateSpec();
        const listOp = (s.paths as any)['/post'].get;
        const paramNames = listOp.parameters.map((p: any) => ('name' in p ? p.name : p.$ref));

        // Equality filter should exist
        expect(paramNames).toContain('filter[title]');

        // Like filters should be excluded (not in includedFilterKinds)
        expect(paramNames).not.toContain('filter[title][$contains]');
        expect(paramNames).not.toContain('filter[title][$startsWith]');
    });

    it('slicing $all field applies filter kind restriction to all fields', async () => {
        const client = await createTestClient(schema);
        const handler = new RestApiHandler({
            schema: client.$schema,
            endpoint: 'http://localhost/api',
            queryOptions: {
                slicing: {
                    models: {
                        post: {
                            fields: {
                                $all: { includedFilterKinds: ['Equality'] },
                            },
                        },
                    },
                } as any,
            },
        });
        const s = await handler.generateSpec();
        const listOp = (s.paths as any)['/post'].get;
        const paramNames = listOp.parameters.map((p: any) => ('name' in p ? p.name : p.$ref));

        // Equality filters should exist
        expect(paramNames).toContain('filter[title]');
        expect(paramNames).toContain('filter[viewCount]');

        // Like and Range filters should be excluded
        expect(paramNames).not.toContain('filter[title][$contains]');
        expect(paramNames).not.toContain('filter[viewCount][$lt]');
    });

    it('slicing field-specific overrides $all for filter kinds', async () => {
        const client = await createTestClient(schema);
        const handler = new RestApiHandler({
            schema: client.$schema,
            endpoint: 'http://localhost/api',
            queryOptions: {
                slicing: {
                    models: {
                        post: {
                            fields: {
                                $all: { includedFilterKinds: ['Equality'] },
                                title: { includedFilterKinds: ['Equality', 'Like'] },
                            },
                        },
                    },
                } as any,
            },
        });
        const s = await handler.generateSpec();
        const listOp = (s.paths as any)['/post'].get;
        const paramNames = listOp.parameters.map((p: any) => ('name' in p ? p.name : p.$ref));

        // title should have both Equality and Like
        expect(paramNames).toContain('filter[title]');
        expect(paramNames).toContain('filter[title][$contains]');

        // viewCount should only have Equality (from $all)
        expect(paramNames).toContain('filter[viewCount]');
        expect(paramNames).not.toContain('filter[viewCount][$lt]');
    });

    it('slicing excludedFilterKinds on Equality removes basic filter param', async () => {
        const client = await createTestClient(schema);
        const handler = new RestApiHandler({
            schema: client.$schema,
            endpoint: 'http://localhost/api',
            queryOptions: {
                slicing: {
                    models: {
                        post: {
                            fields: {
                                title: { excludedFilterKinds: ['Equality'] },
                            },
                        },
                    },
                } as any,
            },
        });
        const s = await handler.generateSpec();
        const listOp = (s.paths as any)['/post'].get;
        const paramNames = listOp.parameters.map((p: any) => ('name' in p ? p.name : p.$ref));

        // Basic equality filter should be excluded
        expect(paramNames).not.toContain('filter[title]');

        // Like filters should still exist
        expect(paramNames).toContain('filter[title][$contains]');
    });
});

describe('REST OpenAPI spec generation - @meta description', () => {
    const metaSchema = `
model User {
    id String @id @default(cuid())
    email String @unique @meta("description", "The user's email address")
    @@meta("description", "A user of the system")
}

model Post {
    id Int @id @default(autoincrement())
    title String
}
`;

    it('model @@meta description is used as schema description', async () => {
        const client = await createTestClient(metaSchema);
        const handler = new RestApiHandler({
            schema: client.$schema,
            endpoint: 'http://localhost/api',
        });
        const s = await handler.generateSpec();

        const userSchema = s.components?.schemas?.['User'] as any;
        expect(userSchema.description).toBe('A user of the system');

        // Post has no @@meta description
        const postSchema = s.components?.schemas?.['Post'] as any;
        expect(postSchema.description).toBeUndefined();
    });

    it('field @meta description is used as field schema description', async () => {
        const client = await createTestClient(metaSchema);
        const handler = new RestApiHandler({
            schema: client.$schema,
            endpoint: 'http://localhost/api',
        });
        const s = await handler.generateSpec();

        const userSchema = s.components?.schemas?.['User'] as any;
        expect(userSchema.properties['email'].description).toBe("The user's email address");

        // id has no @meta description
        expect(userSchema.properties['id'].description).toBeUndefined();
    });
});

describe('REST OpenAPI spec generation - with enum schema', () => {
    it('enum schemas exist in components', async () => {
        const enumSchema = `
model Post {
    id Int @id @default(autoincrement())
    title String
    status PostStatus @default(DRAFT)
}

enum PostStatus {
    DRAFT
    PUBLISHED
    ARCHIVED
}
`;
        const client = await createTestClient(enumSchema);
        const h = new RestApiHandler({
            schema: client.$schema,
            endpoint: 'http://localhost/api',
        });
        const s = await h.generateSpec();
        expect(s.components?.schemas?.['PostStatus']).toBeDefined();
        expect((s.components?.schemas?.['PostStatus'] as any).type).toBe('string');
        expect((s.components?.schemas?.['PostStatus'] as any).enum).toContain('DRAFT');
        expect((s.components?.schemas?.['PostStatus'] as any).enum).toContain('PUBLISHED');
    });
});
