import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { findBrokenLinks, generateFromFile, readDoc } from '../utils';

const E2E_SCHEMAS_DIR = path.resolve(__dirname, '../../../../../tests/e2e/orm/schemas');

describe('integration: e2e basic schema', () => {
    let tmpDir: string;

    beforeAll(async () => {
        tmpDir = await generateFromFile(
            path.join(E2E_SCHEMAS_DIR, 'basic', 'schema.zmodel'),
        );
    });

    it('excludes @@ignore models and documents the rest', () => {
        const indexContent = readDoc(tmpDir, 'index.md');
        expect(indexContent).not.toContain('[Foo]');
        expect(fs.existsSync(path.join(tmpDir, 'models', 'Foo.md'))).toBe(false);

        expect(indexContent).toContain('[User]');
        expect(indexContent).toContain('[Post]');
        expect(indexContent).toContain('[Comment]');
        expect(indexContent).toContain('[Profile]');
        expect(indexContent).toContain('[Plain]');

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('Access Policies');
        expect(userDoc).toContain('Relationships');
        expect(userDoc).toContain('[Post](./Post.md)');
        expect(userDoc).toContain('[Profile](./Profile.md)');

        const postDoc = readDoc(tmpDir, 'models', 'Post.md');
        expect(postDoc).toContain('[Comment](./Comment.md)');
        expect(postDoc).toContain('[User](./User.md)');
    });

    it('has zero broken links', () => {
        expect(findBrokenLinks(tmpDir)).toEqual([]);
    });
});

describe('integration: e2e procedures schema', () => {
    let tmpDir: string;

    beforeAll(async () => {
        tmpDir = await generateFromFile(
            path.join(E2E_SCHEMAS_DIR, 'procedures', 'schema.zmodel'),
        );
    });

    it('generates procedure pages from real procedures schema', () => {
        const index = readDoc(tmpDir, 'index.md');
        expect(index).toContain('Procedures');
        expect(index).toContain('[getUser]');
        expect(index).toContain('[signUp]');
        expect(index).toContain('[setAdmin]');
        expect(index).toContain('[listUsers]');
        expect(index).toContain('[getOverview]');
        expect(index).toContain('[createMultiple]');

        const signUpDoc = readDoc(tmpDir, 'procedures', 'signUp.md');
        expect(signUpDoc).toContain('<kbd>Mutation</kbd>');
        expect(signUpDoc).toContain('[User](../models/User.md)');
        expect(signUpDoc).toContain('[Role](../enums/Role.md)');

        const setAdminDoc = readDoc(tmpDir, 'procedures', 'setAdmin.md');
        expect(setAdminDoc).toContain('`Void`');

        const overviewDoc = readDoc(tmpDir, 'procedures', 'getOverview.md');
        expect(overviewDoc).toContain('[Overview](../types/Overview.md)');
    });

    it('has zero broken links', () => {
        expect(findBrokenLinks(tmpDir)).toEqual([]);
    });
});

describe('integration: e2e todo schema', () => {
    let tmpDir: string;

    beforeAll(async () => {
        tmpDir = await generateFromFile(
            path.join(E2E_SCHEMAS_DIR, 'todo', 'schema.zmodel'),
        );
    });

    it('renders validation rules and complex policies', () => {
        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('Validation Rules');
        expect(userDoc).toContain('`@email`');
        expect(userDoc).toContain('`@url`');

        const spaceDoc = readDoc(tmpDir, 'models', 'Space.md');
        expect(spaceDoc).toContain('Validation Rules');
        expect(spaceDoc).toContain('`@length`');
        expect(spaceDoc).toContain('Access Policies');
        expect(spaceDoc).toContain('Allow');
        expect(spaceDoc).toContain('Deny');
        expect(spaceDoc).toContain('Relationships');

        const listDoc = readDoc(tmpDir, 'models', 'List.md');
        expect(listDoc).toContain('Validation Rules');
        expect(listDoc).toContain('`@length`');

        expect(fs.existsSync(path.join(tmpDir, 'relationships.md'))).toBe(true);
        const relDoc = readDoc(tmpDir, 'relationships.md');
        expect(relDoc).toContain('erDiagram');
    });

    it('has zero broken links', () => {
        expect(findBrokenLinks(tmpDir)).toEqual([]);
    });
});
