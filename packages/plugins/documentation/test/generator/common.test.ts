import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { findFieldLine, generateFromSchema, readDoc } from '../utils';

describe('documentation plugin: common features', () => {
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
        expect(indexContent).toMatch(/Generated.*\d{4}-\d{2}-\d{2}/);

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('schema.zmodel');
        expect(userDoc).toMatch(/Generated.*\d{4}-\d{2}-\d{2}/);
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
        expect(userDoc).not.toContain('## \u{1F517} Relationships');
        expect(userDoc).not.toContain('## \u{1F510} Access Policies');
        expect(userDoc).not.toContain('## \u2705 Validation Rules');
        expect(userDoc).not.toContain('## \u{1F4C7} Indexes');

        expect(fs.existsSync(path.join(tmpDir, 'relationships.md'))).toBe(false);
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

    it('references section links to correct ZenStack documentation URLs', async () => {
        const tmpDir = await generateFromSchema(`
            enum Role { ADMIN USER }
            type Timestamps {
                createdAt DateTime @default(now())
            }
            view UserSummary {
                id Int
            }
            model User with Timestamps {
                id   String @id @default(cuid())
                role Role
            }
        `);

        const modelDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(modelDoc).toContain('https://zenstack.dev/docs/reference/zmodel/model');
        expect(modelDoc).not.toContain('/data-model');

        const enumDoc = readDoc(tmpDir, 'enums', 'Role.md');
        expect(enumDoc).toContain('https://zenstack.dev/docs/reference/zmodel/enum');

        const typeDoc = readDoc(tmpDir, 'types', 'Timestamps.md');
        expect(typeDoc).toContain('https://zenstack.dev/docs/reference/zmodel/type');

        const viewDoc = readDoc(tmpDir, 'views', 'UserSummary.md');
        expect(viewDoc).toContain('https://zenstack.dev/docs/reference/zmodel/view');
    });
});
