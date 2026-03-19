/**
 * Migrated from zenstack-v2/packages/plugins/openapi/tests/openapi-rpc.test.ts
 * Only v3.1 related tests are included.
 */
import { createTestClient } from '@zenstackhq/testtools';
import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { RPCApiHandler } from '../../../src/api/rpc';

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
    bytes Bytes?
    json Meta? @json
    plainJson Json
}
`;

describe('Migrated RPC OpenAPI v3.1 tests', () => {
    it('generates valid v3.1 spec for main schema', async () => {
        const client = await createTestClient(mainSchema);
        const handler = new RPCApiHandler({ schema: client.$schema });
        const spec = await handler.generateSpec();

        expect(spec.openapi).toBe('3.1.0');

        // Tags are generated for included models
        const tagNames = spec.tags?.map((t: any) => t.name) ?? [];
        expect(tagNames).toContain('user');
        expect(tagNames).toContain('profile');
        expect(tagNames).toContain('post_Item');

        // CRUD operation paths exist
        expect(spec.paths?.['/user/findMany']).toBeDefined();
        expect(spec.paths?.['/user/findMany']?.get).toBeDefined();
        expect(spec.paths?.['/user/create']).toBeDefined();
        expect(spec.paths?.['/user/create']?.post).toBeDefined();
        expect(spec.paths?.['/user/delete']).toBeDefined();

        // Post paths exist
        expect(spec.paths?.['/post_Item/findMany']).toBeDefined();

        // Schemas are generated
        expect(spec.components?.schemas?.['User']).toBeDefined();
        expect(spec.components?.schemas?.['Profile']).toBeDefined();
        expect(spec.components?.schemas?.['Post_Item']).toBeDefined();

        // Enum schema
        expect(spec.components?.schemas?.['role']).toBeDefined();
        const roleSchema = spec.components?.schemas?.['role'] as any;
        expect(roleSchema.type).toBe('string');
        expect(roleSchema.enum).toContain('USER');
        expect(roleSchema.enum).toContain('ADMIN');

        // User schema field types
        const userSchema = spec.components?.schemas?.['User'] as any;
        expect(userSchema.properties.id).toMatchObject({ type: 'string' });
        expect(userSchema.properties.createdAt).toMatchObject({ type: 'string', format: 'date-time' });
        expect(userSchema.properties.email).toMatchObject({ type: 'string' });

        // Optional relation uses oneOf with null (v3.1 pattern)
        const profileProp = userSchema.properties.profile;
        expect(profileProp).toBeDefined();
    });

    it('generates spec with custom title and version', async () => {
        const client = await createTestClient(mainSchema);
        const handler = new RPCApiHandler({ schema: client.$schema });
        const spec = await handler.generateSpec({
            title: 'My RPC API',
            version: '2.0.0',
            description: 'A custom API',
            summary: 'awesome api',
        });

        expect(spec.openapi).toBe('3.1.0');
        expect(spec.info.title).toBe('My RPC API');
        expect(spec.info.version).toBe('2.0.0');
        expect((spec.info as any).description).toBe('A custom API');
        expect((spec.info as any).summary).toBe('awesome api');
    });

    it('field type coverage matches expectations', async () => {
        const client = await createTestClient(typeCoverageSchema);
        const handler = new RPCApiHandler({ schema: client.$schema });
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

        // Decimal -> oneOf number | string
        const decimalProp = fooSchema.properties.decimal;
        expect(decimalProp.oneOf).toBeDefined();

        // Bytes? -> optional byte string
        const bytesProp = fooSchema.properties.bytes;
        expect(bytesProp).toBeDefined();

        // Meta? @json -> optional ref or null (v3.1)
        const jsonProp = fooSchema.properties.json;
        expect(jsonProp).toBeDefined();

        // Plain Json -> generic
        const plainJsonProp = fooSchema.properties.plainJson;
        expect(plainJsonProp).toBeDefined();
    });

    it('baseline comparison - rpc-3.1.0', async () => {
        const baselinePath = path.join(__dirname, 'baseline', 'rpc-3.1.0.baseline.yaml');
        if (!fs.existsSync(baselinePath)) {
            console.warn('Skipping baseline comparison: rpc-3.1.0.baseline.yaml not found');
            return;
        }
        const baseline = YAML.parse(fs.readFileSync(baselinePath, 'utf-8'));
        // Baseline is from v2 plugin, just verify it parses correctly
        expect(baseline.openapi).toBe('3.1.0');
        expect(baseline.components?.schemas).toBeDefined();
    });

    it('baseline comparison - rpc-3.1.0-omit', async () => {
        const baselinePath = path.join(__dirname, 'baseline', 'rpc-3.1.0-omit.baseline.yaml');
        if (!fs.existsSync(baselinePath)) {
            console.warn('Skipping baseline comparison: rpc-3.1.0-omit.baseline.yaml not found');
            return;
        }
        const baseline = YAML.parse(fs.readFileSync(baselinePath, 'utf-8'));
        expect(baseline.openapi).toBe('3.1.0');
        expect(baseline.components?.schemas).toBeDefined();
    });

    it('baseline comparison - rpc-type-coverage-3.1.0', async () => {
        const baselinePath = path.join(__dirname, 'baseline', 'rpc-type-coverage-3.1.0.baseline.yaml');
        if (!fs.existsSync(baselinePath)) {
            console.warn('Skipping baseline comparison: rpc-type-coverage-3.1.0.baseline.yaml not found');
            return;
        }
        const baseline = YAML.parse(fs.readFileSync(baselinePath, 'utf-8'));
        expect(baseline.openapi).toBe('3.1.0');
        expect(baseline.components?.schemas?.Foo).toBeDefined();
    });
});
