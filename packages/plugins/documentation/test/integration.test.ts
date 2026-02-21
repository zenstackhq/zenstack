import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import plugin from '../src/index';
import { findBrokenLinks, loadSchemaFromFile } from './utils';

const SAMPLES_DIR = path.resolve(__dirname, '../../../../samples');
const E2E_SCHEMAS_DIR = path.resolve(__dirname, '../../../../tests/e2e/orm/schemas');

function readDoc(tmpDir: string, ...segments: string[]): string {
    return fs.readFileSync(path.join(tmpDir, ...segments), 'utf-8');
}

async function generateDocs(
    schemaFile: string,
    pluginOptions: Record<string, unknown> = {},
): Promise<string> {
    const model = await loadSchemaFromFile(schemaFile);
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-int-'));
    await plugin.generate({
        schemaFile,
        model,
        defaultOutputPath: tmpDir,
        pluginOptions: { output: tmpDir, ...pluginOptions },
    });
    return tmpDir;
}

describe('integration: samples/shared schema', () => {
    it('generates complete docs from real User/Post schema', async () => {
        const tmpDir = await generateDocs(path.join(SAMPLES_DIR, 'shared', 'schema.zmodel'));

        expect(fs.existsSync(path.join(tmpDir, 'index.md'))).toBe(true);
        expect(fs.existsSync(path.join(tmpDir, 'models', 'User.md'))).toBe(true);
        expect(fs.existsSync(path.join(tmpDir, 'models', 'Post.md'))).toBe(true);
        expect(fs.existsSync(path.join(tmpDir, 'relationships.md'))).toBe(true);

        const indexContent = readDoc(tmpDir, 'index.md');
        expect(indexContent).toContain('[User](./models/User.md)');
        expect(indexContent).toContain('[Post](./models/Post.md)');
        expect(indexContent).toContain('[Relationships](./relationships.md)');

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('# User');
        expect(userDoc).toContain('User model');
        expect(userDoc).toContain('## Fields');
        expect(userDoc).toContain('| email');
        expect(userDoc).toContain('| posts');
        expect(userDoc).toContain('## Relationships');
        expect(userDoc).toContain('[Post](./Post.md)');

        const postDoc = readDoc(tmpDir, 'models', 'Post.md');
        expect(postDoc).toContain('# Post');
        expect(postDoc).toContain('Post model');
        expect(postDoc).toContain('[User](./User.md)');
    });

    it('has zero broken links', async () => {
        const tmpDir = await generateDocs(path.join(SAMPLES_DIR, 'shared', 'schema.zmodel'));
        expect(findBrokenLinks(tmpDir)).toEqual([]);
    });
});

describe('integration: samples/orm schema', () => {
    it('renders enums, computed fields, policies, and relationships', async () => {
        const tmpDir = await generateDocs(
            path.join(SAMPLES_DIR, 'orm', 'zenstack', 'schema.zmodel'),
        );

        expect(fs.existsSync(path.join(tmpDir, 'enums', 'Role.md'))).toBe(true);

        const roleDoc = readDoc(tmpDir, 'enums', 'Role.md');
        expect(roleDoc).toContain('# Role');
        expect(roleDoc).toContain('User roles');
        expect(roleDoc).toContain('| ADMIN');
        expect(roleDoc).toContain('| USER');
        expect(roleDoc).toContain('## Used By');
        expect(roleDoc).toContain('[User](../models/User.md)');

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('# User');
        expect(userDoc).toContain('User model');
        expect(userDoc).toContain('[Role](../enums/Role.md)');

        const postCountLine = userDoc.split('\n').find((l) => l.includes('| postCount'));
        expect(postCountLine).toBeDefined();
        expect(postCountLine).toContain('**Computed**');

        expect(userDoc).toContain('## Access Policies');
        expect(userDoc).toContain('Allow');

        expect(userDoc).toContain('## Relationships');
        expect(userDoc).toContain('[Post](./Post.md)');
        expect(userDoc).toContain('[Profile](./Profile.md)');
    });

    it('has zero broken links', async () => {
        const tmpDir = await generateDocs(
            path.join(SAMPLES_DIR, 'orm', 'zenstack', 'schema.zmodel'),
        );
        expect(findBrokenLinks(tmpDir)).toEqual([]);
    });
});

describe('integration: e2e basic schema', () => {
    it('excludes @@ignore models and documents the rest', async () => {
        const tmpDir = await generateDocs(
            path.join(E2E_SCHEMAS_DIR, 'basic', 'schema.zmodel'),
        );

        const indexContent = readDoc(tmpDir, 'index.md');
        expect(indexContent).not.toContain('[Foo]');
        expect(fs.existsSync(path.join(tmpDir, 'models', 'Foo.md'))).toBe(false);

        expect(indexContent).toContain('[User]');
        expect(indexContent).toContain('[Post]');
        expect(indexContent).toContain('[Comment]');
        expect(indexContent).toContain('[Profile]');
        expect(indexContent).toContain('[Plain]');

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('## Access Policies');
        expect(userDoc).toContain('## Relationships');
        expect(userDoc).toContain('[Post](./Post.md)');
        expect(userDoc).toContain('[Profile](./Profile.md)');

        const postDoc = readDoc(tmpDir, 'models', 'Post.md');
        expect(postDoc).toContain('[Comment](./Comment.md)');
        expect(postDoc).toContain('[User](./User.md)');
    });

    it('has zero broken links', async () => {
        const tmpDir = await generateDocs(
            path.join(E2E_SCHEMAS_DIR, 'basic', 'schema.zmodel'),
        );
        expect(findBrokenLinks(tmpDir)).toEqual([]);
    });
});

describe('integration: e2e todo schema', () => {
    it('renders validation rules and complex policies', async () => {
        const tmpDir = await generateDocs(
            path.join(E2E_SCHEMAS_DIR, 'todo', 'schema.zmodel'),
        );

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('## Validation Rules');
        expect(userDoc).toContain('`@email`');
        expect(userDoc).toContain('`@url`');

        const spaceDoc = readDoc(tmpDir, 'models', 'Space.md');
        expect(spaceDoc).toContain('## Validation Rules');
        expect(spaceDoc).toContain('`@length`');
        expect(spaceDoc).toContain('## Access Policies');
        expect(spaceDoc).toContain('Allow');
        expect(spaceDoc).toContain('Deny');
        expect(spaceDoc).toContain('## Relationships');

        const listDoc = readDoc(tmpDir, 'models', 'List.md');
        expect(listDoc).toContain('## Validation Rules');
        expect(listDoc).toContain('`@length`');

        expect(fs.existsSync(path.join(tmpDir, 'relationships.md'))).toBe(true);
        const relDoc = readDoc(tmpDir, 'relationships.md');
        expect(relDoc).toContain('erDiagram');
    });

    it('has zero broken links', async () => {
        const tmpDir = await generateDocs(
            path.join(E2E_SCHEMAS_DIR, 'todo', 'schema.zmodel'),
        );
        expect(findBrokenLinks(tmpDir)).toEqual([]);
    });
});
