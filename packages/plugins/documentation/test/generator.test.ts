import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadSchema } from './utils';
import plugin from '../src/index';

describe('documentation plugin', () => {
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

    it('generates model page with fields table sorted alphabetically', async () => {
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
        expect(userDoc).toContain('| Field');
        expect(userDoc).toContain('| email');
        expect(userDoc).toContain('| id');
        expect(userDoc).toContain('| name');
        expect(userDoc).toContain('Display name shown in the UI.');
        expect(userDoc).toContain('`cuid()`');

        // email is optional
        const emailLine = userDoc.split('\n').find((l) => l.includes('| email'));
        expect(emailLine).toContain('No');

        // id is required
        const idLine = userDoc.split('\n').find((l) => l.includes('| id'));
        expect(idLine).toContain('Yes');

        // alphabetical order: email < id < name
        const emailIdx = userDoc.indexOf('| email');
        const idIdx = userDoc.indexOf('| id');
        const nameIdx = userDoc.indexOf('| name');
        expect(emailIdx).toBeLessThan(idIdx);
        expect(idIdx).toBeLessThan(nameIdx);
    });

    it('generates model page with relationships section', async () => {
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

        const postDoc = fs.readFileSync(path.join(tmpDir, 'models', 'Post.md'), 'utf-8');
        expect(postDoc).toContain('## Relationships');
        expect(postDoc).toContain('| author');
        expect(postDoc).toContain('User');
        expect(postDoc).toContain('Many\u2192One');
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

    it('marks computed fields with a Computed badge', async () => {
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
        expect(fullNameLine).toContain('Computed');
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

    it('renders @@meta doc annotations', async () => {
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
        expect(userDoc).toContain('Use Account instead');
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
        expect(relDoc).toContain('[Index](./index.md)');
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
