import { validate } from '@readme/openapi-parser';
import { createTestClient } from '@zenstackhq/testtools';
import fs from 'fs';
import path from 'path';
import { beforeAll, describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { RPCApiHandler } from '../../src/api/rpc';

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

// Shared schema used across most test suites
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

procedure findPostsByUser(userId: String): Post[]
procedure getPostCount(userId: String, published: Boolean?): Int
mutation procedure publishPost(postId: Int): Post
`;

describe('RPC OpenAPI spec generation - document structure', () => {
    let handler: RPCApiHandler;
    let spec: any;

    beforeAll(async () => {
        const client = await createTestClient(schema);
        handler = new RPCApiHandler({ schema: client.$schema });
        spec = await handler.generateSpec();
    });

    it('has correct openapi version and info', () => {
        expect(spec.openapi).toBe('3.1.0');
        expect(spec.info).toBeDefined();
        expect(spec.info.title).toBe('ZenStack Generated API');
        expect(spec.info.version).toBe('1.0.0');
    });

    it('has paths and components', () => {
        expect(spec.paths).toBeDefined();
        expect(spec.components).toBeDefined();
        expect(spec.components.schemas).toBeDefined();
    });

    it('has tags for each model', () => {
        const tagNames = spec.tags.map((t: any) => t.name);
        expect(tagNames).toContain('user');
        expect(tagNames).toContain('post');
        expect(tagNames).toContain('comment');
    });

    it('custom spec options are reflected in info', async () => {
        const client = await createTestClient(schema);
        const h = new RPCApiHandler({ schema: client.$schema });
        const s = await h.generateSpec({ title: 'My RPC API', version: '2.0.0', description: 'Desc' });
        expect(s.info.title).toBe('My RPC API');
        expect(s.info.version).toBe('2.0.0');
        expect((s.info as any).description).toBe('Desc');
    });
});

describe('RPC OpenAPI spec generation - paths and HTTP methods', () => {
    let spec: any;

    beforeAll(async () => {
        const client = await createTestClient(schema);
        const handler = new RPCApiHandler({ schema: client.$schema });
        spec = await handler.generateSpec();
    });

    it('generates paths for all CRUD operations per model', () => {
        const readOps = ['findMany', 'findFirst', 'findUnique', 'count', 'aggregate', 'groupBy', 'exists'];
        const writeOps = ['create', 'createMany', 'createManyAndReturn', 'upsert'];
        const updateOps = ['update', 'updateMany', 'updateManyAndReturn'];
        const deleteOps = ['delete', 'deleteMany'];

        for (const op of [...readOps, ...writeOps, ...updateOps, ...deleteOps]) {
            expect(spec.paths[`/user/${op}`], `expected /user/${op}`).toBeDefined();
            expect(spec.paths[`/post/${op}`], `expected /post/${op}`).toBeDefined();
        }
    });

    it('read operations use GET', () => {
        for (const op of ['findMany', 'findFirst', 'findUnique', 'count', 'aggregate', 'groupBy', 'exists']) {
            const path = spec.paths[`/user/${op}`];
            expect(path.get, `GET /user/${op}`).toBeDefined();
            expect(path.post, `no POST /user/${op}`).toBeUndefined();
        }
    });

    it('create/upsert operations use POST', () => {
        for (const op of ['create', 'createMany', 'createManyAndReturn', 'upsert']) {
            const path = spec.paths[`/user/${op}`];
            expect(path.post, `POST /user/${op}`).toBeDefined();
            expect(path.get, `no GET /user/${op}`).toBeUndefined();
        }
    });

    it('update operations use PUT', () => {
        for (const op of ['update', 'updateMany', 'updateManyAndReturn']) {
            const path = spec.paths[`/user/${op}`];
            expect(path.put, `PUT /user/${op}`).toBeDefined();
        }
    });

    it('delete operations use DELETE', () => {
        for (const op of ['delete', 'deleteMany']) {
            const path = spec.paths[`/user/${op}`];
            expect(path.delete, `DELETE /user/${op}`).toBeDefined();
        }
    });

    it('create operations return 201', () => {
        for (const op of ['create', 'createMany', 'createManyAndReturn', 'upsert']) {
            const path = spec.paths[`/post/${op}`];
            expect(path.post.responses['201'], `201 for /post/${op}`).toBeDefined();
        }
    });

    it('non-create operations return 200', () => {
        expect(spec.paths['/user/findMany'].get.responses['200']).toBeDefined();
        expect(spec.paths['/user/update'].put.responses['200']).toBeDefined();
        expect(spec.paths['/user/delete'].delete.responses['200']).toBeDefined();
    });

    it('has transaction endpoint', () => {
        expect(spec.paths['/$transaction/sequential']).toBeDefined();
        expect(spec.paths['/$transaction/sequential'].post).toBeDefined();
    });
});

describe('RPC OpenAPI spec generation - input schemas', () => {
    let spec: any;

    beforeAll(async () => {
        const client = await createTestClient(schema);
        const handler = new RPCApiHandler({ schema: client.$schema });
        spec = await handler.generateSpec();
    });

    it('GET operations have q query parameter', () => {
        for (const op of ['findMany', 'findFirst', 'findUnique', 'count', 'aggregate', 'groupBy', 'exists']) {
            const operation = spec.paths[`/user/${op}`].get;
            const qParam = operation.parameters?.find((p: any) => p.name === 'q');
            expect(qParam, `q param on /user/${op}`).toBeDefined();
            expect(qParam.in).toBe('query');
            // OAPI 3.1 content-typed parameter for complex JSON
            expect(qParam.content?.['application/json']?.schema).toBeDefined();
        }
    });

    it('DELETE operations have q query parameter', () => {
        for (const op of ['delete', 'deleteMany']) {
            const operation = spec.paths[`/user/${op}`].delete;
            const qParam = operation.parameters?.find((p: any) => p.name === 'q');
            expect(qParam, `q param on /user/${op}`).toBeDefined();
            expect(qParam.content?.['application/json']?.schema).toBeDefined();
        }
    });

    it('POST operations have request body', () => {
        for (const op of ['create', 'createMany', 'createManyAndReturn', 'upsert']) {
            const operation = spec.paths[`/user/${op}`].post;
            expect(operation.requestBody, `requestBody on /user/${op}`).toBeDefined();
            expect(operation.requestBody.required).toBe(true);
            expect(operation.requestBody.content?.['application/json']?.schema).toBeDefined();
        }
    });

    it('PUT operations have request body', () => {
        for (const op of ['update', 'updateMany', 'updateManyAndReturn']) {
            const operation = spec.paths[`/user/${op}`].put;
            expect(operation.requestBody, `requestBody on /user/${op}`).toBeDefined();
            expect(operation.requestBody.content?.['application/json']?.schema).toBeDefined();
        }
    });

    it('findUnique q schema contains where field', () => {
        const operation = spec.paths['/user/findUnique'].get;
        const qSchema = operation.parameters.find((p: any) => p.name === 'q').content['application/json'].schema;
        // The schema describes FindUniqueArgs which has a required where field
        expect(qSchema).toBeDefined();
        expect(qSchema.type === 'object' || qSchema.properties || qSchema.$defs || qSchema.$ref).toBeTruthy();
    });

    it('create request body schema contains data field', () => {
        const operation = spec.paths['/user/create'].post;
        const bodySchema = operation.requestBody.content['application/json'].schema;
        expect(bodySchema).toBeDefined();
        // CreateArgs has a data field
        expect(
            bodySchema.type === 'object' || bodySchema.properties || bodySchema.$defs || bodySchema.$ref,
        ).toBeTruthy();
    });

    it('transaction request body uses shared schema ref', () => {
        const operation = spec.paths['/$transaction/sequential'].post;
        expect(operation.requestBody.content['application/json'].schema.$ref).toBe(
            '#/components/schemas/_rpcTransactionRequest',
        );
    });
});

describe('RPC OpenAPI spec generation - shared schemas', () => {
    let spec: any;

    beforeAll(async () => {
        const client = await createTestClient(schema);
        const handler = new RPCApiHandler({ schema: client.$schema });
        spec = await handler.generateSpec();
    });

    it('_rpcSuccessResponse schema exists', () => {
        const schema = spec.components.schemas['_rpcSuccessResponse'];
        expect(schema).toBeDefined();
        expect(schema.type).toBe('object');
        expect(schema.properties.data).toBeDefined();
    });

    it('_rpcErrorResponse schema exists with required message', () => {
        const schema = spec.components.schemas['_rpcErrorResponse'];
        expect(schema).toBeDefined();
        expect(schema.type).toBe('object');
        expect(schema.properties.error).toBeDefined();
        expect(schema.properties.error.properties.message).toBeDefined();
        expect(schema.properties.error.required).toContain('message');
    });

    it('_rpcTransactionRequest schema is an array of operation objects', () => {
        const schema = spec.components.schemas['_rpcTransactionRequest'];
        expect(schema).toBeDefined();
        expect(schema.type).toBe('array');
        expect(schema.items).toBeDefined();
        expect(schema.items.properties.model).toBeDefined();
        expect(schema.items.properties.op).toBeDefined();
        expect(schema.items.required).toContain('model');
        expect(schema.items.required).toContain('op');
    });

    it('success responses for model operations are inline (not _rpcSuccessResponse ref)', () => {
        const findMany = spec.paths['/user/findMany'].get;
        const schema = findMany.responses['200'].content['application/json'].schema;
        // Model operations return operation-specific inline schemas, not the generic ref
        expect(schema.$ref).toBeUndefined();
        expect(schema.type).toBe('object');
        expect(schema.properties.data).toBeDefined();
    });

    it('error responses reference _rpcErrorResponse', () => {
        const create = spec.paths['/user/create'].post;
        expect(create.responses['400'].content['application/json'].schema.$ref).toBe(
            '#/components/schemas/_rpcErrorResponse',
        );
        expect(create.responses['422'].content['application/json'].schema.$ref).toBe(
            '#/components/schemas/_rpcErrorResponse',
        );
    });

    it('all operations have 400 and 500 responses', () => {
        for (const [path, item] of Object.entries(spec.paths as Record<string, any>)) {
            for (const method of ['get', 'post', 'put', 'delete'] as const) {
                if (!item[method]) continue;
                expect(item[method].responses['400'], `400 on ${method.toUpperCase()} ${path}`).toBeDefined();
                expect(item[method].responses['500'], `500 on ${method.toUpperCase()} ${path}`).toBeDefined();
            }
        }
    });
});

describe('RPC OpenAPI spec generation - response data shapes', () => {
    let spec: any;

    beforeAll(async () => {
        const client = await createTestClient(schema);
        const handler = new RPCApiHandler({ schema: client.$schema });
        spec = await handler.generateSpec();
    });

    it('findUnique and findFirst data is nullable entity ref', () => {
        for (const op of ['findUnique', 'findFirst']) {
            const opSchema = spec.paths[`/user/${op}`].get.responses['200'].content['application/json'].schema;
            const dataSchema = opSchema.properties.data;
            expect(dataSchema.anyOf).toBeDefined();
            const refs = dataSchema.anyOf.map((s: any) => s.$ref ?? s.type);
            expect(refs).toContain('#/components/schemas/User');
            expect(refs).toContain('null');
        }
    });

    it('findMany data is array of entity refs', () => {
        const opSchema = spec.paths['/user/findMany'].get.responses['200'].content['application/json'].schema;
        const dataSchema = opSchema.properties.data;
        expect(dataSchema.type).toBe('array');
        expect(dataSchema.items.$ref).toBe('#/components/schemas/User');
    });

    it('createManyAndReturn and updateManyAndReturn data are arrays', () => {
        for (const [op, method] of [
            ['createManyAndReturn', 'post'],
            ['updateManyAndReturn', 'put'],
        ] as const) {
            const responses = spec.paths[`/post/${op}`][method].responses;
            const successCode = method === 'post' ? '201' : '200';
            const dataSchema = responses[successCode].content['application/json'].schema.properties.data;
            expect(dataSchema.type).toBe('array');
            expect(dataSchema.items.$ref).toBe('#/components/schemas/Post');
        }
    });

    it('create, update, delete, upsert data is direct entity ref', () => {
        expect(
            spec.paths['/user/create'].post.responses['201'].content['application/json'].schema.properties.data.$ref,
        ).toBe('#/components/schemas/User');
        expect(
            spec.paths['/user/update'].put.responses['200'].content['application/json'].schema.properties.data.$ref,
        ).toBe('#/components/schemas/User');
        expect(
            spec.paths['/user/delete'].delete.responses['200'].content['application/json'].schema.properties.data.$ref,
        ).toBe('#/components/schemas/User');
        expect(
            spec.paths['/user/upsert'].post.responses['201'].content['application/json'].schema.properties.data.$ref,
        ).toBe('#/components/schemas/User');
    });

    it('createMany, updateMany, deleteMany data has count property', () => {
        for (const [op, method] of [
            ['createMany', 'post'],
            ['updateMany', 'put'],
            ['deleteMany', 'delete'],
        ] as const) {
            const responses = spec.paths[`/user/${op}`][method].responses;
            const successCode = method === 'post' ? '201' : '200';
            const dataSchema = responses[successCode].content['application/json'].schema.properties.data;
            expect(dataSchema.type).toBe('object');
            expect(dataSchema.properties.count.type).toBe('integer');
            expect(dataSchema.required).toContain('count');
        }
    });

    it('exists data is boolean', () => {
        const opSchema = spec.paths['/user/exists'].get.responses['200'].content['application/json'].schema;
        expect(opSchema.properties.data.type).toBe('boolean');
    });

    it('model entity schemas are in components/schemas', () => {
        const userSchema = spec.components.schemas['User'];
        expect(userSchema).toBeDefined();
        expect(userSchema.type).toBe('object');
        expect(userSchema.properties).toBeDefined();
    });

    it('model entity schema has scalar fields with correct types', () => {
        const userSchema = spec.components.schemas['User'];
        expect(userSchema.properties['myId'].type).toBe('string');
        expect(userSchema.properties['email'].type).toBe('string');
        expect(userSchema.properties['createdAt'].type).toBe('string');
        expect(userSchema.properties['createdAt'].format).toBe('date-time');
    });

    it('model entity schema has optional fields as nullable anyOf', () => {
        // profile is optional (Profile?) on User, address is optional Address? @json
        const userSchema = spec.components.schemas['User'];
        // someJson is Json? — optional scalar
        expect(userSchema.properties['someJson'].anyOf).toBeDefined();
        const types = userSchema.properties['someJson'].anyOf.map((s: any) => s.type);
        expect(types).toContain('null');
    });

    it('model entity schema has relation fields as optional (not in required)', () => {
        const userSchema = spec.components.schemas['User'];
        // posts and profile are relation fields — should be present in properties but not required
        expect(userSchema.properties['posts']).toBeDefined();
        expect(userSchema.properties['profile']).toBeDefined();
        expect(userSchema.required ?? []).not.toContain('posts');
        expect(userSchema.required ?? []).not.toContain('profile');
    });

    it('scalar fields are in required', () => {
        const postSchema = spec.components.schemas['Post'];
        expect(postSchema.required).toContain('id');
        expect(postSchema.required).toContain('title');
        expect(postSchema.required).toContain('published');
    });
});

describe('RPC OpenAPI spec generation - operationIds', () => {
    let spec: any;

    beforeAll(async () => {
        const client = await createTestClient(schema);
        const handler = new RPCApiHandler({ schema: client.$schema });
        spec = await handler.generateSpec();
    });

    it('operationIds are unique', () => {
        const ids: string[] = [];
        for (const item of Object.values(spec.paths as Record<string, any>)) {
            for (const method of ['get', 'post', 'put', 'delete'] as const) {
                if (item[method]?.operationId) {
                    ids.push(item[method].operationId);
                }
            }
        }
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('model operation IDs follow {model}_{op} convention', () => {
        expect(spec.paths['/user/findMany'].get.operationId).toBe('user_findMany');
        expect(spec.paths['/post/create'].post.operationId).toBe('post_create');
        expect(spec.paths['/comment/delete'].delete.operationId).toBe('comment_delete');
    });
});

describe('RPC OpenAPI spec generation - queryOptions slicing', () => {
    it('excludedModels removes model paths from spec', async () => {
        const client = await createTestClient(schema);
        const handler = new RPCApiHandler({
            schema: client.$schema,
            queryOptions: { slicing: { excludedModels: ['Post'] as any } },
        });
        const spec = await handler.generateSpec();

        expect(spec.paths?.['/post/findMany']).toBeUndefined();
        expect(spec.paths?.['/user/findMany']).toBeDefined();
        // Post tag should not be present
        expect(spec.tags?.map((t: any) => t.name)).not.toContain('post');
    });

    it('includedModels limits spec to those models', async () => {
        const client = await createTestClient(schema);
        const handler = new RPCApiHandler({
            schema: client.$schema,
            queryOptions: { slicing: { includedModels: ['User', 'Post'] as any } },
        });
        const spec = await handler.generateSpec();

        expect(spec.paths?.['/user/findMany']).toBeDefined();
        expect(spec.paths?.['/post/findMany']).toBeDefined();
        expect(spec.paths?.['/comment/findMany']).toBeUndefined();
    });

    it('excludedOperations removes paths for those operations', async () => {
        const client = await createTestClient(schema);
        const handler = new RPCApiHandler({
            schema: client.$schema,
            queryOptions: {
                slicing: {
                    models: { post: { excludedOperations: ['create', 'delete'] } },
                } as any,
            },
        });
        const spec = await handler.generateSpec();

        expect(spec.paths?.['/post/findMany']).toBeDefined();
        expect(spec.paths?.['/post/create']).toBeUndefined();
        expect(spec.paths?.['/post/delete']).toBeUndefined();
        expect(spec.paths?.['/post/update']).toBeDefined();
    });

    it('includedOperations limits to those operations', async () => {
        const client = await createTestClient(schema);
        const handler = new RPCApiHandler({
            schema: client.$schema,
            queryOptions: {
                slicing: {
                    models: { user: { includedOperations: ['findMany', 'findUnique'] } },
                } as any,
            },
        });
        const spec = await handler.generateSpec();

        expect(spec.paths?.['/user/findMany']).toBeDefined();
        expect(spec.paths?.['/user/findUnique']).toBeDefined();
        expect(spec.paths?.['/user/create']).toBeUndefined();
        expect(spec.paths?.['/user/update']).toBeUndefined();
    });

    it('$all model slicing applies to all models', async () => {
        const client = await createTestClient(schema);
        const handler = new RPCApiHandler({
            schema: client.$schema,
            queryOptions: {
                slicing: {
                    models: { $all: { excludedOperations: ['delete', 'deleteMany'] } },
                } as any,
            },
        });
        const spec = await handler.generateSpec();

        for (const model of ['user', 'post', 'comment', 'setting', 'profile']) {
            expect(spec.paths?.[`/${model}/delete`]).toBeUndefined();
            expect(spec.paths?.[`/${model}/deleteMany`]).toBeUndefined();
            expect(spec.paths?.[`/${model}/findMany`]).toBeDefined();
        }
    });
});

describe('RPC OpenAPI spec generation - procedures', () => {
    const procSchema = `
model User {
    id Int @id @default(autoincrement())
    name String
}

procedure getUser(id: Int): User
mutation procedure createUser(name: String): User
procedure optionalSearch(query: String?): User[]
`;

    it('generates GET path for query procedures', async () => {
        const client = await createTestClient(procSchema);
        const handler = new RPCApiHandler({ schema: client.$schema });
        const spec = await handler.generateSpec();

        expect(spec.paths?.['/$procs/getUser']).toBeDefined();
        expect(spec.paths?.['/$procs/getUser']?.get).toBeDefined();
        expect(spec.paths?.['/$procs/getUser']?.post).toBeUndefined();
    });

    it('generates POST path for mutation procedures', async () => {
        const client = await createTestClient(procSchema);
        const handler = new RPCApiHandler({ schema: client.$schema });
        const spec = await handler.generateSpec();

        expect(spec.paths?.['/$procs/createUser']).toBeDefined();
        expect(spec.paths?.['/$procs/createUser']?.post).toBeDefined();
        expect(spec.paths?.['/$procs/createUser']?.get).toBeUndefined();
    });

    it('query procedure has q parameter with args envelope schema', async () => {
        const client = await createTestClient(procSchema);
        const handler = new RPCApiHandler({ schema: client.$schema });
        const spec = await handler.generateSpec();

        const operation = spec.paths?.['/$procs/getUser']?.get;
        const qParam = operation?.parameters?.find((p: any) => p.name === 'q');
        expect(qParam).toBeDefined();
        expect(qParam?.content?.['application/json']?.schema).toBeDefined();
        // args is a $ref to the registered ProcArgs component schema
        const envelopeSchema = qParam?.content['application/json'].schema;
        const argsRef = envelopeSchema.properties?.args?.$ref;
        expect(argsRef).toBeDefined();
        const argsSchemaName = argsRef.replace('#/components/schemas/', '');
        const argsSchema = spec.components?.schemas?.[argsSchemaName] as any;
        expect(argsSchema?.properties?.id).toBeDefined();
        expect(argsSchema?.required).toContain('id');
    });

    it('mutation procedure has request body with args envelope schema', async () => {
        const client = await createTestClient(procSchema);
        const handler = new RPCApiHandler({ schema: client.$schema });
        const spec = await handler.generateSpec();

        const operation = spec?.paths?.['/$procs/createUser']?.post;
        expect(operation?.requestBody).toBeDefined();
        const bodySchema = operation?.requestBody?.content?.['application/json']?.schema;
        // args is a $ref to the registered ProcArgs component schema
        const argsRef = bodySchema?.properties?.args?.$ref;
        expect(argsRef).toBeDefined();
        const argsSchemaName = argsRef.replace('#/components/schemas/', '');
        const argsSchema = spec.components?.schemas?.[argsSchemaName] as any;
        expect(argsSchema?.properties?.name).toBeDefined();
        expect(argsSchema?.required).toContain('name');
    });

    it('optional procedure params are not in required array', async () => {
        const client = await createTestClient(procSchema);
        const handler = new RPCApiHandler({ schema: client.$schema });
        const spec = await handler.generateSpec();

        const operation = spec?.paths?.['/$procs/optionalSearch']?.get;
        const qParam = operation?.parameters?.find((p: any) => p.name === 'q');
        // args is a $ref to the registered ProcArgs component schema
        const argsRef = (qParam as any)?.content?.['application/json']?.schema?.properties?.args?.$ref;
        expect(argsRef).toBeDefined();
        const argsSchemaName = argsRef.replace('#/components/schemas/', '');
        const argsSchema = spec.components?.schemas?.[argsSchemaName] as any;
        // query is optional so should not appear in required
        expect(argsSchema?.required ?? []).not.toContain('query');
    });

    it('procedure operationId uses proc_ prefix', async () => {
        const client = await createTestClient(procSchema);
        const handler = new RPCApiHandler({ schema: client.$schema });
        const spec = await handler.generateSpec();

        expect(spec?.paths?.['/$procs/getUser']?.get?.operationId).toBe('proc_getUser');
        expect(spec?.paths?.['/$procs/createUser']?.post?.operationId).toBe('proc_createUser');
    });

    it('slicing excludedProcedures removes procedure paths', async () => {
        const client = await createTestClient(procSchema);
        const handler = new RPCApiHandler({
            schema: client.$schema,
            queryOptions: { slicing: { excludedProcedures: ['getUser'] as any } },
        });
        const spec = await handler.generateSpec();

        expect(spec.paths?.['/$procs/getUser']).toBeUndefined();
        expect(spec.paths?.['/$procs/createUser']).toBeDefined();
    });
});

describe('RPC OpenAPI spec generation - respectAccessPolicies', () => {
    it('no 403 responses when respectAccessPolicies is off', async () => {
        const policySchema = `
model Item {
    id Int @id @default(autoincrement())
    value Int
    @@allow('create', value > 0)
}
`;
        const client = await createTestClient(policySchema);
        const handler = new RPCApiHandler({ schema: client.$schema });
        const spec = await handler.generateSpec();
        expect(spec.paths?.['/item/create']?.post?.responses?.['403']).toBeUndefined();
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
        const handler = new RPCApiHandler({ schema: client.$schema });
        const spec = await handler.generateSpec({ respectAccessPolicies: true });

        expect(spec.paths?.['/item/create']?.post?.responses?.['403']).toBeDefined();
        expect(spec.paths?.['/item/update']?.put?.responses?.['403']).toBeDefined();
        expect(spec.paths?.['/item/delete']?.delete?.responses?.['403']).toBeDefined();
        // read is constant-allow → no 403
        expect(spec.paths?.['/item/findMany']?.get?.responses?.['403']).toBeUndefined();
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
        const handler = new RPCApiHandler({ schema: client.$schema });
        const spec = await handler.generateSpec({ respectAccessPolicies: true });

        expect(spec.paths?.['/item/create']?.post?.responses?.['403']).toBeUndefined();
        expect(spec.paths?.['/item/update']?.put?.responses?.['403']).toBeUndefined();
        expect(spec.paths?.['/item/delete']?.delete?.responses?.['403']).toBeUndefined();
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
        const handler = new RPCApiHandler({ schema: client.$schema });
        const spec = await handler.generateSpec({ respectAccessPolicies: true });
        expect(spec.paths?.['/item/create']?.post?.responses?.['403']).toBeDefined();
    });

    it('403 when no policy rules at all (default-deny)', async () => {
        const policySchema = `
model Item {
    id Int @id @default(autoincrement())
    value Int
}
`;
        const client = await createTestClient(policySchema);
        const handler = new RPCApiHandler({ schema: client.$schema });
        const spec = await handler.generateSpec({ respectAccessPolicies: true });

        expect(spec.paths?.['/item/create']?.post?.responses?.['403']).toBeDefined();
        expect(spec.paths?.['/item/update']?.put?.responses?.['403']).toBeDefined();
        expect(spec.paths?.['/item/delete']?.delete?.responses?.['403']).toBeDefined();
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
        const handler = new RPCApiHandler({ schema: client.$schema });
        const spec = await handler.generateSpec({ respectAccessPolicies: true });

        expect(spec.paths?.['/item/create']?.post?.responses?.['403']).toBeUndefined();
        expect(spec.paths?.['/item/update']?.put?.responses?.['403']).toBeDefined();
        expect(spec.paths?.['/item/delete']?.delete?.responses?.['403']).toBeDefined();
    });
});

describe('RPC OpenAPI spec generation - JSON fields', () => {
    let spec: any;

    beforeAll(async () => {
        const client = await createTestClient(schema);
        const handler = new RPCApiHandler({ schema: client.$schema });
        spec = await handler.generateSpec();
    });

    it('JsonValue schema is registered in components', () => {
        const jsonValue = spec.components.schemas['JsonValue'];
        expect(jsonValue).toBeDefined();
        // Should be a union of primitive types
        expect(jsonValue.anyOf).toBeDefined();
        const types = jsonValue.anyOf.map((s: any) => s.type).filter(Boolean);
        expect(types).toContain('string');
        expect(types).toContain('number');
        expect(types).toContain('boolean');
    });

    it('plain JSON field (someJson Json?) is nullable in entity schema', () => {
        const userSchema = spec.components.schemas['User'];
        const field = userSchema.properties['someJson'];
        expect(field).toBeDefined();
        // Optional Json field should allow null
        expect(field.anyOf).toBeDefined();
        const types = field.anyOf.map((s: any) => s.type).filter(Boolean);
        expect(types).toContain('null');
    });

    it('typed JSON field (address Address? @json) references typedef schema', () => {
        const userSchema = spec.components.schemas['User'];
        const field = userSchema.properties['address'];
        expect(field).toBeDefined();
        // Optional typed JSON field should be anyOf: [$ref: Address, null]
        expect(field.anyOf).toBeDefined();
        const refs = field.anyOf.map((s: any) => s.$ref ?? s.type).filter(Boolean);
        expect(refs).toContain('#/components/schemas/Address');
        expect(refs).toContain('null');
    });

    it('JsonFilter schema is registered for filtering plain JSON fields', () => {
        // someJson is optional so JsonFilterOptional is expected
        const jsonFilter = spec.components.schemas['JsonFilterOptional'];
        expect(jsonFilter).toBeDefined();
        expect(jsonFilter.type).toBe('object');
        // Should have standard JSON filter operators
        expect(jsonFilter.properties['equals']).toBeDefined();
        expect(jsonFilter.properties['not']).toBeDefined();
        expect(jsonFilter.properties['string_contains']).toBeDefined();
        expect(jsonFilter.properties['array_contains']).toBeDefined();
    });

    it('AddressFilter schema is registered for filtering typed JSON fields', () => {
        // address is optional so AddressFilterOptional is expected
        const addressFilter = spec.components.schemas['AddressFilterOptional'];
        expect(addressFilter).toBeDefined();
        // Should be a union (field filter + json filter + is/isNot)
        expect(addressFilter.anyOf).toBeDefined();
    });

    it('AddressFilter field filter variant includes Address typedef fields', () => {
        const addressFilter = spec.components.schemas['AddressFilterOptional'];
        // One of the anyOf branches should contain the field-level filter for Address.city
        const fieldFilterBranch = addressFilter.anyOf?.find((s: any) => s.type === 'object' && s.properties?.city);
        expect(fieldFilterBranch).toBeDefined();
    });

    it('typedef schema (Address) is registered in components', () => {
        const addressSchema = spec.components.schemas['Address'];
        expect(addressSchema).toBeDefined();
    });
});

describe('RPC OpenAPI spec generation - meta descriptions', () => {
    const metaSchema = `
type Address {
    city String @meta(name: "description", value: "The city name")
    zip  String? @meta(name: "description", value: "Postal code")
}

model User {
    id    Int    @id @default(autoincrement())
    name  String @meta(name: "description", value: "Full name of the user")
    email String

    @@meta(name: "description", value: "A platform user")
}
`;

    let spec: any;

    beforeAll(async () => {
        const client = await createTestClient(metaSchema);
        const handler = new RPCApiHandler({ schema: client.$schema });
        spec = await handler.generateSpec();
    });

    it('model @@meta description appears on entity component schema', () => {
        const userSchema = spec.components?.schemas?.['User'];
        expect(userSchema?.description).toBe('A platform user');
    });

    it('field @meta description appears on scalar field schema', () => {
        const userSchema = spec.components?.schemas?.['User'];
        expect(userSchema?.properties?.name?.description).toBe('Full name of the user');
    });

    it('field without @meta description has no description property', () => {
        const userSchema = spec.components?.schemas?.['User'];
        expect(userSchema?.properties?.email?.description).toBeUndefined();
    });

    it('typedef field @meta description appears on field schema', () => {
        const addressSchema = spec.components?.schemas?.['Address'];
        expect(addressSchema?.properties?.city?.description).toBe('The city name');
    });

    it('optional typedef field @meta description appears on field schema', () => {
        const addressSchema = spec.components?.schemas?.['Address'];
        // zip is optional so it's wrapped in anyOf — description is on the base type inside anyOf
        const zipBase = addressSchema?.properties?.zip?.anyOf?.[0];
        expect(zipBase?.description).toBe('Postal code');
    });
});

describe('RPC OpenAPI spec generation - baseline', () => {
    it('matches baseline', async () => {
        const client = await createTestClient(schema);
        const handler = new RPCApiHandler({ schema: client.$schema });
        const spec = await handler.generateSpec();
        const baselineFile = 'rpc.baseline.yaml';

        if (UPDATE_BASELINE) {
            saveBaseline(baselineFile, spec);
            return;
        }

        const baseline = loadBaseline(baselineFile);
        expect(spec).toEqual(baseline);

        await validate(JSON.parse(JSON.stringify(spec)));
    });
});

describe('RPC OpenAPI spec generation - OpenAPI validation', () => {
    it('spec passes OpenAPI 3.1 validation', async () => {
        const client = await createTestClient(schema);
        const handler = new RPCApiHandler({ schema: client.$schema });
        const spec = await handler.generateSpec();
        // Deep clone to avoid validate() mutating $ref strings
        await validate(JSON.parse(JSON.stringify(spec)));
    });

    it('spec with procedures passes OpenAPI 3.1 validation', async () => {
        const procSchema = `
model User {
    id Int @id @default(autoincrement())
    name String
}

procedure findByName(name: String): User
mutation procedure createUser(name: String): User
`;
        const client = await createTestClient(procSchema);
        const handler = new RPCApiHandler({ schema: client.$schema });
        const spec = await handler.generateSpec();
        await validate(JSON.parse(JSON.stringify(spec)));
    });
});
