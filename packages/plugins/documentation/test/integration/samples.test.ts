import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { findBrokenLinks, generateFromFile, readDoc } from '../utils';

const SAMPLES_DIR = path.resolve(__dirname, '../../../../../samples');

describe('integration: samples/shared schema', () => {
    it('generates complete docs from real User/Post schema', async () => {
        const tmpDir = await generateFromFile(path.join(SAMPLES_DIR, 'shared', 'schema.zmodel'));

        expect(fs.existsSync(path.join(tmpDir, 'index.md'))).toBe(true);
        expect(fs.existsSync(path.join(tmpDir, 'models', 'User.md'))).toBe(true);
        expect(fs.existsSync(path.join(tmpDir, 'models', 'Post.md'))).toBe(true);
        expect(fs.existsSync(path.join(tmpDir, 'relationships.md'))).toBe(true);

        const indexContent = readDoc(tmpDir, 'index.md');
        expect(indexContent).toContain('[User](./models/User.md)');
        expect(indexContent).toContain('[Post](./models/Post.md)');
        expect(indexContent).toContain('[Relationships](./relationships.md)');

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('# 🗃️ User');
        expect(userDoc).toContain('User model');
        expect(userDoc).toContain('Fields');
        expect(userDoc).toContain('field-email');
        expect(userDoc).toContain('field-posts');
        expect(userDoc).toContain('Relationships');
        expect(userDoc).toContain('[Post](./Post.md)');

        const postDoc = readDoc(tmpDir, 'models', 'Post.md');
        expect(postDoc).toContain('# 🗃️ Post');
        expect(postDoc).toContain('Post model');
        expect(postDoc).toContain('[User](./User.md)');
    });

    it('has zero broken links', async () => {
        const tmpDir = await generateFromFile(path.join(SAMPLES_DIR, 'shared', 'schema.zmodel'));
        expect(findBrokenLinks(tmpDir)).toEqual([]);
    });
});

describe('integration: samples/orm schema', () => {
    it('renders enums, computed fields, policies, and relationships', async () => {
        const tmpDir = await generateFromFile(
            path.join(SAMPLES_DIR, 'orm', 'zenstack', 'schema.zmodel'),
        );

        expect(fs.existsSync(path.join(tmpDir, 'enums', 'Role.md'))).toBe(true);

        const roleDoc = readDoc(tmpDir, 'enums', 'Role.md');
        expect(roleDoc).toContain('# Role');
        expect(roleDoc).toContain('User roles');
        expect(roleDoc).toContain('| `ADMIN`');
        expect(roleDoc).toContain('| `USER`');
        expect(roleDoc).toContain('Used By');
        expect(roleDoc).toContain('[User](../models/User.md)');

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('# 🗃️ User');
        expect(userDoc).toContain('User model');
        expect(userDoc).toContain('[Role](../enums/Role.md)');

        const postCountLine = userDoc.split('\n').find((l) => l.includes('field-postCount'));
        expect(postCountLine).toBeDefined();
        expect(postCountLine).toContain('<kbd>computed</kbd>');

        expect(userDoc).toContain('Access Policies');
        expect(userDoc).toContain('Allow');

        expect(userDoc).toContain('Relationships');
        expect(userDoc).toContain('[Post](./Post.md)');
        expect(userDoc).toContain('[Profile](./Profile.md)');
    });

    it('has zero broken links', async () => {
        const tmpDir = await generateFromFile(
            path.join(SAMPLES_DIR, 'orm', 'zenstack', 'schema.zmodel'),
        );
        expect(findBrokenLinks(tmpDir)).toEqual([]);
    });
});
