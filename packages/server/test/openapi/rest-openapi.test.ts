import { createTestClient } from '@zenstackhq/testtools';
import fs from 'fs';
import path from 'path';
import { beforeAll, describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { validate } from '@readme/openapi-parser';
import { RestApiHandler } from '../../src/api/rest';

const UPDATE_BASELINE = process.env.UPDATE_BASELINE === '1';

function loadBaseline(name: string) {
    return YAML.parse(fs.readFileSync(path.join(__dirname, 'baseline', name), 'utf-8'), { maxAliasCount: 10000 });
}

function saveBaseline(name: string, spec: any) {
    fs.writeFileSync(
        path.join(__dirname, 'baseline', name),
        YAML.stringify(spec, { lineWidth: 0, indent: 4, aliasDuplicateObjects: false }),
    );
}

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

    it('fetch related path has response schema', () => {
        // Collection relation: should reference ListResponse
        const collectionPath = spec.paths['/user/{id}/posts'] as any;
        const collectionSchema = collectionPath.get.responses['200'].content['application/vnd.api+json'].schema;
        expect(collectionSchema.$ref).toBe('#/components/schemas/PostListResponse');

        // Singular relation: should reference Response
        const singularPath = spec.paths['/post/{id}/setting'] as any;
        const singularSchema = singularPath.get.responses['200'].content['application/vnd.api+json'].schema;
        expect(singularSchema.$ref).toBe('#/components/schemas/SettingResponse');
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
        const userAttrs = userSchema.properties.attributes.properties;
        expect(userAttrs).toBeDefined();
        // email -> string
        expect(userAttrs['email']).toMatchObject({ type: 'string' });
        // myId -> string
        expect(userAttrs['myId']).toMatchObject({ type: 'string' });

        const postSchema = spec.components.schemas['Post'];
        const postAttrs = postSchema.properties.attributes.properties;
        expect(postAttrs).toBeDefined();
        // viewCount -> integer
        expect(postAttrs['viewCount']).toMatchObject({ type: 'integer' });
        // published -> boolean
        expect(postAttrs['published']).toMatchObject({ type: 'boolean' });
        // createdAt -> date-time
        expect(postAttrs['createdAt']).toMatchObject({ type: 'string', format: 'date-time' });
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
        const userAttrs = userSchema.properties.attributes.properties;
        expect(userAttrs['myId']).toBeDefined();
        expect(userAttrs['email']).toBeUndefined();
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
        const userRels = userSchema.properties.relationships?.properties ?? {};
        expect(userRels['posts']).toBeUndefined();
        const userAttrs = userSchema.properties.attributes.properties;
        expect(userAttrs['email']).toBeDefined();
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

describe('REST OpenAPI spec generation - nestedRoutes', () => {
    let handler: RestApiHandler;
    let spec: any;

    beforeAll(async () => {
        const client = await createTestClient(schema);
        handler = new RestApiHandler({
            schema: client.$schema,
            endpoint: 'http://localhost/api',
            nestedRoutes: true,
        });
        spec = await handler.generateSpec();
    });

    it('does not generate nested single paths when nestedRoutes is false', async () => {
        const client = await createTestClient(schema);
        const plainHandler = new RestApiHandler({
            schema: client.$schema,
            endpoint: 'http://localhost/api',
        });
        const plainSpec = await plainHandler.generateSpec();
        expect(plainSpec.paths?.['/user/{id}/posts/{childId}']).toBeUndefined();
        expect(plainSpec.paths?.['/post/{id}/comments/{childId}']).toBeUndefined();
        // fetch-related path should not have POST on plain handler
        expect((plainSpec.paths as any)['/user/{id}/posts']?.post).toBeUndefined();
        // fetch-related path should not have PATCH for to-one on plain handler
        expect((plainSpec.paths as any)['/post/{id}/setting']?.patch).toBeUndefined();
    });

    it('generates nested single paths for collection relations', () => {
        // User -> posts (collection)
        expect(spec.paths['/user/{id}/posts/{childId}']).toBeDefined();
        // Post -> comments (collection)
        expect(spec.paths['/post/{id}/comments/{childId}']).toBeDefined();
        // User -> likes (collection, compound-ID child: PostLike has @@id([postId, userId]))
        expect(spec.paths['/user/{id}/likes/{childId}']).toBeDefined();
    });

    it('does not generate nested single paths for to-one relations', () => {
        // Post -> setting (to-one)
        expect(spec.paths['/post/{id}/setting/{childId}']).toBeUndefined();
        // Post -> author (to-one)
        expect(spec.paths['/post/{id}/author/{childId}']).toBeUndefined();
    });

    it('nested single path has GET, PATCH, DELETE', () => {
        const path = spec.paths['/user/{id}/posts/{childId}'];
        expect(path.get).toBeDefined();
        expect(path.patch).toBeDefined();
        expect(path.delete).toBeDefined();
    });

    it('nested single path GET returns single resource response', () => {
        const getOp = spec.paths['/user/{id}/posts/{childId}'].get;
        const schema = getOp.responses['200'].content['application/vnd.api+json'].schema;
        expect(schema.$ref).toBe('#/components/schemas/PostResponse');
    });

    it('nested single path PATCH uses UpdateRequest body', () => {
        const patchOp = spec.paths['/user/{id}/posts/{childId}'].patch;
        const schema = patchOp.requestBody.content['application/vnd.api+json'].schema;
        expect(schema.$ref).toBe('#/components/schemas/PostUpdateRequest');
    });

    it('nested single path has childId path parameter', () => {
        const getOp = spec.paths['/user/{id}/posts/{childId}'].get;
        const params = getOp.parameters;
        const childIdParam = params.find((p: any) => p.name === 'childId');
        expect(childIdParam).toBeDefined();
        expect(childIdParam.in).toBe('path');
        expect(childIdParam.required).toBe(true);
    });

    it('fetch-related path has POST for collection relation when nestedRoutes enabled', () => {
        const postsPath = spec.paths['/user/{id}/posts'];
        expect(postsPath.get).toBeDefined();
        expect(postsPath.post).toBeDefined();
    });

    it('fetch-related POST uses CreateRequest body', () => {
        const postOp = spec.paths['/user/{id}/posts'].post;
        const schema = postOp.requestBody.content['application/vnd.api+json'].schema;
        expect(schema.$ref).toBe('#/components/schemas/PostCreateRequest');
    });

    it('fetch-related POST returns 201 with resource response', () => {
        const postOp = spec.paths['/user/{id}/posts'].post;
        const schema = postOp.responses['201'].content['application/vnd.api+json'].schema;
        expect(schema.$ref).toBe('#/components/schemas/PostResponse');
    });

    it('fetch-related path has PATCH for to-one relation when nestedRoutes enabled', () => {
        // Post -> setting is to-one
        const settingPath = spec.paths['/post/{id}/setting'];
        expect(settingPath.get).toBeDefined();
        expect(settingPath.patch).toBeDefined();
        // to-one should not get POST (no nested create for to-one)
        expect(settingPath.post).toBeUndefined();
    });

    it('fetch-related PATCH for to-one uses UpdateRequest body', () => {
        const patchOp = spec.paths['/post/{id}/setting'].patch;
        const schema = patchOp.requestBody.content['application/vnd.api+json'].schema;
        expect(schema.$ref).toBe('#/components/schemas/SettingUpdateRequest');
    });

    it('fetch-related path does not have PATCH for to-many (collection) relation', () => {
        // User -> posts is a to-many relation; PATCH should only be generated for to-one
        const postsPath = spec.paths['/user/{id}/posts'];
        expect(postsPath.patch).toBeUndefined();
    });

    it('spec passes OpenAPI 3.1 validation', async () => {
        // Deep clone to avoid validate() mutating $ref strings in the shared spec object
        await validate(JSON.parse(JSON.stringify(spec)));
    });

    it('operationIds are unique for nested paths', () => {
        const allOperationIds: string[] = [];
        for (const pathItem of Object.values(spec.paths as Record<string, any>)) {
            for (const method of ['get', 'post', 'patch', 'put', 'delete']) {
                if (pathItem[method]?.operationId) {
                    allOperationIds.push(pathItem[method].operationId);
                }
            }
        }
        const unique = new Set(allOperationIds);
        expect(unique.size).toBe(allOperationIds.length);
    });

    it('nestedRoutes respects queryOptions slicing excludedOperations', async () => {
        const client = await createTestClient(schema);
        const slicedHandler = new RestApiHandler({
            schema: client.$schema,
            endpoint: 'http://localhost/api',
            nestedRoutes: true,
            queryOptions: {
                slicing: {
                    models: {
                        post: { excludedOperations: ['create', 'delete', 'update'] },
                    },
                } as any,
            },
        });
        const s = await slicedHandler.generateSpec();

        // Nested create (POST /user/{id}/posts) should be absent
        expect((s.paths as any)['/user/{id}/posts']?.post).toBeUndefined();
        // Nested single GET should still exist (findUnique not excluded)
        expect((s.paths as any)['/user/{id}/posts/{childId}']?.get).toBeDefined();
        // Nested single DELETE should be absent
        expect((s.paths as any)['/user/{id}/posts/{childId}']?.delete).toBeUndefined();
        // Nested single PATCH (update) should be absent
        expect((s.paths as any)['/user/{id}/posts/{childId}']?.patch).toBeUndefined();
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
        const userAttrs = userSchema.properties.attributes.properties;
        expect(userAttrs['email'].description).toBe("The user's email address");

        // id has no @meta description
        expect(userAttrs['id'].description).toBeUndefined();
    });
});

describe('REST OpenAPI spec generation - baseline', () => {
    it('matches baseline', async () => {
        const client = await createTestClient(schema);
        const handler = new RestApiHandler({
            schema: client.$schema,
            endpoint: 'http://localhost/api',
        });
        const spec = await handler.generateSpec();
        const baselineFile = 'rest.baseline.yaml';

        if (UPDATE_BASELINE) {
            saveBaseline(baselineFile, spec);
            return;
        }

        const baseline = loadBaseline(baselineFile);
        expect(spec).toMatchObject(baseline);

        await validate(spec);
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

    describe('respectAccessPolicies', () => {
        it('no 403 when respectAccessPolicies is off', async () => {
            const policySchema = `
model Item {
    id Int @id @default(autoincrement())
    value Int

    @@allow('read', true)
    @@allow('create', value > 0)
}
`;
            const client = await createTestClient(policySchema);
            const h = new RestApiHandler({
                schema: client.$schema,
                endpoint: 'http://localhost/api',
            });
            const s = await h.generateSpec();
            expect(s.paths?.['/item']?.post?.responses?.['403']).toBeUndefined();
        });

        it('adds 403 for operations with non-constant-allow policies', async () => {
            const policySchema = `
model Item {
    id Int @id @default(autoincrement())
    value Int

    @@allow('read', true)
    @@allow('create', value > 0)
    @@allow('update', value > 0)
    @@allow('delete', value > 0)
}
`;
            const client = await createTestClient(policySchema);
            const h = new RestApiHandler({
                schema: client.$schema,
                endpoint: 'http://localhost/api',
            });
            const s = await h.generateSpec({ respectAccessPolicies: true });
            // create has a non-constant condition → 403
            expect(s.paths?.['/item']?.post?.responses?.['403']).toBeDefined();
            // update has a non-constant condition → 403
            expect(s.paths?.['/item/{id}']?.patch?.responses?.['403']).toBeDefined();
            // delete has a non-constant condition → 403
            expect(s.paths?.['/item/{id}']?.delete?.responses?.['403']).toBeDefined();
        });

        it('no 403 for constant-allow operations', async () => {
            const policySchema = `
model Item {
    id Int @id @default(autoincrement())
    value Int

    @@allow('all', true)
}
`;
            const client = await createTestClient(policySchema);
            const h = new RestApiHandler({
                schema: client.$schema,
                endpoint: 'http://localhost/api',
            });
            const s = await h.generateSpec({ respectAccessPolicies: true });
            // all operations are constant-allow → no 403
            expect(s.paths?.['/item']?.post?.responses?.['403']).toBeUndefined();
            expect(s.paths?.['/item/{id}']?.patch?.responses?.['403']).toBeUndefined();
            expect(s.paths?.['/item/{id}']?.delete?.responses?.['403']).toBeUndefined();
        });

        it('403 when deny rule exists even with constant allow', async () => {
            const policySchema = `
model Item {
    id Int @id @default(autoincrement())
    value Int

    @@allow('create', true)
    @@deny('create', value < 0)
}
`;
            const client = await createTestClient(policySchema);
            const h = new RestApiHandler({
                schema: client.$schema,
                endpoint: 'http://localhost/api',
            });
            const s = await h.generateSpec({ respectAccessPolicies: true });
            // deny rule overrides → 403
            expect(s.paths?.['/item']?.post?.responses?.['403']).toBeDefined();
        });

        it('no 403 when deny condition is literal false', async () => {
            const policySchema = `
model Item {
    id Int @id @default(autoincrement())
    value Int

    @@allow('create', true)
    @@deny('create', false)
}
`;
            const client = await createTestClient(policySchema);
            const h = new RestApiHandler({
                schema: client.$schema,
                endpoint: 'http://localhost/api',
            });
            const s = await h.generateSpec({ respectAccessPolicies: true });
            // @@deny('create', false) is a no-op → no 403
            expect(s.paths?.['/item']?.post?.responses?.['403']).toBeUndefined();
        });

        it('403 when no policy rules at all (default-deny)', async () => {
            const policySchema = `
model Item {
    id Int @id @default(autoincrement())
    value Int
}
`;
            const client = await createTestClient(policySchema);
            const h = new RestApiHandler({
                schema: client.$schema,
                endpoint: 'http://localhost/api',
            });
            const s = await h.generateSpec({ respectAccessPolicies: true });
            // no rules = default deny → 403
            expect(s.paths?.['/item']?.post?.responses?.['403']).toBeDefined();
            expect(s.paths?.['/item/{id}']?.patch?.responses?.['403']).toBeDefined();
            expect(s.paths?.['/item/{id}']?.delete?.responses?.['403']).toBeDefined();
        });

        it('per-operation granularity: only non-constant ops get 403', async () => {
            const policySchema = `
model Item {
    id Int @id @default(autoincrement())
    value Int

    @@allow('create,read', true)
    @@allow('update,delete', value > 0)
}
`;
            const client = await createTestClient(policySchema);
            const h = new RestApiHandler({
                schema: client.$schema,
                endpoint: 'http://localhost/api',
            });
            const s = await h.generateSpec({ respectAccessPolicies: true });
            // create is constant-allow → no 403
            expect(s.paths?.['/item']?.post?.responses?.['403']).toBeUndefined();
            // update/delete are non-constant → 403
            expect(s.paths?.['/item/{id}']?.patch?.responses?.['403']).toBeDefined();
            expect(s.paths?.['/item/{id}']?.delete?.responses?.['403']).toBeDefined();
        });

        it('relationship mutations get 403 when update may be denied', async () => {
            const policySchema = `
model Parent {
    id Int @id @default(autoincrement())
    children Child[]

    @@allow('read', true)
    @@allow('update', false)
}

model Child {
    id Int @id @default(autoincrement())
    parent Parent @relation(fields: [parentId], references: [id])
    parentId Int

    @@allow('all', true)
}
`;
            const client = await createTestClient(policySchema);
            const h = new RestApiHandler({
                schema: client.$schema,
                endpoint: 'http://localhost/api',
            });
            const s = await h.generateSpec({ respectAccessPolicies: true });
            const relPath = s.paths?.['/parent/{id}/relationships/children'] as any;
            expect(relPath.put.responses['403']).toBeDefined();
            expect(relPath.patch.responses['403']).toBeDefined();
            expect(relPath.post.responses['403']).toBeDefined();
            // GET should not have 403
            expect(relPath.get.responses['403']).toBeUndefined();
        });

        it('relationship mutations have no 403 when update is constant-allow', async () => {
            const policySchema = `
model Parent {
    id Int @id @default(autoincrement())
    children Child[]

    @@allow('all', true)
}

model Child {
    id Int @id @default(autoincrement())
    parent Parent @relation(fields: [parentId], references: [id])
    parentId Int

    @@allow('all', true)
}
`;
            const client = await createTestClient(policySchema);
            const h = new RestApiHandler({
                schema: client.$schema,
                endpoint: 'http://localhost/api',
            });
            const s = await h.generateSpec({ respectAccessPolicies: true });
            const relPath = s.paths?.['/parent/{id}/relationships/children'] as any;
            expect(relPath.put.responses['403']).toBeUndefined();
            expect(relPath.patch.responses['403']).toBeUndefined();
            expect(relPath.post.responses['403']).toBeUndefined();
        });
    });
});
