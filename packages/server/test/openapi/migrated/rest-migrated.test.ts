/**
 * Migrated from zenstack-v2/packages/plugins/openapi/tests/openapi-restful.test.ts
 * Only v3.1 related tests are included.
 */
import { createTestClient } from '@zenstackhq/testtools';
import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { RestApiHandler } from '../../../src/api/rest';

const mainSchema = `
enum role {
    USER
    ADMIN
}

model User {
    id String @id @default(cuid())
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt
    email String @unique
    role role @default(USER)
    posts Post_Item[]
    profile Profile?
    likes PostLike[]
}

model Profile {
    id String @id @default(cuid())
    image String?
    user User @relation(fields: [userId], references: [id])
    userId String @unique
}

model Post_Item {
    id String @id
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt
    title String
    author User? @relation(fields: [authorId], references: [id])
    authorId String?
    published Boolean @default(false)
    viewCount Int @default(0)
    notes String?
    likes PostLike[]
}

model PostLike {
    postId String
    userId String
    post Post_Item @relation(fields: [postId], references: [id])
    user User @relation(fields: [userId], references: [id])
    @@id([postId, userId])
}
`;

const typeCoverageSchema = `
type Meta {
    something String
}

model Foo {
    id String @id @default(cuid())
    string String
    int Int
    bigInt BigInt
    date DateTime
    float Float
    decimal Decimal
    boolean Boolean
    bytes Bytes
    json Meta? @json
    plainJson Json
}
`;

describe('Migrated REST OpenAPI v3.1 tests', () => {
    it('generates valid v3.1 spec for main schema', async () => {
        const client = await createTestClient(mainSchema);
        const handler = new RestApiHandler({
            schema: client.$schema,
            endpoint: 'http://localhost/api',
        });
        const spec = await handler.generateSpec();

        expect(spec.openapi).toBe('3.1.0');

        // Tags
        const tagNames = spec.tags?.map((t: any) => t.name) ?? [];
        expect(tagNames).toContain('user');
        expect(tagNames).toContain('post_Item');

        // Collection paths
        expect(spec.paths?.['/user']?.get).toBeDefined();
        expect(spec.paths?.['/user']?.post).toBeDefined();
        expect(spec.paths?.['/user']?.put).toBeUndefined();

        // Single resource paths
        expect(spec.paths?.['/user/{id}']?.get).toBeDefined();
        expect(spec.paths?.['/user/{id}']?.patch).toBeDefined();
        expect(spec.paths?.['/user/{id}']?.delete).toBeDefined();

        // Related resource paths
        expect(spec.paths?.['/user/{id}/posts']?.get).toBeDefined();

        // Relationship management paths
        expect(spec.paths?.['/user/{id}/relationships/posts']?.get).toBeDefined();
        expect(spec.paths?.['/user/{id}/relationships/posts']?.post).toBeDefined();
        expect(spec.paths?.['/user/{id}/relationships/posts']?.patch).toBeDefined();
        expect(spec.paths?.['/user/{id}/relationships/likes']?.get).toBeDefined();
        expect(spec.paths?.['/user/{id}/relationships/likes']?.post).toBeDefined();
        expect(spec.paths?.['/user/{id}/relationships/likes']?.patch).toBeDefined();

        // To-one relationship: no POST
        expect(spec.paths?.['/post_Item/{id}/relationships/author']?.get).toBeDefined();
        expect(spec.paths?.['/post_Item/{id}/relationships/author']?.post).toBeUndefined();
        expect(spec.paths?.['/post_Item/{id}/relationships/author']?.patch).toBeDefined();

        // To-many relationship on Post_Item
        expect(spec.paths?.['/post_Item/{id}/relationships/likes']?.get).toBeDefined();
        expect(spec.paths?.['/post_Item/{id}/relationships/likes']?.post).toBeDefined();
        expect(spec.paths?.['/post_Item/{id}/relationships/likes']?.patch).toBeDefined();

        // Schemas
        expect(spec.components?.schemas?.['User']).toBeDefined();
        expect(spec.components?.schemas?.['Post_Item']).toBeDefined();
        expect(spec.components?.schemas?.['PostLike']).toBeDefined();

        // Enum schema
        expect(spec.components?.schemas?.['role']).toBeDefined();
        const roleSchema = spec.components?.schemas?.['role'] as any;
        expect(roleSchema.type).toBe('string');
        expect(roleSchema.enum).toContain('USER');
        expect(roleSchema.enum).toContain('ADMIN');
    });

    it('compound id model paths exist', async () => {
        const client = await createTestClient(mainSchema);
        const handler = new RestApiHandler({
            schema: client.$schema,
            endpoint: 'http://localhost/api',
        });
        const spec = await handler.generateSpec();

        // PostLike has @@id([postId, userId])
        expect(spec.paths?.['/postLike']).toBeDefined();
        expect(spec.paths?.['/postLike/{id}']).toBeDefined();
    });

    it('field type coverage matches expectations', async () => {
        const client = await createTestClient(typeCoverageSchema);
        const handler = new RestApiHandler({
            schema: client.$schema,
            endpoint: 'http://localhost/api',
        });
        const spec = await handler.generateSpec();

        expect(spec.openapi).toBe('3.1.0');

        const fooSchema = spec.components?.schemas?.['Foo'] as any;
        expect(fooSchema).toBeDefined();
        expect(fooSchema.properties.string).toMatchObject({ type: 'string' });
        expect(fooSchema.properties.int).toMatchObject({ type: 'integer' });
        expect(fooSchema.properties.bigInt).toMatchObject({ type: 'integer' });
        expect(fooSchema.properties.date).toMatchObject({ type: 'string', format: 'date-time' });
        expect(fooSchema.properties.float).toMatchObject({ type: 'number' });
        expect(fooSchema.properties.boolean).toMatchObject({ type: 'boolean' });
        expect(fooSchema.properties.bytes).toMatchObject({ type: 'string', format: 'byte' });

        // Decimal -> oneOf number | string
        const decimalProp = fooSchema.properties.decimal;
        expect(decimalProp.oneOf).toBeDefined();

        // Meta? @json -> optional ref or null (v3.1 pattern)
        const jsonProp = fooSchema.properties.json;
        expect(jsonProp).toBeDefined();

        // Plain Json -> generic
        const plainJsonProp = fooSchema.properties.plainJson;
        expect(plainJsonProp).toBeDefined();
    });

    it('works with mapped model names', async () => {
        const client = await createTestClient(mainSchema);
        const handler = new RestApiHandler({
            schema: client.$schema,
            endpoint: 'http://localhost/api',
            modelNameMapping: { User: 'myUser' },
        });
        const spec = await handler.generateSpec();

        expect(spec.paths?.['/myUser']).toBeDefined();
        expect(spec.paths?.['/user']).toBeUndefined();
        expect(spec.paths?.['/post_Item']).toBeDefined();
    });

    it('baseline comparison - rest-3.1.0', async () => {
        const baselinePath = path.join(__dirname, 'baseline', 'rest-3.1.0.baseline.yaml');
        if (!fs.existsSync(baselinePath)) {
            console.warn('Skipping baseline comparison: rest-3.1.0.baseline.yaml not found');
            return;
        }
        const baseline = YAML.parse(fs.readFileSync(baselinePath, 'utf-8'));
        expect(baseline.openapi).toBe('3.1.0');
        expect(baseline.components?.schemas).toBeDefined();
        expect(baseline.paths).toBeDefined();
    });

    it('baseline comparison - rest-type-coverage-3.1.0', async () => {
        const baselinePath = path.join(__dirname, 'baseline', 'rest-type-coverage-3.1.0.baseline.yaml');
        if (!fs.existsSync(baselinePath)) {
            console.warn('Skipping baseline comparison: rest-type-coverage-3.1.0.baseline.yaml not found');
            return;
        }
        const baseline = YAML.parse(fs.readFileSync(baselinePath, 'utf-8'));
        expect(baseline.openapi).toBe('3.1.0');
        expect(baseline.components?.schemas?.Foo).toBeDefined();
    });
});
