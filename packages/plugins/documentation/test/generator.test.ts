import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { findFieldLine, generateFromSchema, loadSchemaFromFile, readDoc } from './utils';
import plugin from '../src/index';

describe('documentation plugin', () => {
    it('all pages include auto-generated header with do-not-edit warning', async () => {
        const tmpDir = await generateFromSchema(`
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

        const headerPattern = /auto-generated.*do not edit/i;

        const indexContent = readDoc(tmpDir, 'index.md');
        expect(indexContent).toMatch(headerPattern);

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toMatch(headerPattern);

        const roleDoc = readDoc(tmpDir, 'enums', 'Role.md');
        expect(roleDoc).toMatch(headerPattern);

        const tsDoc = readDoc(tmpDir, 'types', 'Timestamps.md');
        expect(tsDoc).toMatch(headerPattern);

        const procDoc = readDoc(tmpDir, 'procedures', 'getUser.md');
        expect(procDoc).toMatch(headerPattern);

        const relDoc = readDoc(tmpDir, 'relationships.md');
        expect(relDoc).toMatch(headerPattern);
    });

    it('auto-generated header uses GitHub Alert [!CAUTION] syntax', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id String @id @default(cuid())
            }
        `);

        const indexContent = readDoc(tmpDir, 'index.md');
        expect(indexContent).toContain('> [!CAUTION]');
        expect(indexContent).toContain('> This documentation was auto-generated');

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('> [!CAUTION]');
    });

    it('header includes schema file path and generation date', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id String @id @default(cuid())
            }
        `, {}, '/app/zenstack/schema.zmodel');

        const indexContent = readDoc(tmpDir, 'index.md');
        expect(indexContent).toContain('schema.zmodel');
        // Should contain a date-like string in the header area
        expect(indexContent).toMatch(/Generated.*\d{4}-\d{2}-\d{2}/);

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('schema.zmodel');
        expect(userDoc).toMatch(/Generated.*\d{4}-\d{2}-\d{2}/);
    });

    it('access policy note uses GitHub Alert [!IMPORTANT] syntax', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id String @id @default(cuid())
                @@allow('read', true)
            }
        `);

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('> [!IMPORTANT]');
        expect(userDoc).toContain('denied by default');
    });

    it('entity pages show breadcrumb navigation', async () => {
        const tmpDir = await generateFromSchema(`
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

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('[Index](../index.md)');
        expect(userDoc).toContain('[Models](../index.md#models)');

        const roleDoc = readDoc(tmpDir, 'enums', 'Role.md');
        expect(roleDoc).toContain('[Index](../index.md)');
        expect(roleDoc).toContain('[Enums](../index.md#enums)');

        const tsDoc = readDoc(tmpDir, 'types', 'Timestamps.md');
        expect(tsDoc).toContain('[Index](../index.md)');
        expect(tsDoc).toContain('[Types](../index.md#types)');

        const procDoc = readDoc(tmpDir, 'procedures', 'getUser.md');
        expect(procDoc).toContain('[Index](../index.md)');
        expect(procDoc).toContain('[Procedures](../index.md#procedures)');
    });

    it('entity pages show type badge via kbd tag', async () => {
        const tmpDir = await generateFromSchema(`
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

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('<kbd>Model</kbd>');

        const roleDoc = readDoc(tmpDir, 'enums', 'Role.md');
        expect(roleDoc).toContain('<kbd>Enum</kbd>');

        const tsDoc = readDoc(tmpDir, 'types', 'Timestamps.md');
        expect(tsDoc).toContain('<kbd>Type</kbd>');

        const queryDoc = readDoc(tmpDir, 'procedures', 'getUser.md');
        expect(queryDoc).toContain('<kbd>Query</kbd>');

        const mutDoc = readDoc(tmpDir, 'procedures', 'signUp.md');
        expect(mutDoc).toContain('<kbd>Mutation</kbd>');
    });

    it('produces an index.md file', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id String @id @default(cuid())
            }
        `);

        expect(fs.existsSync(path.join(tmpDir, 'index.md'))).toBe(true);
    });

    it('index page shows summary line with artifact counts', async () => {
        const tmpDir = await generateFromSchema(`
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

        const indexContent = readDoc(tmpDir, 'index.md');
        expect(indexContent).toContain('2 models');
        expect(indexContent).toContain('1 enum');
        expect(indexContent).toContain('1 type');
    });

    it('index page lists views in a separate section from models', async () => {
        const tmpDir = await generateFromSchema(`
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

        const indexContent = readDoc(tmpDir, 'index.md');

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
        const tmpDir = await generateFromSchema(`
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

        const viewDoc = readDoc(tmpDir, 'views', 'UserInfo.md');

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
        expect(viewDoc).toContain('field-id');
        expect(viewDoc).toContain('field-email');
        expect(viewDoc).toContain('field-name');
        expect(viewDoc).toContain('`Int`');
        expect(viewDoc).toContain('`String`');
    });

    it('view page includes declaration block', async () => {
        const tmpDir = await generateFromSchema(`
            view ActiveUsers {
                id    Int
                count Int
            }
            model User {
                id String @id @default(cuid())
            }
        `);

        const viewDoc = readDoc(tmpDir, 'views', 'ActiveUsers.md');
        expect(viewDoc).toContain('<summary>Declaration');
        expect(viewDoc).toContain('view ActiveUsers');
    });

    it('index page lists models alpha-sorted with links', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id String @id @default(cuid())
            }
            model Post {
                id String @id @default(cuid())
            }
        `);

        const indexContent = readDoc(tmpDir, 'index.md');
        expect(indexContent).toContain('# Schema Documentation');
        expect(indexContent).toContain('[Post](./models/Post.md)');
        expect(indexContent).toContain('[User](./models/User.md)');
        const postIdx = indexContent.indexOf('[Post]');
        const userIdx = indexContent.indexOf('[User]');
        expect(postIdx).toBeLessThan(userIdx);
    });

    it('index page lists enums alpha-sorted with links', async () => {
        const tmpDir = await generateFromSchema(`
            enum Role {
                ADMIN
                USER
            }
        `);

        const indexContent = readDoc(tmpDir, 'index.md');
        expect(indexContent).toContain('## Enums');
        expect(indexContent).toContain('[Role](./enums/Role.md)');
    });

    it('index page lists types alpha-sorted with links', async () => {
        const tmpDir = await generateFromSchema(`
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

        const indexContent = readDoc(tmpDir, 'index.md');
        expect(indexContent).toContain('## Types');
        expect(indexContent).toContain('[Metadata](./types/Metadata.md)');
        expect(indexContent).toContain('[Timestamps](./types/Timestamps.md)');
        const metaIdx = indexContent.indexOf('[Metadata]');
        const tsIdx = indexContent.indexOf('[Timestamps]');
        expect(metaIdx).toBeLessThan(tsIdx);
    });

    it('generates type page with heading, description, and fields table', async () => {
        const tmpDir = await generateFromSchema(`
            /// Common timestamp fields for all models.
            type Timestamps {
                createdAt DateTime @default(now())
                updatedAt DateTime @updatedAt
            }
            model User {
                id String @id @default(cuid())
            }
        `);

        expect(fs.existsSync(path.join(tmpDir, 'types', 'Timestamps.md'))).toBe(true);
        const typeDoc = readDoc(tmpDir, 'types', 'Timestamps.md');
        expect(typeDoc).toContain('# Timestamps');
        expect(typeDoc).toContain('Common timestamp fields');
        expect(typeDoc).toContain('[Index](../index.md)');
        expect(typeDoc).toContain('## Fields');
        expect(typeDoc).toContain('field-createdAt');
        expect(typeDoc).toContain('field-updatedAt');
    });

    it('type page shows Used By section linking to models that use it', async () => {
        const tmpDir = await generateFromSchema(`
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

        const typeDoc = readDoc(tmpDir, 'types', 'Timestamps.md');
        expect(typeDoc).toContain('## Used By');
        expect(typeDoc).toContain('[Post](../models/Post.md');
        expect(typeDoc).toContain('[User](../models/User.md');
        expect(typeDoc).not.toContain('[Tag]');
    });

    it('type page includes class diagram showing mixin usage', async () => {
        const tmpDir = await generateFromSchema(`
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

        const typeDoc = readDoc(tmpDir, 'types', 'Timestamps.md');
        expect(typeDoc).toContain('```mermaid');
        expect(typeDoc).toContain('classDiagram');
        expect(typeDoc).toContain('Timestamps');
        expect(typeDoc).toContain('mixin');
        expect(typeDoc).toContain('Post');
        expect(typeDoc).toContain('User');
        expect(typeDoc).not.toMatch(/Tag/);
    });

    it('type page omits class diagram when no models use it', async () => {
        const tmpDir = await generateFromSchema(`
            type Metadata {
                version Int @default(1)
            }
            model User {
                id String @id @default(cuid())
            }
        `);

        const typeDoc = readDoc(tmpDir, 'types', 'Metadata.md');
        expect(typeDoc).not.toContain('```mermaid');
        expect(typeDoc).not.toContain('classDiagram');
    });

    it('scalar types in fields table are backtick-wrapped', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id    String   @id @default(cuid())
                name  String
                age   Int?
                score Float
                active Boolean @default(true)
                joined DateTime @default(now())
            }
        `);

        const doc = readDoc(tmpDir, 'models', 'User.md');
        expect(doc).toContain('| `String` |');
        expect(doc).toContain('| `Int?` |');
        expect(doc).toContain('| `Float` |');
        expect(doc).toContain('| `Boolean` |');
        expect(doc).toContain('| `DateTime` |');
    });

    it('type page fields default to declaration order', async () => {
        const tmpDir = await generateFromSchema(`
            type Metadata {
                version Int @default(1)
                createdBy String
                active Boolean
            }
            model User {
                id String @id @default(cuid())
            }
        `);

        const typeDoc = readDoc(tmpDir, 'types', 'Metadata.md');

        // declaration order: version, createdBy, active
        const versionIdx = typeDoc.indexOf('field-version');
        const createdByIdx = typeDoc.indexOf('field-createdBy');
        const activeIdx = typeDoc.indexOf('field-active');
        expect(versionIdx).toBeLessThan(createdByIdx);
        expect(createdByIdx).toBeLessThan(activeIdx);
    });

    it('model page shows source file path', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id String @id @default(cuid())
            }
        `);

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('**Defined in:**');
        expect(userDoc).toContain('.zmodel');
    });

    it('enum page shows source file path', async () => {
        const tmpDir = await generateFromSchema(`
            enum Role {
                ADMIN
                MEMBER
            }
            model User {
                id   String @id @default(cuid())
                role Role
            }
        `);

        const enumDoc = readDoc(tmpDir, 'enums', 'Role.md');
        expect(enumDoc).toContain('**Defined in:**');
        expect(enumDoc).toContain('.zmodel');
    });

    it('type page shows source file path', async () => {
        const tmpDir = await generateFromSchema(`
            type Timestamps {
                createdAt DateTime @default(now())
            }
            model User {
                id String @id @default(cuid())
            }
        `);

        const typeDoc = readDoc(tmpDir, 'types', 'Timestamps.md');
        expect(typeDoc).toContain('**Defined in:**');
        expect(typeDoc).toContain('.zmodel');
    });

    it('enum page includes declaration code block', async () => {
        const tmpDir = await generateFromSchema(`
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

        const enumDoc = readDoc(tmpDir, 'enums', 'Role.md');
        expect(enumDoc).toContain('<summary>Declaration');
        expect(enumDoc).toContain('```prisma');
        expect(enumDoc).toContain('enum Role {');
        expect(enumDoc).toContain('ADMIN');
    });

    it('type page includes declaration code block', async () => {
        const tmpDir = await generateFromSchema(`
            /// Shared timestamp fields.
            type Timestamps {
                createdAt DateTime @default(now())
                updatedAt DateTime @updatedAt
            }
            model User {
                id String @id @default(cuid())
            }
        `);

        const typeDoc = readDoc(tmpDir, 'types', 'Timestamps.md');
        expect(typeDoc).toContain('<summary>Declaration');
        expect(typeDoc).toContain('```prisma');
        expect(typeDoc).toContain('type Timestamps {');
        expect(typeDoc).toContain('createdAt DateTime');
    });

    it('model page shows Mixins section linking to type pages', async () => {
        const tmpDir = await generateFromSchema(`
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

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('## Mixins');
        expect(userDoc).toContain('[Timestamps](../types/Timestamps.md)');
        expect(userDoc).toContain('[Metadata](../types/Metadata.md)');
    });

    it('fields table has Source column linking mixin fields to type page', async () => {
        const tmpDir = await generateFromSchema(`
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

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('| Source |');

        const createdAtLine = findFieldLine(userDoc, 'createdAt');
        expect(createdAtLine).toBeDefined();
        expect(createdAtLine).toContain('[Timestamps](../types/Timestamps.md)');
        expect(createdAtLine).toContain('Record creation time.');

        const emailLine = findFieldLine(userDoc, 'email');
        expect(emailLine).toBeDefined();
        expect(emailLine).toContain('User email address.');
        expect(emailLine).not.toContain('[Timestamps]');
    });

    it('generates model page with heading and description', async () => {
        const tmpDir = await generateFromSchema(`
            /// Represents a registered user.
            /// Has many posts.
            model User {
                id String @id @default(cuid())
            }
        `);

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('# User');
        expect(userDoc).toContain('Represents a registered user.');
        expect(userDoc).toContain('Has many posts.');
    });

    it('model page includes horizontal table of contents with anchor links', async () => {
        const tmpDir = await generateFromSchema(`
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

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
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

    it('index page has horizontal TOC with links to present sections', async () => {
        const tmpDir = await generateFromSchema(`
            enum Role { ADMIN USER }
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

        const indexContent = readDoc(tmpDir, 'index.md');
        // TOC should appear before any ## heading and link to sections
        expect(indexContent).toContain('[Models](#models)');
        expect(indexContent).toContain('[Enums](#enums)');
        expect(indexContent).toContain('[Types](#types)');
        expect(indexContent).toContain('[Procedures](#procedures)');

        // TOC should be a single line with dots/middot separating
        const tocLine = indexContent.split('\n').find((l) => l.includes('[Models](#models)'));
        expect(tocLine).toBeDefined();
        expect(tocLine).toContain('[Enums](#enums)');
    });

    it('index page includes introductory context paragraph', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id String @id @default(cuid())
            }
        `, {}, '/app/project/schema.zmodel');

        const indexContent = readDoc(tmpDir, 'index.md');
        // Should have contextual intro text
        expect(indexContent).toContain('ZModel');
        expect(indexContent).toContain('zenstack.dev');
    });

    it('model page includes external ZenStack docs link', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id String @id @default(cuid())
            }
        `);

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('zenstack.dev');
        expect(userDoc).toContain('data-model');
    });

    it('enum page includes external ZenStack docs link', async () => {
        const tmpDir = await generateFromSchema(`
            enum Role { ADMIN USER }
            model User {
                id String @id @default(cuid())
                role Role
            }
        `);

        const roleDoc = readDoc(tmpDir, 'enums', 'Role.md');
        expect(roleDoc).toContain('zenstack.dev');
        expect(roleDoc).toContain('enum');
    });

    it('view page includes external ZenStack docs link', async () => {
        const tmpDir = await generateFromSchema(`
            view UserInfo {
                id Int
                name String
            }
        `);

        const viewDoc = readDoc(tmpDir, 'views', 'UserInfo.md');
        expect(viewDoc).toContain('zenstack.dev');
        expect(viewDoc).toContain('view');
    });

    it('procedure page includes external ZenStack docs link', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id String @id @default(cuid())
            }
            procedure getUser(id: String): User
        `);

        const procDoc = readDoc(tmpDir, 'procedures', 'getUser.md');
        expect(procDoc).toContain('zenstack.dev');
        expect(procDoc).toContain('procedure');
    });

    it('declaration summary includes source file path', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id String @id @default(cuid())
            }
        `);

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        // The <summary> should include the source file
        const summaryLine = userDoc.split('\n').find((l) => l.includes('<summary>'));
        expect(summaryLine).toContain('Declaration');
        expect(summaryLine).toContain('.zmodel');
    });

    it('model page includes declaration code block', async () => {
        const tmpDir = await generateFromSchema(`
            /// A registered user.
            model User {
                id    String @id @default(cuid())
                email String
            }
        `);

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('<details>');
        expect(userDoc).toContain('<summary>Declaration');
        expect(userDoc).toContain('```prisma');
        expect(userDoc).toContain('model User {');
        expect(userDoc).toContain('id    String @id @default(cuid())');
        expect(userDoc).toContain('</details>');
    });

    it('fields with no description show em-dash instead of blank', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id    String @id @default(cuid())
                email String
            }
        `);

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        const idLine = findFieldLine(userDoc, 'id');
        expect(idLine).toBeDefined();
        // Last column should be — not empty
        expect(idLine).toMatch(/\| — \|$/);
    });

    it('fields default to declaration order', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id    String  @id @default(cuid())
                /// Display name shown in the UI.
                name  String
                email String?
            }
        `);

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('## Fields');
        expect(userDoc).toContain('Display name shown in the UI.');
        expect(userDoc).toContain('`cuid()`');

        // declaration order: id, name, email
        const idIdx = userDoc.indexOf('field-id');
        const nameIdx = userDoc.indexOf('field-name');
        const emailIdx = userDoc.indexOf('field-email');
        expect(idIdx).toBeLessThan(nameIdx);
        expect(nameIdx).toBeLessThan(emailIdx);

        // email is optional
        const emailLine = findFieldLine(userDoc, 'email');
        expect(emailLine).toContain('No');

        // id is required
        const idLine = findFieldLine(userDoc, 'id');
        expect(idLine).toContain('Yes');
    });

    it('fieldOrder=alphabetical sorts fields alphabetically', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id    String  @id @default(cuid())
                name  String
                email String?
            }
        `, { fieldOrder: 'alphabetical' });

        const userDoc = readDoc(tmpDir, 'models', 'User.md');

        // alphabetical order: email < id < name
        const emailIdx = userDoc.indexOf('field-email');
        const idIdx = userDoc.indexOf('field-id');
        const nameIdx = userDoc.indexOf('field-name');
        expect(emailIdx).toBeLessThan(idIdx);
        expect(idIdx).toBeLessThan(nameIdx);
    });

    it('generates model page with relationships section and mini ER diagram', async () => {
        const tmpDir = await generateFromSchema(`
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

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('## Relationships');
        expect(userDoc).toContain('| posts');
        expect(userDoc).toContain('Post');
        expect(userDoc).toContain('One\u2192Many');

        // Mini ER diagram
        expect(userDoc).toContain('```mermaid');
        expect(userDoc).toContain('erDiagram');
        expect(userDoc).toContain('User');
        expect(userDoc).toContain('Post');

        const postDoc = readDoc(tmpDir, 'models', 'Post.md');
        expect(postDoc).toContain('## Relationships');
        expect(postDoc).toContain('| author');
        expect(postDoc).toContain('User');
        expect(postDoc).toContain('Many\u2192One');

        // Post also gets a diagram
        expect(postDoc).toContain('```mermaid');
        expect(postDoc).toContain('erDiagram');

        const authorLine = postDoc.split('\n').find((l) => l.includes('field-author') && l.includes('@relation'));
        expect(authorLine).toBeDefined();
        expect(authorLine).toContain('fields: [authorId]');
        expect(authorLine).not.toContain('fields: fields:');
        expect(authorLine).toContain('references: [id]');
        expect(authorLine).not.toContain('references: references:');
    });

    it('generates enum page with heading, description, and values', async () => {
        const tmpDir = await generateFromSchema(`
            /// User roles in the system.
            enum Role {
                /// Full access
                ADMIN
                /// Standard access
                USER
                GUEST
            }
        `);

        const enumDoc = readDoc(tmpDir, 'enums', 'Role.md');
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
        const tmpDir = await generateFromSchema(`
            model User {
                id String @id @default(cuid())
            }
        `, { title: 'My API' });

        const indexContent = readDoc(tmpDir, 'index.md');
        expect(indexContent).toContain('# My API');
        expect(indexContent).not.toContain('# Schema Documentation');
    });

    it('produces correct directory structure for models and enums', async () => {
        const tmpDir = await generateFromSchema(`
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

        expect(fs.existsSync(path.join(tmpDir, 'index.md'))).toBe(true);
        expect(fs.existsSync(path.join(tmpDir, 'models', 'User.md'))).toBe(true);
        expect(fs.existsSync(path.join(tmpDir, 'models', 'Post.md'))).toBe(true);
        expect(fs.existsSync(path.join(tmpDir, 'enums', 'Role.md'))).toBe(true);
    });

    it('generates access policies section from @@allow and @@deny', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id    String @id @default(cuid())
                email String

                @@allow('read', true)
                @@deny('delete', true)
            }
        `);

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('## Access Policies');
        expect(userDoc).toContain('| read');
        expect(userDoc).toContain('Allow');
        expect(userDoc).toContain('| delete');
        expect(userDoc).toContain('Deny');
    });

    it('access policies section includes evaluation note', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id   String @id @default(cuid())
                @@allow('read', true)
                @@deny('delete', true)
            }
        `);

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('## Access Policies');
        expect(userDoc).toContain('denied by default');
        expect(userDoc).toContain('@@deny');
        expect(userDoc).toContain('@@allow');
    });

    it('generates validation rules section', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id    String @id @default(cuid())
                email String @email
                name  String @length(1, 100)
            }
        `);

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('## Validation Rules');
        expect(userDoc).toContain('| email');
        expect(userDoc).toContain('`@email`');
        expect(userDoc).toContain('| name');
        expect(userDoc).toContain('`@length`');
    });

    it('@map field attribute renders in Attributes column', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id   String @id @default(cuid())
                name String @map("user_name")
            }
        `);

        const doc = readDoc(tmpDir, 'models', 'User.md');
        const nameLine = findFieldLine(doc, 'name');
        expect(nameLine).toBeDefined();
        expect(nameLine).toContain('@map');
    });

    it('@updatedAt field attribute renders in Attributes column', async () => {
        const tmpDir = await generateFromSchema(`
            model Post {
                id        String   @id @default(cuid())
                updatedAt DateTime @updatedAt
            }
        `);

        const doc = readDoc(tmpDir, 'models', 'Post.md');
        const updatedAtLine = findFieldLine(doc, 'updatedAt');
        expect(updatedAtLine).toBeDefined();
        expect(updatedAtLine).toContain('`@updatedAt`');
    });

    it('@json field attribute renders in Attributes column on a model', async () => {
        const tmpDir = await generateFromSchema(`
            type Address {
                street String
                city   String
            }
            model User {
                id      String  @id @default(cuid())
                address Address @json
            }
        `);

        const doc = readDoc(tmpDir, 'models', 'User.md');
        const addressLine = findFieldLine(doc, 'address');
        expect(addressLine).toBeDefined();
        expect(addressLine).toContain('`@json`');
    });

    it('auth() function renders in access policy rules', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id    String @id @default(cuid())
                email String
                @@auth
                @@allow('read', true)
                @@allow('update', auth() == this)
                @@deny('delete', auth() == this)
            }
        `);

        const doc = readDoc(tmpDir, 'models', 'User.md');
        expect(doc).toContain('## Access Policies');
        expect(doc).toContain('`auth() == this`');
    });

    it('all predefined default-value functions render in Default column', async () => {
        const tmpDir = await generateFromSchema(`
            model Defaults {
                autoId   Int      @id @default(autoincrement())
                uid      String   @default(uuid())
                cid      String   @default(cuid())
                nid      String   @default(nanoid())
                uli      String   @default(ulid())
                created  DateTime @default(now())
                dbVal    String   @default(dbgenerated())
            }
        `);

        const doc = readDoc(tmpDir, 'models', 'Defaults.md');

        const autoIdLine = findFieldLine(doc, 'autoId');
        expect(autoIdLine).toContain('`autoincrement()`');

        const uidLine = findFieldLine(doc, 'uid');
        expect(uidLine).toContain('`uuid()`');

        const cidLine = findFieldLine(doc, 'cid');
        expect(cidLine).toContain('`cuid()`');

        const nidLine = findFieldLine(doc, 'nid');
        expect(nidLine).toContain('`nanoid()`');

        const uliLine = findFieldLine(doc, 'uli');
        expect(uliLine).toContain('`ulid()`');

        const createdLine = findFieldLine(doc, 'created');
        expect(createdLine).toContain('`now()`');

        const dbLine = findFieldLine(doc, 'dbVal');
        expect(dbLine).toContain('`dbgenerated()`');
    });

    it('model with @@map shows mapped table name in metadata', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id String @id @default(cuid())
                @@map("users")
            }
        `);

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('**Table:** `users`');
    });

    it('model with @@schema shows database schema in metadata', async () => {
        const schemaContent = `
            datasource db {
                provider = "postgresql"
                url      = "postgresql://localhost:5432/test"
                schemas  = ["auth", "public"]
            }
            model User {
                id String @id @default(cuid())
                @@schema("auth")
            }
        `;
        const tmpSchemaFile = path.join(os.tmpdir(), `zenstack-schema-${crypto.randomUUID()}.zmodel`);
        fs.writeFileSync(tmpSchemaFile, schemaContent);

        const model = await loadSchemaFromFile(tmpSchemaFile);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: tmpSchemaFile,
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('**Schema:** `auth`');
    });

    it('field with @ignore shows ignored badge in Type column', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id       String @id @default(cuid())
                internal String @ignore
            }
        `);

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        const internalLine = findFieldLine(userDoc, 'internal');
        expect(internalLine).toBeDefined();
        expect(internalLine).toContain('<kbd>ignored</kbd>');
    });

    it('model with @@auth renders Auth badge on heading', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id String @id @default(cuid())
                email String
                @@auth
            }
        `);

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('<kbd>Auth</kbd>');
        expect(userDoc).toContain('<kbd>Model</kbd>');
    });

    it('model with @@delegate renders Delegate badge on heading', async () => {
        const tmpDir = await generateFromSchema(`
            enum AssetType { IMAGE VIDEO }
            model Asset {
                id   String    @id @default(cuid())
                type AssetType
                @@delegate(type)
            }
            model Image extends Asset {
                url String
            }
        `);

        const assetDoc = readDoc(tmpDir, 'models', 'Asset.md');
        expect(assetDoc).toContain('<kbd>Delegate</kbd>');
        expect(assetDoc).toContain('<kbd>Model</kbd>');
    });

    it('renders all predefined validation attributes in validation rules section', async () => {
        const tmpDir = await generateFromSchema(`
            model Product {
                id          String  @id @default(cuid())
                sku         String  @regex('^[A-Z0-9]+$')
                slug        String  @startsWith('product-')
                suffix      String  @endsWith('-v2')
                tags        String  @contains('sale')
                email       String  @email
                website     String  @url
                name        String  @length(1, 100) @trim @lower
                title       String  @upper
                dateStr     String  @datetime
                price       Float   @gt(0)
                discount    Float   @gte(0)
                maxQty      Int     @lt(1000)
                minQty      Int     @lte(500)
            }
        `);

        const doc = readDoc(tmpDir, 'models', 'Product.md');
        expect(doc).toContain('## Validation Rules');

        const validationSection = doc.split('## Validation Rules')[1]!;
        expect(validationSection).toContain('`@regex`');
        expect(validationSection).toContain('`@startsWith`');
        expect(validationSection).toContain('`@endsWith`');
        expect(validationSection).toContain('`@contains`');
        expect(validationSection).toContain('`@email`');
        expect(validationSection).toContain('`@url`');
        expect(validationSection).toContain('`@length`');
        expect(validationSection).toContain('`@trim`');
        expect(validationSection).toContain('`@lower`');
        expect(validationSection).toContain('`@upper`');
        expect(validationSection).toContain('`@datetime`');
        expect(validationSection).toContain('`@gt`');
        expect(validationSection).toContain('`@gte`');
        expect(validationSection).toContain('`@lt`');
        expect(validationSection).toContain('`@lte`');
    });

    it('@@validate model-level rule renders in validation rules section', async () => {
        const tmpDir = await generateFromSchema(`
            model Event {
                id        String   @id @default(cuid())
                startDate DateTime
                endDate   DateTime
                @@validate(startDate < endDate, "Start must precede end")
            }
        `);

        const doc = readDoc(tmpDir, 'models', 'Event.md');
        expect(doc).toContain('## Validation Rules');
        expect(doc).toContain('startDate < endDate');
        expect(doc).toContain('Start must precede end');
    });

    it('@@validate with validation functions renders expression text', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id    String @id @default(cuid())
                email String
                name  String
                @@validate(contains(name, 'test'))
            }
        `);

        const doc = readDoc(tmpDir, 'models', 'User.md');
        expect(doc).toContain('## Validation Rules');
        expect(doc).toContain("contains(name, 'test')");
    });

    it('generates indexes section from @@index and @@unique', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id    String @id @default(cuid())
                email String @unique
                name  String

                @@index([name])
                @@unique([email, name])
            }
        `);

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('## Indexes');
        expect(userDoc).toContain('Index');
        expect(userDoc).toContain('Unique');
    });

    it('marks computed fields with kbd badge in Type column', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id        String @id @default(cuid())
                firstName String
                lastName  String
                fullName  String @computed
            }
        `);

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        const fullNameLine = findFieldLine(userDoc, 'fullName');
        expect(fullNameLine).toBeDefined();
        expect(fullNameLine).toContain('<kbd>computed</kbd>');
        expect(fullNameLine).toContain('`String`');
        // Should not show "**Computed**" in description column anymore
        expect(fullNameLine).not.toContain('**Computed**');
    });

    it('renders multiple computed field types with badge and description', async () => {
        const tmpDir = await generateFromSchema(`
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

        const doc = readDoc(tmpDir, 'models', 'Project.md');
        const lines = doc.split('\n');

        const taskCountLine = lines.find((l) => l.includes('field-taskCount'));
        expect(taskCountLine).toContain('`Int` <kbd>computed</kbd>');
        expect(taskCountLine).toContain('Total number of tasks');

        const completionLine = lines.find((l) => l.includes('field-completionRate'));
        expect(completionLine).toContain('`Float` <kbd>computed</kbd>');
        expect(completionLine).toContain('Percentage of tasks');

        const overdueLine = lines.find((l) => l.includes('field-isOverdue'));
        expect(overdueLine).toContain('`Boolean` <kbd>computed</kbd>');
        expect(overdueLine).toContain('overdue tasks');

        const displayLine = lines.find((l) => l.includes('field-displayLabel'));
        expect(displayLine).toContain('`String` <kbd>computed</kbd>');
        expect(displayLine).toContain('Full display label');

        // Non-computed fields should NOT have the badge
        const nameLine = lines.find((l) => l.includes('field-name'));
        expect(nameLine).not.toContain('<kbd>computed</kbd>');
    });

    it('annotates inherited fields with source model', async () => {
        const tmpDir = await generateFromSchema(`
            model BaseModel {
                id   String @id @default(cuid())
                type String
                @@delegate(type)
            }
            model User extends BaseModel {
                email String
            }
        `);

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('| Source |');

        const idLine = findFieldLine(userDoc, 'id');
        expect(idLine).toBeDefined();
        expect(idLine).toContain('[BaseModel](./BaseModel.md)');

        const emailLine = findFieldLine(userDoc, 'email');
        expect(emailLine).toBeDefined();
        expect(emailLine).not.toContain('[BaseModel]');
    });

    it('renders metadata as inline key-value pairs without empty table headers', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id String @id @default(cuid())

                @@meta('doc:category', 'Identity')
                @@meta('doc:since', '2.0')
                @@meta('doc:deprecated', 'Use Account instead')
            }
        `);

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('**Category:** Identity');
        expect(userDoc).toContain('**Since:** 2.0');
        expect(userDoc).toContain('**Deprecated:** Use Account instead');
        expect(userDoc).toContain('**Defined in:**');
        expect(userDoc).not.toContain('| | |');
    });

    it('groups models by category when groupBy = category', async () => {
        const tmpDir = await generateFromSchema(`
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
        `, { groupBy: 'category' });

        expect(fs.existsSync(path.join(tmpDir, 'models', 'Identity', 'User.md'))).toBe(true);
        expect(fs.existsSync(path.join(tmpDir, 'models', 'Content', 'Post.md'))).toBe(true);
        expect(fs.existsSync(path.join(tmpDir, 'models', 'Uncategorized.md'))).toBe(true);
    });

    it('generates relationships.md with cross-reference table and Mermaid diagram', async () => {
        const tmpDir = await generateFromSchema(`
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

        const relDoc = readDoc(tmpDir, 'relationships.md');
        expect(relDoc).toContain('# Relationships');
        expect(relDoc).toContain('erDiagram');
        expect(relDoc).toContain('User');
        expect(relDoc).toContain('Post');
        expect(relDoc).toContain('Tag');
    });

    it('omits sections when include* flags are false', async () => {
        const tmpDir = await generateFromSchema(`
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
        `, {
            includeRelationships: false,
            includePolicies: false,
            includeValidation: false,
            includeIndexes: false,
        });

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).not.toContain('## Relationships');
        expect(userDoc).not.toContain('## Access Policies');
        expect(userDoc).not.toContain('## Validation Rules');
        expect(userDoc).not.toContain('## Indexes');

        expect(fs.existsSync(path.join(tmpDir, 'relationships.md'))).toBe(false);
    });

    it('links field types to model and enum pages', async () => {
        const tmpDir = await generateFromSchema(`
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

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        const roleLine = findFieldLine(userDoc, 'role');
        expect(roleLine).toContain('[Role](../enums/Role.md)');

        const postsLine = findFieldLine(userDoc, 'posts');
        expect(postsLine).toContain('[Post](./Post.md)');

        const postDoc = readDoc(tmpDir, 'models', 'Post.md');
        const authorLine = findFieldLine(postDoc, 'author');
        expect(authorLine).toContain('[User](./User.md)');

        const idLine = findFieldLine(userDoc, 'id');
        expect(idLine).not.toContain('[String]');
    });

    it('model pages link back to index', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id String @id @default(cuid())
            }
        `);

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('[Index](../index.md)');
    });

    it('enum pages link back to index and show used-by models', async () => {
        const tmpDir = await generateFromSchema(`
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

        const roleDoc = readDoc(tmpDir, 'enums', 'Role.md');
        expect(roleDoc).toContain('[Index](../index.md)');
        expect(roleDoc).toContain('## Used By');
        expect(roleDoc).toContain('[Post](../models/Post.md)');
        expect(roleDoc).toContain('[User](../models/User.md)');
    });

    it('enum page includes class diagram showing usage by models', async () => {
        const tmpDir = await generateFromSchema(`
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

        const roleDoc = readDoc(tmpDir, 'enums', 'Role.md');
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
        const tmpDir = await generateFromSchema(`
            enum Status { ACTIVE INACTIVE }
            model User {
                id String @id @default(cuid())
            }
        `);

        const statusDoc = readDoc(tmpDir, 'enums', 'Status.md');
        expect(statusDoc).not.toContain('```mermaid');
    });

    it('relationships.md links model names to model pages', async () => {
        const tmpDir = await generateFromSchema(`
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

        const relDoc = readDoc(tmpDir, 'relationships.md');
        expect(relDoc).toContain('[Index](./index.md) / Relationships');
        expect(relDoc).toContain('[User](./models/User.md)');
        expect(relDoc).toContain('[Post](./models/Post.md)');
    });

    it('index page links to relationships.md', async () => {
        const tmpDir = await generateFromSchema(`
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

        const indexContent = readDoc(tmpDir, 'index.md');
        expect(indexContent).toContain('[Relationships](./relationships.md)');
    });

    it('groupBy=category produces correct index links', async () => {
        const tmpDir = await generateFromSchema(`
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
        `, { groupBy: 'category' });

        const indexContent = readDoc(tmpDir, 'index.md');
        expect(indexContent).toContain('[User](./models/Identity/User.md)');
        expect(indexContent).toContain('[Post](./models/Content/Post.md)');
        expect(indexContent).toContain('[Uncategorized](./models/Uncategorized.md)');
    });

    it('field @meta doc:example shows example in fields table', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id    String @id @default(cuid())
                email String @meta('doc:example', 'jane@example.com')
            }
        `);

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        const emailLine = findFieldLine(userDoc, 'email');
        expect(emailLine).toContain('jane@example.com');
    });

    it('includeInternalModels=false excludes @@ignore models', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id String @id @default(cuid())
            }
            model Internal {
                id String @id @default(cuid())
                @@ignore
            }
        `);

        const indexContent = readDoc(tmpDir, 'index.md');
        expect(indexContent).toContain('[User]');
        expect(indexContent).not.toContain('[Internal]');
        expect(fs.existsSync(path.join(tmpDir, 'models', 'Internal.md'))).toBe(false);
    });

    it('includeInternalModels=true includes @@ignore models', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id String @id @default(cuid())
            }
            model Internal {
                id String @id @default(cuid())
                @@ignore
            }
        `, { includeInternalModels: true });

        const indexContent = readDoc(tmpDir, 'index.md');
        expect(indexContent).toContain('[Internal]');
        expect(fs.existsSync(path.join(tmpDir, 'models', 'Internal.md'))).toBe(true);
    });

    it('handles model with no fields gracefully', async () => {
        const tmpDir = await generateFromSchema(`
            model Empty {
                id String @id @default(cuid())
            }
        `);

        const doc = readDoc(tmpDir, 'models', 'Empty.md');
        expect(doc).toContain('# Empty');
        expect(doc).toContain('## Fields');
    });

    it('handles self-referential relations', async () => {
        const tmpDir = await generateFromSchema(`
            model Employee {
                id        String    @id @default(cuid())
                managerId String?
                manager   Employee? @relation("ManagerReports", fields: [managerId], references: [id])
                reports   Employee[] @relation("ManagerReports")
            }
        `);

        const doc = readDoc(tmpDir, 'models', 'Employee.md');
        expect(doc).toContain('## Relationships');
        expect(doc).toContain('[Employee](./Employee.md)');

        const relDoc = readDoc(tmpDir, 'relationships.md');
        expect(relDoc).toContain('Employee');
    });

    it('index page lists procedures with query/mutation distinction', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id String @id @default(cuid())
            }
            procedure getUser(id: String): User
            mutation procedure signUp(name: String): User
        `);

        const indexContent = readDoc(tmpDir, 'index.md');
        expect(indexContent).toContain('## Procedures');
        expect(indexContent).toContain('[getUser](./procedures/getUser.md)');
        expect(indexContent).toContain('[signUp](./procedures/signUp.md)');
        expect(indexContent).toContain('query');
        expect(indexContent).toContain('mutation');
    });

    it('generates procedure page with heading, badge, and parameters table', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id String @id @default(cuid())
            }
            /// Register a new user.
            mutation procedure signUp(email: String, name: String, role: String?): User
        `);

        expect(fs.existsSync(path.join(tmpDir, 'procedures', 'signUp.md'))).toBe(true);
        const procDoc = readDoc(tmpDir, 'procedures', 'signUp.md');
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
        const tmpDir = await generateFromSchema(`
            model User {
                id String @id @default(cuid())
            }
            procedure getUser(id: String): User
        `);

        const procDoc = readDoc(tmpDir, 'procedures', 'getUser.md');
        expect(procDoc).toContain('# getUser');
        expect(procDoc).toContain('<kbd>Query</kbd>');
        expect(procDoc).not.toContain('<kbd>Mutation</kbd>');
    });

    it('procedure page handles Void return type', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id String @id @default(cuid())
            }
            mutation procedure deleteUser(id: String): Void
        `);

        const procDoc = readDoc(tmpDir, 'procedures', 'deleteUser.md');
        expect(procDoc).toContain('## Returns');
        expect(procDoc).toContain('`Void`');
    });

    it('procedure page handles array return type', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id String @id @default(cuid())
            }
            procedure listUsers(): User[]
        `);

        const procDoc = readDoc(tmpDir, 'procedures', 'listUsers.md');
        expect(procDoc).toContain('## Returns');
        expect(procDoc).toContain('User');
        expect(procDoc).toContain('[]');
    });

    it('procedure page handles no parameters', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id String @id @default(cuid())
            }
            procedure listUsers(): User[]
        `);

        const procDoc = readDoc(tmpDir, 'procedures', 'listUsers.md');
        expect(procDoc).not.toContain('## Parameters');
    });

    it('procedure page includes flowchart showing data flow', async () => {
        const tmpDir = await generateFromSchema(`
            enum Role { ADMIN USER }
            model User {
                id String @id @default(cuid())
            }
            mutation procedure signUp(email: String, name: String, role: Role?): User
        `);

        const procDoc = readDoc(tmpDir, 'procedures', 'signUp.md');
        expect(procDoc).toContain('```mermaid');
        expect(procDoc).toContain('flowchart LR');
        expect(procDoc).toContain('email');
        expect(procDoc).toContain('name');
        expect(procDoc).toContain('role');
        expect(procDoc).toContain('signUp');
        expect(procDoc).toContain('User');
    });

    it('procedure flowchart works with no params and Void return', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id String @id @default(cuid())
            }
            mutation procedure clearCache(): Void
        `);

        const procDoc = readDoc(tmpDir, 'procedures', 'clearCache.md');
        expect(procDoc).toContain('```mermaid');
        expect(procDoc).toContain('flowchart LR');
        expect(procDoc).toContain('clearCache');
        expect(procDoc).toContain('Void');
    });

    it('procedure return type links to model page', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id String @id @default(cuid())
            }
            procedure getUser(id: String): User
        `);

        const procDoc = readDoc(tmpDir, 'procedures', 'getUser.md');
        expect(procDoc).toContain('[User](../models/User.md)');
    });

    it('procedure return type links to type page', async () => {
        const tmpDir = await generateFromSchema(`
            type Stats {
                total Int
            }
            model User {
                id String @id @default(cuid())
            }
            procedure getStats(): Stats
        `);

        const procDoc = readDoc(tmpDir, 'procedures', 'getStats.md');
        expect(procDoc).toContain('[Stats](../types/Stats.md)');
    });

    it('procedure param type links to enum page', async () => {
        const tmpDir = await generateFromSchema(`
            enum Role { ADMIN USER }
            model User {
                id String @id @default(cuid())
            }
            mutation procedure setRole(userId: String, role: Role): User
        `);

        const procDoc = readDoc(tmpDir, 'procedures', 'setRole.md');
        const roleLine = procDoc.split('\n').find((l: string) => l.includes('| role'));
        expect(roleLine).toBeDefined();
        expect(roleLine).toContain('[Role](../enums/Role.md)');
    });

    it('model page shows Used in Procedures section', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id String @id @default(cuid())
            }
            procedure getUser(id: String): User
            mutation procedure signUp(name: String): User
            procedure listUsers(): User[]
        `);

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('## Used in Procedures');
        expect(userDoc).toContain('[getUser](../procedures/getUser.md)');
        expect(userDoc).toContain('[signUp](../procedures/signUp.md)');
        expect(userDoc).toContain('[listUsers](../procedures/listUsers.md)');
    });

    it('procedure page includes collapsible declaration block', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id String @id @default(cuid())
            }
            /// Sign up a new user.
            mutation procedure signUp(email: String, name: String): User
        `);

        const procDoc = readDoc(tmpDir, 'procedures', 'signUp.md');
        expect(procDoc).toContain('<details>');
        expect(procDoc).toContain('<summary>Declaration');
        expect(procDoc).toContain('```prisma');
        expect(procDoc).toContain('mutation procedure signUp');
        expect(procDoc).toContain('</details>');
    });

    it('procedure page shows Defined In before Parameters, not between params and returns', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id String @id @default(cuid())
            }
            procedure getUser(id: String): User
        `);

        const procDoc = readDoc(tmpDir, 'procedures', 'getUser.md');
        expect(procDoc).toContain('**Defined in:**');
        expect(procDoc).toContain('.zmodel');
        // "Defined in" should appear before ## Parameters (top metadata area)
        const definedIdx = procDoc.indexOf('**Defined in:**');
        const paramsIdx = procDoc.indexOf('## Parameters');
        const returnsIdx = procDoc.indexOf('## Returns');
        if (paramsIdx !== -1) {
            expect(definedIdx).toBeLessThan(paramsIdx);
        }
        // And definitely before Returns
        expect(definedIdx).toBeLessThan(returnsIdx);
    });

    it('index page summary includes procedure count', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id String @id @default(cuid())
            }
            procedure getUser(id: String): User
            mutation procedure signUp(name: String): User
        `);

        const indexContent = readDoc(tmpDir, 'index.md');
        expect(indexContent).toContain('2 procedures');
    });

    it('index page shows entity descriptions inline', async () => {
        const tmpDir = await generateFromSchema(`
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

        const indexContent = readDoc(tmpDir, 'index.md');
        expect(indexContent).toContain('[Activity](./models/Activity.md)');
        expect(indexContent).toContain('Tracks system events');
        expect(indexContent).toContain('[User](./models/User.md)');
        expect(indexContent).toContain('A registered user in the platform');
        expect(indexContent).toContain('Roles available in the system');
        expect(indexContent).toContain('Common timestamp fields');
    });

    it('index page handles entities without descriptions', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id String @id @default(cuid())
            }
            /// Has a description.
            model Post {
                id String @id @default(cuid())
            }
        `);

        const indexContent = readDoc(tmpDir, 'index.md');
        expect(indexContent).toContain('[Post](./models/Post.md)');
        expect(indexContent).toContain('Has a description');
        expect(indexContent).toContain('[User](./models/User.md)');
    });

    it('model pages include prev/next navigation footer', async () => {
        const tmpDir = await generateFromSchema(`
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

        const activityDoc = readDoc(tmpDir, 'models', 'Activity.md');
        expect(activityDoc).toContain('Next: [Post](./Post.md)');
        expect(activityDoc).not.toContain('Previous:');

        const postDoc = readDoc(tmpDir, 'models', 'Post.md');
        expect(postDoc).toContain('Previous: [Activity](./Activity.md)');
        expect(postDoc).toContain('Next: [User](./User.md)');

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('Previous: [Post](./Post.md)');
        expect(userDoc).not.toContain('Next:');
    });

    it('enum pages include prev/next navigation footer', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id String @id @default(cuid())
            }
            enum Alpha { A B }
            enum Beta { X Y }
            enum Gamma { P Q }
        `);

        const alphaDoc = readDoc(tmpDir, 'enums', 'Alpha.md');
        expect(alphaDoc).toContain('Next: [Beta](./Beta.md)');

        const betaDoc = readDoc(tmpDir, 'enums', 'Beta.md');
        expect(betaDoc).toContain('Previous: [Alpha](./Alpha.md)');
        expect(betaDoc).toContain('Next: [Gamma](./Gamma.md)');
    });

    it('model field rows include anchor IDs', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id    String @id @default(cuid())
                email String @unique
                name  String?
            }
        `);

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('<a id="field-id"></a>');
        expect(userDoc).toContain('<a id="field-email"></a>');
        expect(userDoc).toContain('<a id="field-name"></a>');
    });

    it('type field rows include anchor IDs', async () => {
        const tmpDir = await generateFromSchema(`
            type Timestamps {
                createdAt DateTime @default(now())
                updatedAt DateTime @updatedAt
            }
            model User {
                id String @id @default(cuid())
            }
        `);

        const typeDoc = readDoc(tmpDir, 'types', 'Timestamps.md');
        expect(typeDoc).toContain('<a id="field-createdAt"></a>');
        expect(typeDoc).toContain('<a id="field-updatedAt"></a>');
    });

    it('view field rows include anchor IDs', async () => {
        const tmpDir = await generateFromSchema(`
            view UserProfile {
                id    String
                email String
            }
        `);

        const viewDoc = readDoc(tmpDir, 'views', 'UserProfile.md');
        expect(viewDoc).toContain('<a id="field-id"></a>');
        expect(viewDoc).toContain('<a id="field-email"></a>');
    });

    it('enum Used By deep-links to specific field anchors on model pages', async () => {
        const tmpDir = await generateFromSchema(`
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

        const roleDoc = readDoc(tmpDir, 'enums', 'Role.md');
        expect(roleDoc).toContain('## Used By');
        // Each field should deep-link to the field anchor on the model page
        expect(roleDoc).toContain('../models/Post.md#field-status');
        expect(roleDoc).toContain('../models/User.md#field-role');
    });

    it('type Used By deep-links to specific field anchors on model pages', async () => {
        const tmpDir = await generateFromSchema(`
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
        `);

        const typeDoc = readDoc(tmpDir, 'types', 'Timestamps.md');
        expect(typeDoc).toContain('## Used By');
        // Deep-link to inherited fields on model pages
        expect(typeDoc).toContain('../models/Post.md#field-createdAt');
        expect(typeDoc).toContain('../models/User.md#field-createdAt');
    });

    it('deprecated model renders with strikethrough and badge on page heading', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id String @id @default(cuid())
                @@meta('doc:deprecated', 'Use Account instead')
            }
        `);

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('# ~~User~~ <kbd>Model</kbd> <kbd>Deprecated</kbd>');
    });

    it('deprecated model renders with strikethrough on index page', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id String @id @default(cuid())
                @@meta('doc:deprecated', 'Use Account instead')
            }
            model Account {
                id String @id @default(cuid())
            }
        `);

        const indexContent = readDoc(tmpDir, 'index.md');
        expect(indexContent).toContain('~~[User]');
        expect(indexContent).toContain('Use Account instead');
        expect(indexContent).not.toMatch(/~~\[Account\]/);
    });

    it('deprecated view renders with strikethrough and badge', async () => {
        const tmpDir = await generateFromSchema(`
            view OldReport {
                id    String
                total Int
                @@meta('doc:deprecated', 'Use ReportV2 instead')
            }
        `);

        const viewDoc = readDoc(tmpDir, 'views', 'OldReport.md');
        expect(viewDoc).toContain('# ~~OldReport~~ <kbd>View</kbd> <kbd>Deprecated</kbd>');
    });

    it('snapshot: full representative schema output', async () => {
        const tmpDir = await generateFromSchema(`
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

        const indexContent = readDoc(tmpDir, 'index.md');
        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        const postDoc = readDoc(tmpDir, 'models', 'Post.md');
        const roleDoc = readDoc(tmpDir, 'enums', 'Role.md');
        const relDoc = readDoc(tmpDir, 'relationships.md');

        expect(indexContent).toMatchSnapshot('index.md');
        expect(userDoc).toMatchSnapshot('models/User.md');
        expect(postDoc).toMatchSnapshot('models/Post.md');
        expect(roleDoc).toMatchSnapshot('enums/Role.md');
        expect(relDoc).toMatchSnapshot('relationships.md');
    });
});
