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
});
