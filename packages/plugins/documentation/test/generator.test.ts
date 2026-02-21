import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadSchema } from './utils';
import plugin from '../src/index';

describe('documentation plugin', () => {
    it('all pages include auto-generated header with do-not-edit warning', async () => {
        const model = await loadSchema(`
            enum Role { ADMIN MEMBER }
            type Timestamps {
                createdAt DateTime @default(now())
            }
            model User {
                id   String @id @default(cuid())
                role Role
                posts Post[]
            }
            model Post {
                id       String @id @default(cuid())
                author   User   @relation(fields: [authorId], references: [id])
                authorId String
            }
            procedure getUser(id: String): User
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        const headerPattern = /auto-generated.*do not edit/i;

        const indexContent = fs.readFileSync(path.join(tmpDir, 'index.md'), 'utf-8');
        expect(indexContent).toMatch(headerPattern);

        const userDoc = fs.readFileSync(path.join(tmpDir, 'models', 'User.md'), 'utf-8');
        expect(userDoc).toMatch(headerPattern);

        const roleDoc = fs.readFileSync(path.join(tmpDir, 'enums', 'Role.md'), 'utf-8');
        expect(roleDoc).toMatch(headerPattern);

        const tsDoc = fs.readFileSync(path.join(tmpDir, 'types', 'Timestamps.md'), 'utf-8');
        expect(tsDoc).toMatch(headerPattern);

        const procDoc = fs.readFileSync(path.join(tmpDir, 'procedures', 'getUser.md'), 'utf-8');
        expect(procDoc).toMatch(headerPattern);

        const relDoc = fs.readFileSync(path.join(tmpDir, 'relationships.md'), 'utf-8');
        expect(relDoc).toMatch(headerPattern);
    });

    it('entity pages show breadcrumb navigation', async () => {
        const model = await loadSchema(`
            enum Role { ADMIN MEMBER }
            type Timestamps {
                createdAt DateTime @default(now())
            }
            model User {
                id   String @id @default(cuid())
                role Role
            }
            procedure getUser(id: String): User
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        const userDoc = fs.readFileSync(path.join(tmpDir, 'models', 'User.md'), 'utf-8');
        expect(userDoc).toContain('[Index](../index.md)');
        expect(userDoc).toContain('[Models](../index.md#models)');

        const roleDoc = fs.readFileSync(path.join(tmpDir, 'enums', 'Role.md'), 'utf-8');
        expect(roleDoc).toContain('[Index](../index.md)');
        expect(roleDoc).toContain('[Enums](../index.md#enums)');

        const tsDoc = fs.readFileSync(path.join(tmpDir, 'types', 'Timestamps.md'), 'utf-8');
        expect(tsDoc).toContain('[Index](../index.md)');
        expect(tsDoc).toContain('[Types](../index.md#types)');

        const procDoc = fs.readFileSync(path.join(tmpDir, 'procedures', 'getUser.md'), 'utf-8');
        expect(procDoc).toContain('[Index](../index.md)');
        expect(procDoc).toContain('[Procedures](../index.md#procedures)');
    });

    it('entity pages show type badge via kbd tag', async () => {
        const model = await loadSchema(`
            enum Role { ADMIN MEMBER }
            type Timestamps {
                createdAt DateTime @default(now())
            }
            model User {
                id   String @id @default(cuid())
                role Role
            }
            procedure getUser(id: String): User
            mutation procedure signUp(name: String): User
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        const userDoc = fs.readFileSync(path.join(tmpDir, 'models', 'User.md'), 'utf-8');
        expect(userDoc).toContain('<kbd>Model</kbd>');

        const roleDoc = fs.readFileSync(path.join(tmpDir, 'enums', 'Role.md'), 'utf-8');
        expect(roleDoc).toContain('<kbd>Enum</kbd>');

        const tsDoc = fs.readFileSync(path.join(tmpDir, 'types', 'Timestamps.md'), 'utf-8');
        expect(tsDoc).toContain('<kbd>Type</kbd>');

        const queryDoc = fs.readFileSync(path.join(tmpDir, 'procedures', 'getUser.md'), 'utf-8');
        expect(queryDoc).toContain('<kbd>Query</kbd>');

        const mutDoc = fs.readFileSync(path.join(tmpDir, 'procedures', 'signUp.md'), 'utf-8');
        expect(mutDoc).toContain('<kbd>Mutation</kbd>');
    });

    it('produces an index.md file', async () => {
        const model = await loadSchema(`
            model User {
                id String @id @default(cuid())
            }
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        expect(fs.existsSync(path.join(tmpDir, 'index.md'))).toBe(true);
    });

    it('index page shows summary line with artifact counts', async () => {
        const model = await loadSchema(`
            enum Role { ADMIN MEMBER }
            type Timestamps {
                createdAt DateTime @default(now())
            }
            model User {
                id String @id @default(cuid())
            }
            model Post {
                id String @id @default(cuid())
            }
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        const indexContent = fs.readFileSync(path.join(tmpDir, 'index.md'), 'utf-8');
        expect(indexContent).toContain('2 models');
        expect(indexContent).toContain('1 enum');
        expect(indexContent).toContain('1 type');
    });

    it('index page lists views in a separate section from models', async () => {
        const model = await loadSchema(`
            model User {
                id String @id @default(cuid())
            }
            view UserInfo {
                id    Int
                email String
                name  String
            }
            view ActiveUsers {
                id    Int
                count Int
            }
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        const indexContent = fs.readFileSync(path.join(tmpDir, 'index.md'), 'utf-8');

        // Views should appear under their own section
        expect(indexContent).toContain('## Views');
        expect(indexContent).toContain('[ActiveUsers](./views/ActiveUsers.md)');
        expect(indexContent).toContain('[UserInfo](./views/UserInfo.md)');

        // Views should NOT appear in the models section
        const modelsSection = indexContent.split('## Views')[0];
        expect(modelsSection).not.toContain('UserInfo');
        expect(modelsSection).not.toContain('ActiveUsers');

        // Summary should count views
        expect(indexContent).toContain('2 views');

        // View files should exist in views/ directory
        expect(fs.existsSync(path.join(tmpDir, 'views', 'UserInfo.md'))).toBe(true);
        expect(fs.existsSync(path.join(tmpDir, 'views', 'ActiveUsers.md'))).toBe(true);
    });

    it('view page renders with View badge, breadcrumb, and fields', async () => {
        const model = await loadSchema(`
            /// Flattened user info for reporting.
            view UserInfo {
                id    Int
                email String
                name  String
            }
            model User {
                id String @id @default(cuid())
            }
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        const viewDoc = fs.readFileSync(path.join(tmpDir, 'views', 'UserInfo.md'), 'utf-8');

        // View badge, not Model
        expect(viewDoc).toContain('<kbd>View</kbd>');
        expect(viewDoc).not.toContain('<kbd>Model</kbd>');

        // Proper breadcrumb with Views category
        expect(viewDoc).toContain('[Views](../index.md#views)');
        expect(viewDoc).not.toContain('[Models]');

        // Description
        expect(viewDoc).toContain('Flattened user info for reporting');

        // Fields table
        expect(viewDoc).toContain('## Fields');
        expect(viewDoc).toContain('| id');
        expect(viewDoc).toContain('| email');
        expect(viewDoc).toContain('| name');
        expect(viewDoc).toContain('`Int`');
        expect(viewDoc).toContain('`String`');
    });

    it('view page includes declaration block', async () => {
        const model = await loadSchema(`
            view ActiveUsers {
                id    Int
                count Int
            }
            model User {
                id String @id @default(cuid())
            }
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        const viewDoc = fs.readFileSync(path.join(tmpDir, 'views', 'ActiveUsers.md'), 'utf-8');
        expect(viewDoc).toContain('<summary>Declaration</summary>');
        expect(viewDoc).toContain('view ActiveUsers');
    });

    it('index page lists models alpha-sorted with links', async () => {
        const model = await loadSchema(`
            model User {
                id String @id @default(cuid())
            }
            model Post {
                id String @id @default(cuid())
            }
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        const indexContent = fs.readFileSync(path.join(tmpDir, 'index.md'), 'utf-8');
        expect(indexContent).toContain('# Schema Documentation');
        expect(indexContent).toContain('[Post](./models/Post.md)');
        expect(indexContent).toContain('[User](./models/User.md)');
        const postIdx = indexContent.indexOf('[Post]');
        const userIdx = indexContent.indexOf('[User]');
        expect(postIdx).toBeLessThan(userIdx);
    });

    it('index page lists enums alpha-sorted with links', async () => {
        const model = await loadSchema(`
            enum Role {
                ADMIN
                USER
            }
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        const indexContent = fs.readFileSync(path.join(tmpDir, 'index.md'), 'utf-8');
        expect(indexContent).toContain('## Enums');
        expect(indexContent).toContain('[Role](./enums/Role.md)');
    });

    it('index page lists types alpha-sorted with links', async () => {
        const model = await loadSchema(`
            type Timestamps {
                createdAt DateTime @default(now())
                updatedAt DateTime @updatedAt
            }
            type Metadata {
                version Int @default(1)
            }
            model User {
                id String @id @default(cuid())
            }
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        const indexContent = fs.readFileSync(path.join(tmpDir, 'index.md'), 'utf-8');
        expect(indexContent).toContain('## Types');
        expect(indexContent).toContain('[Metadata](./types/Metadata.md)');
        expect(indexContent).toContain('[Timestamps](./types/Timestamps.md)');
        const metaIdx = indexContent.indexOf('[Metadata]');
        const tsIdx = indexContent.indexOf('[Timestamps]');
        expect(metaIdx).toBeLessThan(tsIdx);
    });

    it('generates type page with heading, description, and fields table', async () => {
        const model = await loadSchema(`
            /// Common timestamp fields for all models.
            type Timestamps {
                createdAt DateTime @default(now())
                updatedAt DateTime @updatedAt
            }
            model User {
                id String @id @default(cuid())
            }
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        expect(fs.existsSync(path.join(tmpDir, 'types', 'Timestamps.md'))).toBe(true);
        const typeDoc = fs.readFileSync(path.join(tmpDir, 'types', 'Timestamps.md'), 'utf-8');
        expect(typeDoc).toContain('# Timestamps');
        expect(typeDoc).toContain('Common timestamp fields');
        expect(typeDoc).toContain('[Index](../index.md)');
        expect(typeDoc).toContain('## Fields');
        expect(typeDoc).toContain('| createdAt');
        expect(typeDoc).toContain('| updatedAt');
    });

    it('type page shows Used By section linking to models that use it', async () => {
        const model = await loadSchema(`
            type Timestamps {
                createdAt DateTime @default(now())
                updatedAt DateTime @updatedAt
            }
            model User with Timestamps {
                id String @id @default(cuid())
            }
            model Post with Timestamps {
                id String @id @default(cuid())
            }
            model Tag {
                id String @id @default(cuid())
            }
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        const typeDoc = fs.readFileSync(path.join(tmpDir, 'types', 'Timestamps.md'), 'utf-8');
        expect(typeDoc).toContain('## Used By');
        expect(typeDoc).toContain('[Post](../models/Post.md)');
        expect(typeDoc).toContain('[User](../models/User.md)');
        expect(typeDoc).not.toContain('[Tag]');
    });

    it('type page includes class diagram showing mixin usage', async () => {
        const model = await loadSchema(`
            type Timestamps {
                createdAt DateTime @default(now())
                updatedAt DateTime @updatedAt
            }
            model User with Timestamps {
                id String @id @default(cuid())
            }
            model Post with Timestamps {
                id String @id @default(cuid())
            }
            model Tag {
                id String @id @default(cuid())
            }
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        const typeDoc = fs.readFileSync(path.join(tmpDir, 'types', 'Timestamps.md'), 'utf-8');
        expect(typeDoc).toContain('```mermaid');
        expect(typeDoc).toContain('classDiagram');
        expect(typeDoc).toContain('Timestamps');
        expect(typeDoc).toContain('mixin');
        expect(typeDoc).toContain('Post');
        expect(typeDoc).toContain('User');
        expect(typeDoc).not.toMatch(/Tag/);
    });

    it('type page omits class diagram when no models use it', async () => {
        const model = await loadSchema(`
            type Metadata {
                version Int @default(1)
            }
            model User {
                id String @id @default(cuid())
            }
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        const typeDoc = fs.readFileSync(path.join(tmpDir, 'types', 'Metadata.md'), 'utf-8');
        expect(typeDoc).not.toContain('```mermaid');
        expect(typeDoc).not.toContain('classDiagram');
    });

    it('scalar types in fields table are backtick-wrapped', async () => {
        const model = await loadSchema(`
            model User {
                id    String   @id @default(cuid())
                name  String
                age   Int?
                score Float
                active Boolean @default(true)
                joined DateTime @default(now())
            }
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        const doc = fs.readFileSync(path.join(tmpDir, 'models', 'User.md'), 'utf-8');
        expect(doc).toContain('| `String` |');
        expect(doc).toContain('| `Int?` |');
        expect(doc).toContain('| `Float` |');
        expect(doc).toContain('| `Boolean` |');
        expect(doc).toContain('| `DateTime` |');
    });

    it('type page fields default to declaration order', async () => {
        const model = await loadSchema(`
            type Metadata {
                version Int @default(1)
                createdBy String
                active Boolean
            }
            model User {
                id String @id @default(cuid())
            }
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        const typeDoc = fs.readFileSync(path.join(tmpDir, 'types', 'Metadata.md'), 'utf-8');

        // declaration order: version, createdBy, active
        const versionIdx = typeDoc.indexOf('| version');
        const createdByIdx = typeDoc.indexOf('| createdBy');
        const activeIdx = typeDoc.indexOf('| active');
        expect(versionIdx).toBeLessThan(createdByIdx);
        expect(createdByIdx).toBeLessThan(activeIdx);
    });

    it('model page shows source file path', async () => {
        const model = await loadSchema(`
            model User {
                id String @id @default(cuid())
            }
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        const userDoc = fs.readFileSync(path.join(tmpDir, 'models', 'User.md'), 'utf-8');
        expect(userDoc).toContain('**Defined in:**');
        expect(userDoc).toContain('.zmodel');
    });

    it('enum page shows source file path', async () => {
        const model = await loadSchema(`
            enum Role {
                ADMIN
                MEMBER
            }
            model User {
                id   String @id @default(cuid())
                role Role
            }
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        const enumDoc = fs.readFileSync(path.join(tmpDir, 'enums', 'Role.md'), 'utf-8');
        expect(enumDoc).toContain('**Defined in:**');
        expect(enumDoc).toContain('.zmodel');
    });

    it('type page shows source file path', async () => {
        const model = await loadSchema(`
            type Timestamps {
                createdAt DateTime @default(now())
            }
            model User {
                id String @id @default(cuid())
            }
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        const typeDoc = fs.readFileSync(path.join(tmpDir, 'types', 'Timestamps.md'), 'utf-8');
        expect(typeDoc).toContain('**Defined in:**');
        expect(typeDoc).toContain('.zmodel');
    });

    it('enum page includes declaration code block', async () => {
        const model = await loadSchema(`
            /// User roles in the system.
            enum Role {
                ADMIN
                MEMBER
            }
            model User {
                id   String @id @default(cuid())
                role Role
            }
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        const enumDoc = fs.readFileSync(path.join(tmpDir, 'enums', 'Role.md'), 'utf-8');
        expect(enumDoc).toContain('<summary>Declaration</summary>');
        expect(enumDoc).toContain('```prisma');
        expect(enumDoc).toContain('enum Role {');
        expect(enumDoc).toContain('ADMIN');
    });

    it('type page includes declaration code block', async () => {
        const model = await loadSchema(`
            /// Shared timestamp fields.
            type Timestamps {
                createdAt DateTime @default(now())
                updatedAt DateTime @updatedAt
            }
            model User {
                id String @id @default(cuid())
            }
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        const typeDoc = fs.readFileSync(path.join(tmpDir, 'types', 'Timestamps.md'), 'utf-8');
        expect(typeDoc).toContain('<summary>Declaration</summary>');
        expect(typeDoc).toContain('```prisma');
        expect(typeDoc).toContain('type Timestamps {');
        expect(typeDoc).toContain('createdAt DateTime');
    });

    it('model page shows Mixins section linking to type pages', async () => {
        const model = await loadSchema(`
            type Timestamps {
                createdAt DateTime @default(now())
                updatedAt DateTime @updatedAt
            }
            type Metadata {
                version Int @default(1)
            }
            model User with Timestamps, Metadata {
                id String @id @default(cuid())
            }
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        const userDoc = fs.readFileSync(path.join(tmpDir, 'models', 'User.md'), 'utf-8');
        expect(userDoc).toContain('## Mixins');
        expect(userDoc).toContain('[Timestamps](../types/Timestamps.md)');
        expect(userDoc).toContain('[Metadata](../types/Metadata.md)');
    });

    it('fields table has Source column linking mixin fields to type page', async () => {
        const model = await loadSchema(`
            type Timestamps {
                /// Record creation time.
                createdAt DateTime @default(now())
                updatedAt DateTime @updatedAt
            }
            model User with Timestamps {
                id    String @id @default(cuid())
                /// User email address.
                email String
            }
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        const userDoc = fs.readFileSync(path.join(tmpDir, 'models', 'User.md'), 'utf-8');
        expect(userDoc).toContain('| Source |');

        const createdAtLine = userDoc.split('\n').find((l) => l.includes('| createdAt'));
        expect(createdAtLine).toBeDefined();
        expect(createdAtLine).toContain('[Timestamps](../types/Timestamps.md)');
        expect(createdAtLine).toContain('Record creation time.');

        const emailLine = userDoc.split('\n').find((l) => l.includes('| email'));
        expect(emailLine).toBeDefined();
        expect(emailLine).toContain('User email address.');
        expect(emailLine).not.toContain('[Timestamps]');
    });

    it('generates model page with heading and description', async () => {
        const model = await loadSchema(`
            /// Represents a registered user.
            /// Has many posts.
            model User {
                id String @id @default(cuid())
            }
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        const userDoc = fs.readFileSync(path.join(tmpDir, 'models', 'User.md'), 'utf-8');
        expect(userDoc).toContain('# User');
        expect(userDoc).toContain('Represents a registered user.');
        expect(userDoc).toContain('Has many posts.');
    });

    it('model page includes horizontal table of contents with anchor links', async () => {
        const model = await loadSchema(`
            enum Role { ADMIN MEMBER }
            model User {
                id    String @id @default(cuid())
                email String @unique @email
                role  Role
                posts Post[]
                @@allow('read', true)
                @@index([email])
            }
            model Post {
                id       String @id @default(cuid())
                author   User   @relation(fields: [authorId], references: [id])
                authorId String
            }
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        const userDoc = fs.readFileSync(path.join(tmpDir, 'models', 'User.md'), 'utf-8');
        expect(userDoc).toContain('[Fields](#fields)');
        expect(userDoc).toContain('[Relationships](#relationships)');
        expect(userDoc).toContain('[Access Policies](#access-policies)');
        expect(userDoc).toContain('[Indexes](#indexes)');
        expect(userDoc).toContain('[Validation Rules](#validation-rules)');

        // TOC should be on a single line separated by middle dots
        const tocLine = userDoc.split('\n').find((l: string) => l.includes('[Fields](#fields)') && l.includes(' · '));
        expect(tocLine).toBeDefined();

        // No bullet-list style TOC
        expect(userDoc).not.toContain('- [Fields](#fields)');

        // TOC should appear before the first ## heading
        const tocIdx = userDoc.indexOf('[Fields](#fields)');
        const fieldsIdx = userDoc.indexOf('## Fields');
        expect(tocIdx).toBeLessThan(fieldsIdx);
    });

    it('model page includes declaration code block', async () => {
        const model = await loadSchema(`
            /// A registered user.
            model User {
                id    String @id @default(cuid())
                email String
            }
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        const userDoc = fs.readFileSync(path.join(tmpDir, 'models', 'User.md'), 'utf-8');
        expect(userDoc).toContain('<details>');
        expect(userDoc).toContain('<summary>Declaration</summary>');
        expect(userDoc).toContain('```prisma');
        expect(userDoc).toContain('model User {');
        expect(userDoc).toContain('id    String @id @default(cuid())');
        expect(userDoc).toContain('</details>');
    });

    it('fields with no description show em-dash instead of blank', async () => {
        const model = await loadSchema(`
            model User {
                id    String @id @default(cuid())
                email String
            }
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        const userDoc = fs.readFileSync(path.join(tmpDir, 'models', 'User.md'), 'utf-8');
        const idLine = userDoc.split('\n').find((l) => l.includes('| id'));
        expect(idLine).toBeDefined();
        // Last column should be — not empty
        expect(idLine).toMatch(/\| — \|$/);
    });

    it('fields default to declaration order', async () => {
        const model = await loadSchema(`
            model User {
                id    String  @id @default(cuid())
                /// Display name shown in the UI.
                name  String
                email String?
            }
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        const userDoc = fs.readFileSync(path.join(tmpDir, 'models', 'User.md'), 'utf-8');
        expect(userDoc).toContain('## Fields');
        expect(userDoc).toContain('Display name shown in the UI.');
        expect(userDoc).toContain('`cuid()`');

        // declaration order: id, name, email
        const idIdx = userDoc.indexOf('| id');
        const nameIdx = userDoc.indexOf('| name');
        const emailIdx = userDoc.indexOf('| email');
        expect(idIdx).toBeLessThan(nameIdx);
        expect(nameIdx).toBeLessThan(emailIdx);

        // email is optional
        const emailLine = userDoc.split('\n').find((l) => l.includes('| email'));
        expect(emailLine).toContain('No');

        // id is required
        const idLine = userDoc.split('\n').find((l) => l.includes('| id'));
        expect(idLine).toContain('Yes');
    });

    it('fieldOrder=alphabetical sorts fields alphabetically', async () => {
        const model = await loadSchema(`
            model User {
                id    String  @id @default(cuid())
                name  String
                email String?
            }
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir, fieldOrder: 'alphabetical' },
        });

        const userDoc = fs.readFileSync(path.join(tmpDir, 'models', 'User.md'), 'utf-8');

        // alphabetical order: email < id < name
        const emailIdx = userDoc.indexOf('| email');
        const idIdx = userDoc.indexOf('| id');
        const nameIdx = userDoc.indexOf('| name');
        expect(emailIdx).toBeLessThan(idIdx);
        expect(idIdx).toBeLessThan(nameIdx);
    });

    it('generates model page with relationships section and mini ER diagram', async () => {
        const model = await loadSchema(`
            model User {
                id    String @id @default(cuid())
                posts Post[]
            }
            model Post {
                id       String @id @default(cuid())
                author   User   @relation(fields: [authorId], references: [id])
                authorId String
            }
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        const userDoc = fs.readFileSync(path.join(tmpDir, 'models', 'User.md'), 'utf-8');
        expect(userDoc).toContain('## Relationships');
        expect(userDoc).toContain('| posts');
        expect(userDoc).toContain('Post');
        expect(userDoc).toContain('One\u2192Many');

        // Mini ER diagram
        expect(userDoc).toContain('```mermaid');
        expect(userDoc).toContain('erDiagram');
        expect(userDoc).toContain('User');
        expect(userDoc).toContain('Post');

        const postDoc = fs.readFileSync(path.join(tmpDir, 'models', 'Post.md'), 'utf-8');
        expect(postDoc).toContain('## Relationships');
        expect(postDoc).toContain('| author');
        expect(postDoc).toContain('User');
        expect(postDoc).toContain('Many\u2192One');

        // Post also gets a diagram
        expect(postDoc).toContain('```mermaid');
        expect(postDoc).toContain('erDiagram');

        const authorLine = postDoc.split('\n').find((l) => l.includes('| author') && l.includes('@relation'));
        expect(authorLine).toBeDefined();
        expect(authorLine).toContain('fields: [authorId]');
        expect(authorLine).not.toContain('fields: fields:');
        expect(authorLine).toContain('references: [id]');
        expect(authorLine).not.toContain('references: references:');
    });

    it('generates enum page with heading, description, and values', async () => {
        const model = await loadSchema(`
            /// User roles in the system.
            enum Role {
                /// Full access
                ADMIN
                /// Standard access
                USER
                GUEST
            }
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        const enumDoc = fs.readFileSync(path.join(tmpDir, 'enums', 'Role.md'), 'utf-8');
        expect(enumDoc).toContain('# Role');
        expect(enumDoc).toContain('User roles in the system.');
        expect(enumDoc).toContain('## Values');
        expect(enumDoc).toContain('| ADMIN');
        expect(enumDoc).toContain('Full access');
        expect(enumDoc).toContain('| USER');
        expect(enumDoc).toContain('Standard access');
        expect(enumDoc).toContain('| GUEST');
    });

    it('uses custom title from plugin options', async () => {
        const model = await loadSchema(`
            model User {
                id String @id @default(cuid())
            }
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir, title: 'My API' },
        });

        const indexContent = fs.readFileSync(path.join(tmpDir, 'index.md'), 'utf-8');
        expect(indexContent).toContain('# My API');
        expect(indexContent).not.toContain('# Schema Documentation');
    });

    it('produces correct directory structure for models and enums', async () => {
        const model = await loadSchema(`
            model User {
                id   String @id @default(cuid())
                role Role
            }
            model Post {
                id String @id @default(cuid())
            }
            enum Role {
                ADMIN
                USER
            }
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        expect(fs.existsSync(path.join(tmpDir, 'index.md'))).toBe(true);
        expect(fs.existsSync(path.join(tmpDir, 'models', 'User.md'))).toBe(true);
        expect(fs.existsSync(path.join(tmpDir, 'models', 'Post.md'))).toBe(true);
        expect(fs.existsSync(path.join(tmpDir, 'enums', 'Role.md'))).toBe(true);
    });

    it('generates access policies section from @@allow and @@deny', async () => {
        const model = await loadSchema(`
            model User {
                id    String @id @default(cuid())
                email String

                @@allow('read', true)
                @@deny('delete', true)
            }
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        const userDoc = fs.readFileSync(path.join(tmpDir, 'models', 'User.md'), 'utf-8');
        expect(userDoc).toContain('## Access Policies');
        expect(userDoc).toContain('| read');
        expect(userDoc).toContain('Allow');
        expect(userDoc).toContain('| delete');
        expect(userDoc).toContain('Deny');
    });

    it('access policies section includes evaluation note', async () => {
        const model = await loadSchema(`
            model User {
                id   String @id @default(cuid())
                @@allow('read', true)
                @@deny('delete', true)
            }
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        const userDoc = fs.readFileSync(path.join(tmpDir, 'models', 'User.md'), 'utf-8');
        expect(userDoc).toContain('## Access Policies');
        expect(userDoc).toContain('denied by default');
        expect(userDoc).toContain('@@deny');
        expect(userDoc).toContain('@@allow');
    });

    it('generates validation rules section', async () => {
        const model = await loadSchema(`
            model User {
                id    String @id @default(cuid())
                email String @email
                name  String @length(1, 100)
            }
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        const userDoc = fs.readFileSync(path.join(tmpDir, 'models', 'User.md'), 'utf-8');
        expect(userDoc).toContain('## Validation Rules');
        expect(userDoc).toContain('| email');
        expect(userDoc).toContain('`@email`');
        expect(userDoc).toContain('| name');
        expect(userDoc).toContain('`@length`');
    });

    it('generates indexes section from @@index and @@unique', async () => {
        const model = await loadSchema(`
            model User {
                id    String @id @default(cuid())
                email String @unique
                name  String

                @@index([name])
                @@unique([email, name])
            }
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        const userDoc = fs.readFileSync(path.join(tmpDir, 'models', 'User.md'), 'utf-8');
        expect(userDoc).toContain('## Indexes');
        expect(userDoc).toContain('Index');
        expect(userDoc).toContain('Unique');
    });

    it('marks computed fields with kbd badge in Type column', async () => {
        const model = await loadSchema(`
            model User {
                id        String @id @default(cuid())
                firstName String
                lastName  String
                fullName  String @computed
            }
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        const userDoc = fs.readFileSync(path.join(tmpDir, 'models', 'User.md'), 'utf-8');
        const fullNameLine = userDoc.split('\n').find((l) => l.includes('| fullName'));
        expect(fullNameLine).toBeDefined();
        expect(fullNameLine).toContain('<kbd>computed</kbd>');
        expect(fullNameLine).toContain('`String`');
        // Should not show "**Computed**" in description column anymore
        expect(fullNameLine).not.toContain('**Computed**');
    });

    it('renders multiple computed field types with badge and description', async () => {
        const model = await loadSchema(`
            model Project {
                id             String  @id @default(cuid())
                name           String
                /// Total number of tasks in this project.
                taskCount      Int     @computed
                /// Percentage of tasks that are completed.
                completionRate Float   @computed
                /// Whether the project has any overdue tasks.
                isOverdue      Boolean @computed
                /// Full display label combining name and status.
                displayLabel   String  @computed
            }
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        const doc = fs.readFileSync(path.join(tmpDir, 'models', 'Project.md'), 'utf-8');
        const lines = doc.split('\n');

        const taskCountLine = lines.find((l) => l.includes('| taskCount'));
        expect(taskCountLine).toContain('`Int` <kbd>computed</kbd>');
        expect(taskCountLine).toContain('Total number of tasks');

        const completionLine = lines.find((l) => l.includes('| completionRate'));
        expect(completionLine).toContain('`Float` <kbd>computed</kbd>');
        expect(completionLine).toContain('Percentage of tasks');

        const overdueLine = lines.find((l) => l.includes('| isOverdue'));
        expect(overdueLine).toContain('`Boolean` <kbd>computed</kbd>');
        expect(overdueLine).toContain('overdue tasks');

        const displayLine = lines.find((l) => l.includes('| displayLabel'));
        expect(displayLine).toContain('`String` <kbd>computed</kbd>');
        expect(displayLine).toContain('Full display label');

        // Non-computed fields should NOT have the badge
        const nameLine = lines.find((l) => l.includes('| name'));
        expect(nameLine).not.toContain('<kbd>computed</kbd>');
    });

    it('annotates inherited fields with source model', async () => {
        const model = await loadSchema(`
            model BaseModel {
                id   String @id @default(cuid())
                type String
                @@delegate(type)
            }
            model User extends BaseModel {
                email String
            }
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        const userDoc = fs.readFileSync(path.join(tmpDir, 'models', 'User.md'), 'utf-8');
        expect(userDoc).toContain('| Source |');

        const idLine = userDoc.split('\n').find((l) => l.includes('| id'));
        expect(idLine).toBeDefined();
        expect(idLine).toContain('[BaseModel](./BaseModel.md)');

        const emailLine = userDoc.split('\n').find((l) => l.includes('| email'));
        expect(emailLine).toBeDefined();
        expect(emailLine).not.toContain('[BaseModel]');
    });

    it('renders metadata as inline key-value pairs without empty table headers', async () => {
        const model = await loadSchema(`
            model User {
                id String @id @default(cuid())

                @@meta('doc:category', 'Identity')
                @@meta('doc:since', '2.0')
                @@meta('doc:deprecated', 'Use Account instead')
            }
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        const userDoc = fs.readFileSync(path.join(tmpDir, 'models', 'User.md'), 'utf-8');
        expect(userDoc).toContain('**Category:** Identity');
        expect(userDoc).toContain('**Since:** 2.0');
        expect(userDoc).toContain('**Deprecated:** Use Account instead');
        expect(userDoc).toContain('**Defined in:**');
        expect(userDoc).not.toContain('| | |');
    });

    it('groups models by category when groupBy = category', async () => {
        const model = await loadSchema(`
            model User {
                id String @id @default(cuid())
                @@meta('doc:category', 'Identity')
            }
            model Post {
                id String @id @default(cuid())
                @@meta('doc:category', 'Content')
            }
            model Uncategorized {
                id String @id @default(cuid())
            }
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir, groupBy: 'category' },
        });

        expect(fs.existsSync(path.join(tmpDir, 'models', 'Identity', 'User.md'))).toBe(true);
        expect(fs.existsSync(path.join(tmpDir, 'models', 'Content', 'Post.md'))).toBe(true);
        expect(fs.existsSync(path.join(tmpDir, 'models', 'Uncategorized.md'))).toBe(true);
    });

    it('generates relationships.md with cross-reference table and Mermaid diagram', async () => {
        const model = await loadSchema(`
            model User {
                id    String @id @default(cuid())
                posts Post[]
            }
            model Post {
                id       String @id @default(cuid())
                author   User   @relation(fields: [authorId], references: [id])
                authorId String
                tags     Tag[]
            }
            model Tag {
                id    String @id @default(cuid())
                posts Post[]
            }
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        const relDoc = fs.readFileSync(path.join(tmpDir, 'relationships.md'), 'utf-8');
        expect(relDoc).toContain('# Relationships');
        expect(relDoc).toContain('erDiagram');
        expect(relDoc).toContain('User');
        expect(relDoc).toContain('Post');
        expect(relDoc).toContain('Tag');
    });

    it('omits sections when include* flags are false', async () => {
        const model = await loadSchema(`
            model User {
                id    String @id @default(cuid())
                email String @email
                posts Post[]

                @@allow('read', true)
                @@index([email])
            }
            model Post {
                id       String @id @default(cuid())
                author   User   @relation(fields: [authorId], references: [id])
                authorId String
            }
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: {
                output: tmpDir,
                includeRelationships: false,
                includePolicies: false,
                includeValidation: false,
                includeIndexes: false,
            },
        });

        const userDoc = fs.readFileSync(path.join(tmpDir, 'models', 'User.md'), 'utf-8');
        expect(userDoc).not.toContain('## Relationships');
        expect(userDoc).not.toContain('## Access Policies');
        expect(userDoc).not.toContain('## Validation Rules');
        expect(userDoc).not.toContain('## Indexes');

        expect(fs.existsSync(path.join(tmpDir, 'relationships.md'))).toBe(false);
    });

    it('links field types to model and enum pages', async () => {
        const model = await loadSchema(`
            model User {
                id    String @id @default(cuid())
                role  Role
                posts Post[]
            }
            model Post {
                id       String @id @default(cuid())
                author   User   @relation(fields: [authorId], references: [id])
                authorId String
            }
            enum Role {
                ADMIN
                USER
            }
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        const userDoc = fs.readFileSync(path.join(tmpDir, 'models', 'User.md'), 'utf-8');
        const roleLine = userDoc.split('\n').find((l) => l.includes('| role'));
        expect(roleLine).toContain('[Role](../enums/Role.md)');

        const postsLine = userDoc.split('\n').find((l) => l.includes('| posts'));
        expect(postsLine).toContain('[Post](./Post.md)');

        const postDoc = fs.readFileSync(path.join(tmpDir, 'models', 'Post.md'), 'utf-8');
        const authorLine = postDoc.split('\n').find((l) => l.includes('| author'));
        expect(authorLine).toContain('[User](./User.md)');

        const idLine = userDoc.split('\n').find((l) => l.includes('| id'));
        expect(idLine).not.toContain('[String]');
    });

    it('model pages link back to index', async () => {
        const model = await loadSchema(`
            model User {
                id String @id @default(cuid())
            }
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        const userDoc = fs.readFileSync(path.join(tmpDir, 'models', 'User.md'), 'utf-8');
        expect(userDoc).toContain('[Index](../index.md)');
    });

    it('enum pages link back to index and show used-by models', async () => {
        const model = await loadSchema(`
            model User {
                id   String @id @default(cuid())
                role Role
            }
            model Post {
                id     String @id @default(cuid())
                status Role
            }
            enum Role {
                ADMIN
                USER
            }
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        const roleDoc = fs.readFileSync(path.join(tmpDir, 'enums', 'Role.md'), 'utf-8');
        expect(roleDoc).toContain('[Index](../index.md)');
        expect(roleDoc).toContain('## Used By');
        expect(roleDoc).toContain('[Post](../models/Post.md)');
        expect(roleDoc).toContain('[User](../models/User.md)');
    });

    it('enum page includes class diagram showing usage by models', async () => {
        const model = await loadSchema(`
            model User {
                id   String @id @default(cuid())
                role Role
            }
            model Post {
                id     String @id @default(cuid())
                status Role
            }
            enum Role {
                ADMIN
                USER
            }
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        const roleDoc = fs.readFileSync(path.join(tmpDir, 'enums', 'Role.md'), 'utf-8');
        expect(roleDoc).toContain('```mermaid');
        expect(roleDoc).toContain('classDiagram');
        expect(roleDoc).toContain('enumeration');
        expect(roleDoc).toContain('ADMIN');
        expect(roleDoc).toContain('USER');
        expect(roleDoc).toContain('Post');
        expect(roleDoc).toContain('User');
        expect(roleDoc).toContain('role');
        expect(roleDoc).toContain('status');
    });

    it('enum page omits class diagram when no models use it', async () => {
        const model = await loadSchema(`
            enum Status { ACTIVE INACTIVE }
            model User {
                id String @id @default(cuid())
            }
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        const statusDoc = fs.readFileSync(path.join(tmpDir, 'enums', 'Status.md'), 'utf-8');
        expect(statusDoc).not.toContain('```mermaid');
    });

    it('relationships.md links model names to model pages', async () => {
        const model = await loadSchema(`
            model User {
                id    String @id @default(cuid())
                posts Post[]
            }
            model Post {
                id       String @id @default(cuid())
                author   User   @relation(fields: [authorId], references: [id])
                authorId String
            }
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        const relDoc = fs.readFileSync(path.join(tmpDir, 'relationships.md'), 'utf-8');
        expect(relDoc).toContain('[Index](./index.md) / Relationships');
        expect(relDoc).toContain('[User](./models/User.md)');
        expect(relDoc).toContain('[Post](./models/Post.md)');
    });

    it('index page links to relationships.md', async () => {
        const model = await loadSchema(`
            model User {
                id    String @id @default(cuid())
                posts Post[]
            }
            model Post {
                id       String @id @default(cuid())
                author   User   @relation(fields: [authorId], references: [id])
                authorId String
            }
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        const indexContent = fs.readFileSync(path.join(tmpDir, 'index.md'), 'utf-8');
        expect(indexContent).toContain('[Relationships](./relationships.md)');
    });

    it('groupBy=category produces correct index links', async () => {
        const model = await loadSchema(`
            model User {
                id String @id @default(cuid())
                @@meta('doc:category', 'Identity')
            }
            model Post {
                id String @id @default(cuid())
                @@meta('doc:category', 'Content')
            }
            model Uncategorized {
                id String @id @default(cuid())
            }
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir, groupBy: 'category' },
        });

        const indexContent = fs.readFileSync(path.join(tmpDir, 'index.md'), 'utf-8');
        expect(indexContent).toContain('[User](./models/Identity/User.md)');
        expect(indexContent).toContain('[Post](./models/Content/Post.md)');
        expect(indexContent).toContain('[Uncategorized](./models/Uncategorized.md)');
    });

    it('field @meta doc:example shows example in fields table', async () => {
        const model = await loadSchema(`
            model User {
                id    String @id @default(cuid())
                email String @meta('doc:example', 'jane@example.com')
            }
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        const userDoc = fs.readFileSync(path.join(tmpDir, 'models', 'User.md'), 'utf-8');
        const emailLine = userDoc.split('\n').find((l) => l.includes('| email'));
        expect(emailLine).toContain('jane@example.com');
    });

    it('includeInternalModels=false excludes @@ignore models', async () => {
        const model = await loadSchema(`
            model User {
                id String @id @default(cuid())
            }
            model Internal {
                id String @id @default(cuid())
                @@ignore
            }
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        const indexContent = fs.readFileSync(path.join(tmpDir, 'index.md'), 'utf-8');
        expect(indexContent).toContain('[User]');
        expect(indexContent).not.toContain('[Internal]');
        expect(fs.existsSync(path.join(tmpDir, 'models', 'Internal.md'))).toBe(false);
    });

    it('includeInternalModels=true includes @@ignore models', async () => {
        const model = await loadSchema(`
            model User {
                id String @id @default(cuid())
            }
            model Internal {
                id String @id @default(cuid())
                @@ignore
            }
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir, includeInternalModels: true },
        });

        const indexContent = fs.readFileSync(path.join(tmpDir, 'index.md'), 'utf-8');
        expect(indexContent).toContain('[Internal]');
        expect(fs.existsSync(path.join(tmpDir, 'models', 'Internal.md'))).toBe(true);
    });

    it('handles model with no fields gracefully', async () => {
        const model = await loadSchema(`
            model Empty {
                id String @id @default(cuid())
            }
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        const doc = fs.readFileSync(path.join(tmpDir, 'models', 'Empty.md'), 'utf-8');
        expect(doc).toContain('# Empty');
        expect(doc).toContain('## Fields');
    });

    it('handles self-referential relations', async () => {
        const model = await loadSchema(`
            model Employee {
                id        String    @id @default(cuid())
                managerId String?
                manager   Employee? @relation("ManagerReports", fields: [managerId], references: [id])
                reports   Employee[] @relation("ManagerReports")
            }
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        const doc = fs.readFileSync(path.join(tmpDir, 'models', 'Employee.md'), 'utf-8');
        expect(doc).toContain('## Relationships');
        expect(doc).toContain('[Employee](./Employee.md)');

        const relDoc = fs.readFileSync(path.join(tmpDir, 'relationships.md'), 'utf-8');
        expect(relDoc).toContain('Employee');
    });

    it('index page lists procedures with query/mutation distinction', async () => {
        const model = await loadSchema(`
            model User {
                id String @id @default(cuid())
            }
            procedure getUser(id: String): User
            mutation procedure signUp(name: String): User
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        const indexContent = fs.readFileSync(path.join(tmpDir, 'index.md'), 'utf-8');
        expect(indexContent).toContain('## Procedures');
        expect(indexContent).toContain('[getUser](./procedures/getUser.md)');
        expect(indexContent).toContain('[signUp](./procedures/signUp.md)');
        expect(indexContent).toContain('query');
        expect(indexContent).toContain('mutation');
    });

    it('generates procedure page with heading, badge, and parameters table', async () => {
        const model = await loadSchema(`
            model User {
                id String @id @default(cuid())
            }
            /// Register a new user.
            mutation procedure signUp(email: String, name: String, role: String?): User
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        expect(fs.existsSync(path.join(tmpDir, 'procedures', 'signUp.md'))).toBe(true);
        const procDoc = fs.readFileSync(path.join(tmpDir, 'procedures', 'signUp.md'), 'utf-8');
        expect(procDoc).toContain('# signUp');
        expect(procDoc).toContain('<kbd>Mutation</kbd>');
        expect(procDoc).toContain('Register a new user.');
        expect(procDoc).toContain('[Index](../index.md)');

        // Parameters table
        expect(procDoc).toContain('## Parameters');
        expect(procDoc).toContain('| email');
        expect(procDoc).toContain('| name');
        expect(procDoc).toContain('| role');
        const roleLine = procDoc.split('\n').find((l: string) => l.includes('| role'));
        expect(roleLine).toContain('No');

        // Return type
        expect(procDoc).toContain('## Returns');
        expect(procDoc).toContain('User');
    });

    it('generates query procedure page with query badge', async () => {
        const model = await loadSchema(`
            model User {
                id String @id @default(cuid())
            }
            procedure getUser(id: String): User
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        const procDoc = fs.readFileSync(path.join(tmpDir, 'procedures', 'getUser.md'), 'utf-8');
        expect(procDoc).toContain('# getUser');
        expect(procDoc).toContain('<kbd>Query</kbd>');
        expect(procDoc).not.toContain('<kbd>Mutation</kbd>');
    });

    it('procedure page handles Void return type', async () => {
        const model = await loadSchema(`
            model User {
                id String @id @default(cuid())
            }
            mutation procedure deleteUser(id: String): Void
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        const procDoc = fs.readFileSync(path.join(tmpDir, 'procedures', 'deleteUser.md'), 'utf-8');
        expect(procDoc).toContain('## Returns');
        expect(procDoc).toContain('`Void`');
    });

    it('procedure page handles array return type', async () => {
        const model = await loadSchema(`
            model User {
                id String @id @default(cuid())
            }
            procedure listUsers(): User[]
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        const procDoc = fs.readFileSync(path.join(tmpDir, 'procedures', 'listUsers.md'), 'utf-8');
        expect(procDoc).toContain('## Returns');
        expect(procDoc).toContain('User');
        expect(procDoc).toContain('[]');
    });

    it('procedure page handles no parameters', async () => {
        const model = await loadSchema(`
            model User {
                id String @id @default(cuid())
            }
            procedure listUsers(): User[]
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        const procDoc = fs.readFileSync(path.join(tmpDir, 'procedures', 'listUsers.md'), 'utf-8');
        expect(procDoc).not.toContain('## Parameters');
    });

    it('procedure page includes flowchart showing data flow', async () => {
        const model = await loadSchema(`
            enum Role { ADMIN USER }
            model User {
                id String @id @default(cuid())
            }
            mutation procedure signUp(email: String, name: String, role: Role?): User
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        const procDoc = fs.readFileSync(path.join(tmpDir, 'procedures', 'signUp.md'), 'utf-8');
        expect(procDoc).toContain('```mermaid');
        expect(procDoc).toContain('flowchart LR');
        expect(procDoc).toContain('email');
        expect(procDoc).toContain('name');
        expect(procDoc).toContain('role');
        expect(procDoc).toContain('signUp');
        expect(procDoc).toContain('User');
    });

    it('procedure flowchart works with no params and Void return', async () => {
        const model = await loadSchema(`
            model User {
                id String @id @default(cuid())
            }
            mutation procedure clearCache(): Void
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        const procDoc = fs.readFileSync(path.join(tmpDir, 'procedures', 'clearCache.md'), 'utf-8');
        expect(procDoc).toContain('```mermaid');
        expect(procDoc).toContain('flowchart LR');
        expect(procDoc).toContain('clearCache');
        expect(procDoc).toContain('Void');
    });

    it('procedure return type links to model page', async () => {
        const model = await loadSchema(`
            model User {
                id String @id @default(cuid())
            }
            procedure getUser(id: String): User
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        const procDoc = fs.readFileSync(path.join(tmpDir, 'procedures', 'getUser.md'), 'utf-8');
        expect(procDoc).toContain('[User](../models/User.md)');
    });

    it('procedure return type links to type page', async () => {
        const model = await loadSchema(`
            type Stats {
                total Int
            }
            model User {
                id String @id @default(cuid())
            }
            procedure getStats(): Stats
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        const procDoc = fs.readFileSync(path.join(tmpDir, 'procedures', 'getStats.md'), 'utf-8');
        expect(procDoc).toContain('[Stats](../types/Stats.md)');
    });

    it('procedure param type links to enum page', async () => {
        const model = await loadSchema(`
            enum Role { ADMIN USER }
            model User {
                id String @id @default(cuid())
            }
            mutation procedure setRole(userId: String, role: Role): User
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        const procDoc = fs.readFileSync(path.join(tmpDir, 'procedures', 'setRole.md'), 'utf-8');
        const roleLine = procDoc.split('\n').find((l: string) => l.includes('| role'));
        expect(roleLine).toBeDefined();
        expect(roleLine).toContain('[Role](../enums/Role.md)');
    });

    it('model page shows Used in Procedures section', async () => {
        const model = await loadSchema(`
            model User {
                id String @id @default(cuid())
            }
            procedure getUser(id: String): User
            mutation procedure signUp(name: String): User
            procedure listUsers(): User[]
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        const userDoc = fs.readFileSync(path.join(tmpDir, 'models', 'User.md'), 'utf-8');
        expect(userDoc).toContain('## Used in Procedures');
        expect(userDoc).toContain('[getUser](../procedures/getUser.md)');
        expect(userDoc).toContain('[signUp](../procedures/signUp.md)');
        expect(userDoc).toContain('[listUsers](../procedures/listUsers.md)');
    });

    it('procedure page includes collapsible declaration block', async () => {
        const model = await loadSchema(`
            model User {
                id String @id @default(cuid())
            }
            /// Sign up a new user.
            mutation procedure signUp(email: String, name: String): User
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        const procDoc = fs.readFileSync(path.join(tmpDir, 'procedures', 'signUp.md'), 'utf-8');
        expect(procDoc).toContain('<details>');
        expect(procDoc).toContain('<summary>Declaration</summary>');
        expect(procDoc).toContain('```prisma');
        expect(procDoc).toContain('mutation procedure signUp');
        expect(procDoc).toContain('</details>');
    });

    it('procedure page shows source file path', async () => {
        const model = await loadSchema(`
            model User {
                id String @id @default(cuid())
            }
            procedure getUser(id: String): User
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        const procDoc = fs.readFileSync(path.join(tmpDir, 'procedures', 'getUser.md'), 'utf-8');
        expect(procDoc).toContain('**Defined in:**');
        expect(procDoc).toContain('.zmodel');
    });

    it('index page summary includes procedure count', async () => {
        const model = await loadSchema(`
            model User {
                id String @id @default(cuid())
            }
            procedure getUser(id: String): User
            mutation procedure signUp(name: String): User
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        const indexContent = fs.readFileSync(path.join(tmpDir, 'index.md'), 'utf-8');
        expect(indexContent).toContain('2 procedures');
    });

    it('index page shows entity descriptions inline', async () => {
        const model = await loadSchema(`
            /// A registered user in the platform.
            model User {
                id String @id @default(cuid())
            }
            /// Tracks system events.
            model Activity {
                id String @id @default(cuid())
            }
            /// Roles available in the system.
            enum Role {
                ADMIN
                USER
            }
            /// Common timestamp fields.
            type Timestamps {
                createdAt DateTime @default(now())
            }
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        const indexContent = fs.readFileSync(path.join(tmpDir, 'index.md'), 'utf-8');
        expect(indexContent).toContain('[Activity](./models/Activity.md)');
        expect(indexContent).toContain('Tracks system events');
        expect(indexContent).toContain('[User](./models/User.md)');
        expect(indexContent).toContain('A registered user in the platform');
        expect(indexContent).toContain('Roles available in the system');
        expect(indexContent).toContain('Common timestamp fields');
    });

    it('index page handles entities without descriptions', async () => {
        const model = await loadSchema(`
            model User {
                id String @id @default(cuid())
            }
            /// Has a description.
            model Post {
                id String @id @default(cuid())
            }
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        const indexContent = fs.readFileSync(path.join(tmpDir, 'index.md'), 'utf-8');
        expect(indexContent).toContain('[Post](./models/Post.md)');
        expect(indexContent).toContain('Has a description');
        expect(indexContent).toContain('[User](./models/User.md)');
    });

    it('model pages include prev/next navigation footer', async () => {
        const model = await loadSchema(`
            model Activity {
                id String @id @default(cuid())
            }
            model Post {
                id String @id @default(cuid())
            }
            model User {
                id String @id @default(cuid())
            }
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        const activityDoc = fs.readFileSync(path.join(tmpDir, 'models', 'Activity.md'), 'utf-8');
        expect(activityDoc).toContain('Next: [Post](./Post.md)');
        expect(activityDoc).not.toContain('Previous:');

        const postDoc = fs.readFileSync(path.join(tmpDir, 'models', 'Post.md'), 'utf-8');
        expect(postDoc).toContain('Previous: [Activity](./Activity.md)');
        expect(postDoc).toContain('Next: [User](./User.md)');

        const userDoc = fs.readFileSync(path.join(tmpDir, 'models', 'User.md'), 'utf-8');
        expect(userDoc).toContain('Previous: [Post](./Post.md)');
        expect(userDoc).not.toContain('Next:');
    });

    it('enum pages include prev/next navigation footer', async () => {
        const model = await loadSchema(`
            model User {
                id String @id @default(cuid())
            }
            enum Alpha { A B }
            enum Beta { X Y }
            enum Gamma { P Q }
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        const alphaDoc = fs.readFileSync(path.join(tmpDir, 'enums', 'Alpha.md'), 'utf-8');
        expect(alphaDoc).toContain('Next: [Beta](./Beta.md)');

        const betaDoc = fs.readFileSync(path.join(tmpDir, 'enums', 'Beta.md'), 'utf-8');
        expect(betaDoc).toContain('Previous: [Alpha](./Alpha.md)');
        expect(betaDoc).toContain('Next: [Gamma](./Gamma.md)');
    });

    it('snapshot: full representative schema output', async () => {
        const model = await loadSchema(`
            /// User roles in the system.
            enum Role {
                /// Administrator with full access
                ADMIN
                /// Standard user
                USER
            }

            /// Represents a registered user.
            model User {
                id    String @id @default(cuid())
                /// User's email address.
                email String @unique @email
                /// Display name shown in the UI.
                name  String
                role  Role
                posts Post[]

                @@allow('read', true)
                @@deny('delete', true)
                @@index([email])
                @@meta('doc:category', 'Identity')
                @@meta('doc:since', '1.0')
            }

            /// A blog post.
            model Post {
                id       String @id @default(cuid())
                /// The post title.
                title    String
                content  String?
                author   User   @relation(fields: [authorId], references: [id])
                authorId String

                @@meta('doc:category', 'Content')
            }
        `);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: 'schema.zmodel',
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        const indexContent = fs.readFileSync(path.join(tmpDir, 'index.md'), 'utf-8');
        const userDoc = fs.readFileSync(path.join(tmpDir, 'models', 'User.md'), 'utf-8');
        const postDoc = fs.readFileSync(path.join(tmpDir, 'models', 'Post.md'), 'utf-8');
        const roleDoc = fs.readFileSync(path.join(tmpDir, 'enums', 'Role.md'), 'utf-8');
        const relDoc = fs.readFileSync(path.join(tmpDir, 'relationships.md'), 'utf-8');

        expect(indexContent).toMatchSnapshot('index.md');
        expect(userDoc).toMatchSnapshot('models/User.md');
        expect(postDoc).toMatchSnapshot('models/Post.md');
        expect(roleDoc).toMatchSnapshot('enums/Role.md');
        expect(relDoc).toMatchSnapshot('relationships.md');
    });
});
