import { createTestClient } from '@zenstackhq/testtools';
import { beforeAll, describe, expect, it } from 'vitest';
import { RPCApiHandler } from '../../src/api/rpc';
import { schema } from '../utils';

describe('RPC OpenAPI spec generation', () => {
    let handler: RPCApiHandler;
    let spec: any;

    beforeAll(async () => {
        const client = await createTestClient(schema);
        handler = new RPCApiHandler({ schema: client.$schema });
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

    it('operation paths exist for User model', () => {
        expect(spec.paths['/user/findMany']).toBeDefined();
        expect(spec.paths['/user/findUnique']).toBeDefined();
        expect(spec.paths['/user/findFirst']).toBeDefined();
        expect(spec.paths['/user/create']).toBeDefined();
        expect(spec.paths['/user/createMany']).toBeDefined();
        expect(spec.paths['/user/update']).toBeDefined();
        expect(spec.paths['/user/updateMany']).toBeDefined();
        expect(spec.paths['/user/upsert']).toBeDefined();
        expect(spec.paths['/user/delete']).toBeDefined();
        expect(spec.paths['/user/deleteMany']).toBeDefined();
        expect(spec.paths['/user/count']).toBeDefined();
        expect(spec.paths['/user/aggregate']).toBeDefined();
        expect(spec.paths['/user/groupBy']).toBeDefined();
        expect(spec.paths['/user/exists']).toBeDefined();
    });

    it('operation paths exist for Post model', () => {
        expect(spec.paths['/post/findMany']).toBeDefined();
        expect(spec.paths['/post/create']).toBeDefined();
        expect(spec.paths['/post/update']).toBeDefined();
        expect(spec.paths['/post/delete']).toBeDefined();
    });

    it('HTTP methods are correct', () => {
        // Read ops use GET
        expect(spec.paths['/user/findMany'].get).toBeDefined();
        expect(spec.paths['/user/findUnique'].get).toBeDefined();
        expect(spec.paths['/user/count'].get).toBeDefined();
        expect(spec.paths['/user/exists'].get).toBeDefined();

        // Write ops
        expect(spec.paths['/user/create'].post).toBeDefined();
        expect(spec.paths['/user/createMany'].post).toBeDefined();
        expect(spec.paths['/user/upsert'].post).toBeDefined();

        expect(spec.paths['/user/update'].patch).toBeDefined();
        expect(spec.paths['/user/updateMany'].patch).toBeDefined();

        expect(spec.paths['/user/delete'].delete).toBeDefined();
        expect(spec.paths['/user/deleteMany'].delete).toBeDefined();
    });

    it('transaction path exists', () => {
        expect(spec.paths['/$transaction/sequential']).toBeDefined();
        expect(spec.paths['/$transaction/sequential'].post).toBeDefined();
    });

    it('input schemas exist in components', () => {
        expect(spec.components.schemas['UserCreateInput']).toBeDefined();
        expect(spec.components.schemas['UserUpdateInput']).toBeDefined();
        expect(spec.components.schemas['UserWhereInput']).toBeDefined();
        expect(spec.components.schemas['UserWhereUniqueInput']).toBeDefined();
        expect(spec.components.schemas['UserCreateArgs']).toBeDefined();
        expect(spec.components.schemas['UserUpdateArgs']).toBeDefined();
        expect(spec.components.schemas['UserFindManyArgs']).toBeDefined();
        expect(spec.components.schemas['UserFindUniqueArgs']).toBeDefined();
    });

    it('output schema (User model) has correct fields', () => {
        const userSchema = spec.components.schemas['User'];
        expect(userSchema).toBeDefined();
        expect(userSchema.properties).toBeDefined();
        expect(userSchema.properties['id']).toMatchObject({ type: 'string' });
        expect(userSchema.properties['email']).toMatchObject({ type: 'string' });
        expect(userSchema.properties['viewCount']).toBeUndefined(); // on Post, not User
    });

    it('Post output schema has correct field types', () => {
        const postSchema = spec.components.schemas['Post'];
        expect(postSchema).toBeDefined();
        expect(postSchema.properties['viewCount']).toMatchObject({ type: 'integer' });
        expect(postSchema.properties['published']).toMatchObject({ type: 'boolean' });
        expect(postSchema.properties['createdAt']).toMatchObject({ type: 'string', format: 'date-time' });
    });

    it('response wrapper has data and meta properties', () => {
        const userResponse = spec.components.schemas['UserResponse'];
        expect(userResponse).toBeDefined();
        expect(userResponse.properties?.data).toBeDefined();
        expect(userResponse.properties?.meta).toBeDefined();
    });

    it('GET ops have q query parameter', () => {
        const findManyOp = spec.paths['/user/findMany'].get;
        expect(findManyOp.parameters).toBeDefined();
        const qParam = findManyOp.parameters.find((p: any) => p.name === 'q');
        expect(qParam).toBeDefined();
        expect(qParam.in).toBe('query');
    });

    it('POST ops have request body', () => {
        const createOp = spec.paths['/user/create'].post;
        expect(createOp.requestBody).toBeDefined();
        expect(createOp.requestBody.required).toBe(true);
    });

    it('PATCH ops have request body', () => {
        const updateOp = spec.paths['/user/update'].patch;
        expect(updateOp.requestBody).toBeDefined();
    });

    it('DELETE ops have q query parameter', () => {
        const deleteOp = spec.paths['/user/delete'].delete;
        expect(deleteOp.parameters).toBeDefined();
        const qParam = deleteOp.parameters.find((p: any) => p.name === 'q');
        expect(qParam).toBeDefined();
    });

    it('shared error schema exists', () => {
        expect(spec.components.schemas['_ErrorResponse']).toBeDefined();
        expect(spec.components.schemas['_Meta']).toBeDefined();
    });

    it('custom openApiOptions are reflected in info', async () => {
        const client = await createTestClient(schema);
        const customHandler = new RPCApiHandler({
            schema: client.$schema,
        });
        const customSpec = await customHandler.generateSpec({
            title: 'My RPC API',
            version: '3.0.0',
        });
        expect(customSpec.info.title).toBe('My RPC API');
        expect(customSpec.info.version).toBe('3.0.0');
    });
});

describe('RPC OpenAPI spec generation - queryOptions', () => {
    it('omit excludes fields from output schema', async () => {
        const client = await createTestClient(schema);
        const handler = new RPCApiHandler({
            schema: client.$schema,
            queryOptions: { omit: { User: { email: true } } },
        });
        const s = await handler.generateSpec();
        const userSchema = s.components?.schemas?.['User'] as any;
        expect(userSchema.properties['id']).toBeDefined();
        expect(userSchema.properties['email']).toBeUndefined();
    });

    it('slicing excludedModels removes model from spec', async () => {
        const client = await createTestClient(schema);
        const handler = new RPCApiHandler({
            schema: client.$schema,
            queryOptions: { slicing: { excludedModels: ['Post'] as any } },
        });
        const s = await handler.generateSpec();
        expect(s.paths?.['/user/findMany']).toBeDefined();
        expect(s.paths?.['/post/findMany']).toBeUndefined();
        expect(s.components?.schemas?.['Post']).toBeUndefined();
    });

    it('slicing includedModels limits models in spec', async () => {
        const client = await createTestClient(schema);
        const handler = new RPCApiHandler({
            schema: client.$schema,
            queryOptions: { slicing: { includedModels: ['User'] as any } },
        });
        const s = await handler.generateSpec();
        expect(s.paths?.['/user/findMany']).toBeDefined();
        expect(s.paths?.['/post/findMany']).toBeUndefined();
    });

    it('slicing excludedOperations removes operations from spec', async () => {
        const client = await createTestClient(schema);
        const handler = new RPCApiHandler({
            schema: client.$schema,
            queryOptions: {
                slicing: {
                    models: { user: { excludedOperations: ['create', 'delete'] } } as any,
                },
            },
        });
        const s = await handler.generateSpec();
        expect(s.paths?.['/user/findMany']).toBeDefined();
        expect(s.paths?.['/user/create']).toBeUndefined();
        expect(s.paths?.['/user/delete']).toBeUndefined();
        // Post unaffected
        expect(s.paths?.['/post/create']).toBeDefined();
    });

    it('slicing $all excludedOperations applies to all models', async () => {
        const client = await createTestClient(schema);
        const handler = new RPCApiHandler({
            schema: client.$schema,
            queryOptions: {
                slicing: {
                    models: { $all: { excludedOperations: ['delete', 'deleteMany'] } } as any,
                },
            },
        });
        const s = await handler.generateSpec();
        expect(s.paths?.['/user/delete']).toBeUndefined();
        expect(s.paths?.['/post/delete']).toBeUndefined();
        expect(s.paths?.['/user/findMany']).toBeDefined();
    });

    it('where input has filter operators by default', async () => {
        const client = await createTestClient(schema);
        const handler = new RPCApiHandler({ schema: client.$schema });
        const s = await handler.generateSpec();
        const whereInput = s.components?.schemas?.['PostWhereInput'] as any;

        // String field (title): Equality + Like operators
        const titleFilter = whereInput.properties['title'];
        expect(titleFilter).toBeDefined();
        // oneOf [baseType, filterObject]
        expect(titleFilter.oneOf).toHaveLength(2);
        const titleFilterObj = titleFilter.oneOf[1];
        expect(titleFilterObj.properties['equals']).toBeDefined();
        expect(titleFilterObj.properties['not']).toBeDefined();
        expect(titleFilterObj.properties['in']).toBeDefined();
        expect(titleFilterObj.properties['contains']).toBeDefined();
        expect(titleFilterObj.properties['startsWith']).toBeDefined();
        expect(titleFilterObj.properties['endsWith']).toBeDefined();

        // Int field (viewCount): Equality + Range operators
        const vcFilter = whereInput.properties['viewCount'];
        expect(vcFilter).toBeDefined();
        const vcFilterObj = vcFilter.oneOf[1];
        expect(vcFilterObj.properties['equals']).toBeDefined();
        expect(vcFilterObj.properties['lt']).toBeDefined();
        expect(vcFilterObj.properties['gte']).toBeDefined();
        // Should not have Like operators
        expect(vcFilterObj.properties['contains']).toBeUndefined();
    });

    it('slicing excludedFilterKinds removes specific operators from where input', async () => {
        const client = await createTestClient(schema);
        const handler = new RPCApiHandler({
            schema: client.$schema,
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
        const whereInput = s.components?.schemas?.['PostWhereInput'] as any;

        // title: Equality operators remain, Like operators removed
        const titleFilter = whereInput.properties['title'];
        expect(titleFilter).toBeDefined();
        const titleFilterObj = titleFilter.oneOf[1];
        expect(titleFilterObj.properties['equals']).toBeDefined();
        expect(titleFilterObj.properties['in']).toBeDefined();
        expect(titleFilterObj.properties['contains']).toBeUndefined();
        expect(titleFilterObj.properties['startsWith']).toBeUndefined();

        // viewCount: Equality operators remain, Range operators removed
        const vcFilter = whereInput.properties['viewCount'];
        expect(vcFilter).toBeDefined();
        const vcFilterObj = vcFilter.oneOf[1];
        expect(vcFilterObj.properties['equals']).toBeDefined();
        expect(vcFilterObj.properties['lt']).toBeUndefined();
        expect(vcFilterObj.properties['gte']).toBeUndefined();
    });

    it('slicing excludedFilterKinds removes all operators removes field entirely', async () => {
        const client = await createTestClient(schema);
        const handler = new RPCApiHandler({
            schema: client.$schema,
            queryOptions: {
                slicing: {
                    models: {
                        post: {
                            fields: {
                                title: { excludedFilterKinds: ['Equality', 'Like'] },
                            },
                        },
                    },
                } as any,
            },
        });
        const s = await handler.generateSpec();
        const whereInput = s.components?.schemas?.['PostWhereInput'] as any;
        // All filter kinds for title excluded -> field removed
        expect(whereInput.properties['title']).toBeUndefined();
        // viewCount unaffected
        expect(whereInput.properties['viewCount']).toBeDefined();
    });

    it('slicing includedFilterKinds limits operators in where input', async () => {
        const client = await createTestClient(schema);
        const handler = new RPCApiHandler({
            schema: client.$schema,
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
        const whereInput = s.components?.schemas?.['PostWhereInput'] as any;

        // title: only Equality operators
        const titleFilter = whereInput.properties['title'];
        expect(titleFilter).toBeDefined();
        const titleFilterObj = titleFilter.oneOf[1];
        expect(titleFilterObj.properties['equals']).toBeDefined();
        expect(titleFilterObj.properties['not']).toBeDefined();
        // Like operators excluded
        expect(titleFilterObj.properties['contains']).toBeUndefined();
        expect(titleFilterObj.properties['startsWith']).toBeUndefined();
    });

    it('slicing excludedFilterKinds on Equality removes shorthand and equality ops', async () => {
        const client = await createTestClient(schema);
        const handler = new RPCApiHandler({
            schema: client.$schema,
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
        const whereInput = s.components?.schemas?.['PostWhereInput'] as any;

        // title: no shorthand (no oneOf), just the filter object with Like operators
        const titleFilter = whereInput.properties['title'];
        expect(titleFilter).toBeDefined();
        expect(titleFilter.oneOf).toBeUndefined();
        expect(titleFilter.type).toBe('object');
        expect(titleFilter.properties['equals']).toBeUndefined();
        expect(titleFilter.properties['contains']).toBeDefined();
        expect(titleFilter.properties['startsWith']).toBeDefined();
    });

    it('slicing $all field applies filter kind restriction to all fields', async () => {
        const client = await createTestClient(schema);
        const handler = new RPCApiHandler({
            schema: client.$schema,
            queryOptions: {
                slicing: {
                    models: {
                        post: {
                            fields: {
                                $all: { excludedFilterKinds: ['Equality', 'Range', 'Like', 'List', 'Json'] },
                            },
                        },
                    },
                } as any,
            },
        });
        const s = await handler.generateSpec();
        const whereInput = s.components?.schemas?.['PostWhereInput'] as any;
        // All filter kinds excluded -> no field properties
        expect(whereInput.properties['title']).toBeUndefined();
        expect(whereInput.properties['viewCount']).toBeUndefined();
        // Logical combinators still exist
        expect(whereInput.properties['AND']).toBeDefined();
        expect(whereInput.properties['OR']).toBeDefined();
    });
});

describe('RPC OpenAPI spec generation - select/include/omit schemas', () => {
    let spec: any;

    beforeAll(async () => {
        const client = await createTestClient(schema);
        const handler = new RPCApiHandler({ schema: client.$schema });
        spec = await handler.generateSpec();
    });

    it('Select schema lists all fields with boolean type', () => {
        const userSelect = spec.components.schemas['UserSelect'];
        expect(userSelect).toBeDefined();
        expect(userSelect.type).toBe('object');
        // Scalar fields are boolean
        expect(userSelect.properties['id']).toEqual({ type: 'boolean' });
        expect(userSelect.properties['email']).toEqual({ type: 'boolean' });
        expect(userSelect.properties['createdAt']).toEqual({ type: 'boolean' });
    });

    it('Select schema allows nested select/include/omit for relation fields', () => {
        const userSelect = spec.components.schemas['UserSelect'];
        // Relation field: oneOf [boolean, nested object]
        const postsField = userSelect.properties['posts'];
        expect(postsField.oneOf).toHaveLength(2);
        expect(postsField.oneOf[0]).toEqual({ type: 'boolean' });
        const nested = postsField.oneOf[1];
        expect(nested.type).toBe('object');
        expect(nested.properties['select'].$ref).toBe('#/components/schemas/PostSelect');
        expect(nested.properties['include'].$ref).toBe('#/components/schemas/PostInclude');
        expect(nested.properties['omit'].$ref).toBe('#/components/schemas/PostOmit');
    });

    it('Select schema includes FK fields', () => {
        const postSelect = spec.components.schemas['PostSelect'];
        expect(postSelect.properties['authorId']).toEqual({ type: 'boolean' });
    });

    it('Include schema lists only relation fields', () => {
        const userInclude = spec.components.schemas['UserInclude'];
        expect(userInclude).toBeDefined();
        expect(userInclude.type).toBe('object');
        // Relation field present with nested select/include/omit
        expect(userInclude.properties['posts']).toBeDefined();
        expect(userInclude.properties['posts'].oneOf).toHaveLength(2);
        // Scalar fields absent
        expect(userInclude.properties['id']).toBeUndefined();
        expect(userInclude.properties['email']).toBeUndefined();
    });

    it('Include schema is not generated for models without relations', async () => {
        const noRelSchema = `
model Item {
    id Int @id @default(autoincrement())
    name String
}
`;
        const client = await createTestClient(noRelSchema);
        const handler = new RPCApiHandler({ schema: client.$schema });
        const s = await handler.generateSpec();
        expect(s.components?.schemas?.['ItemSelect']).toBeDefined();
        expect(s.components?.schemas?.['ItemInclude']).toBeUndefined();
        expect(s.components?.schemas?.['ItemOmit']).toBeDefined();
        // Args should not have include
        const findManyArgs = s.components?.schemas?.['ItemFindManyArgs'] as any;
        expect(findManyArgs.properties['select']).toBeDefined();
        expect(findManyArgs.properties['include']).toBeUndefined();
        expect(findManyArgs.properties['omit']).toBeDefined();
    });

    it('Omit schema lists only non-relation fields', () => {
        const userOmit = spec.components.schemas['UserOmit'];
        expect(userOmit).toBeDefined();
        expect(userOmit.type).toBe('object');
        // Scalar fields present
        expect(userOmit.properties['id']).toEqual({ type: 'boolean' });
        expect(userOmit.properties['email']).toEqual({ type: 'boolean' });
        // Relation fields absent
        expect(userOmit.properties['posts']).toBeUndefined();

        // FK fields included
        const postOmit = spec.components.schemas['PostOmit'];
        expect(postOmit.properties['authorId']).toEqual({ type: 'boolean' });
    });

    it('Args schemas reference Select/Include/Omit via $ref', () => {
        const createArgs = spec.components.schemas['UserCreateArgs'];
        expect(createArgs.properties['select'].$ref).toBe('#/components/schemas/UserSelect');
        expect(createArgs.properties['include'].$ref).toBe('#/components/schemas/UserInclude');
        expect(createArgs.properties['omit'].$ref).toBe('#/components/schemas/UserOmit');

        const findManyArgs = spec.components.schemas['UserFindManyArgs'];
        expect(findManyArgs.properties['select'].$ref).toBe('#/components/schemas/UserSelect');
        expect(findManyArgs.properties['include'].$ref).toBe('#/components/schemas/UserInclude');
        expect(findManyArgs.properties['omit'].$ref).toBe('#/components/schemas/UserOmit');
    });

    it('createManyAndReturn and updateManyAndReturn args have select/include/omit', () => {
        const createManyAndReturnArgs = spec.components.schemas['UserCreateManyAndReturnArgs'];
        expect(createManyAndReturnArgs).toBeDefined();
        expect(createManyAndReturnArgs.properties['data']).toBeDefined();
        expect(createManyAndReturnArgs.properties['select'].$ref).toBe('#/components/schemas/UserSelect');
        expect(createManyAndReturnArgs.properties['include'].$ref).toBe('#/components/schemas/UserInclude');
        expect(createManyAndReturnArgs.properties['omit'].$ref).toBe('#/components/schemas/UserOmit');

        const updateManyAndReturnArgs = spec.components.schemas['UserUpdateManyAndReturnArgs'];
        expect(updateManyAndReturnArgs).toBeDefined();
        expect(updateManyAndReturnArgs.properties['data']).toBeDefined();
        expect(updateManyAndReturnArgs.properties['select'].$ref).toBe('#/components/schemas/UserSelect');
        expect(updateManyAndReturnArgs.properties['include'].$ref).toBe('#/components/schemas/UserInclude');
        expect(updateManyAndReturnArgs.properties['omit'].$ref).toBe('#/components/schemas/UserOmit');
    });

    it('createMany and updateMany args do not have select/include/omit', () => {
        const createManyArgs = spec.components.schemas['UserCreateManyArgs'];
        expect(createManyArgs.properties['select']).toBeUndefined();
        expect(createManyArgs.properties['include']).toBeUndefined();
        expect(createManyArgs.properties['omit']).toBeUndefined();

        const updateManyArgs = spec.components.schemas['UserUpdateManyArgs'];
        expect(updateManyArgs.properties['select']).toBeUndefined();
        expect(updateManyArgs.properties['include']).toBeUndefined();
        expect(updateManyArgs.properties['omit']).toBeUndefined();
    });

    it('select/include exclude relations to excluded models', async () => {
        const client = await createTestClient(schema);
        const handler = new RPCApiHandler({
            schema: client.$schema,
            queryOptions: { slicing: { excludedModels: ['Post'] as any } },
        });
        const s = await handler.generateSpec();

        const userSelect = s.components?.schemas?.['UserSelect'] as any;
        expect(userSelect.properties['id']).toBeDefined();
        // posts relation to excluded Post model should be absent
        expect(userSelect.properties['posts']).toBeUndefined();

        // Include should not have posts either
        // User still has relations in schema, but all are excluded so Include may or may not exist
        const userInclude = s.components?.schemas?.['UserInclude'] as any;
        if (userInclude) {
            expect(userInclude.properties['posts']).toBeUndefined();
        }
    });
});

describe('RPC OpenAPI spec generation - with enum', () => {
    it('enum schemas appear in components', async () => {
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
        const h = new RPCApiHandler({ schema: client.$schema });
        const s = await h.generateSpec();
        expect(s.components?.schemas?.['PostStatus']).toBeDefined();
        expect((s.components?.schemas?.['PostStatus'] as any).type).toBe('string');
        expect((s.components?.schemas?.['PostStatus'] as any).enum).toContain('DRAFT');
    });
});

describe('RPC OpenAPI spec generation - @meta description', () => {
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
        const handler = new RPCApiHandler({ schema: client.$schema });
        const s = await handler.generateSpec();

        const userSchema = s.components?.schemas?.['User'] as any;
        expect(userSchema.description).toBe('A user of the system');

        // Post has no @@meta description
        const postSchema = s.components?.schemas?.['Post'] as any;
        expect(postSchema.description).toBeUndefined();
    });

    it('field @meta description is used as field schema description', async () => {
        const client = await createTestClient(metaSchema);
        const handler = new RPCApiHandler({ schema: client.$schema });
        const s = await handler.generateSpec();

        const userSchema = s.components?.schemas?.['User'] as any;
        expect(userSchema.properties['email'].description).toBe("The user's email address");

        // id has no @meta description
        expect(userSchema.properties['id'].description).toBeUndefined();
    });
});

describe('RPC OpenAPI spec generation - with procedures', () => {
    it('procedure paths are generated', async () => {
        const schemaWithProc = `
model User {
    id String @id @default(cuid())
    email String @unique
}

procedure getUser(id: String): String
mutation procedure createUser(email: String): String
`;
        const client = await createTestClient(schemaWithProc);
        const h = new RPCApiHandler({ schema: client.$schema });
        const s = await h.generateSpec();
        expect(s.paths?.['/$procs/getUser']).toBeDefined();
        expect(s.paths?.['/$procs/getUser']?.get).toBeDefined();
        expect(s.paths?.['/$procs/createUser']).toBeDefined();
        expect(s.paths?.['/$procs/createUser']?.post).toBeDefined();
    });
});
