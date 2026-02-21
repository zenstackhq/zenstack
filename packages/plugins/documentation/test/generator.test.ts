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
});
