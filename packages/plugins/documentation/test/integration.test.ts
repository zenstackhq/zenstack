import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import plugin from '../src/index';
import { findBrokenLinks, loadSchemaFromFile } from './utils';

const SAMPLES_DIR = path.resolve(__dirname, '../../../../samples');
const E2E_SCHEMAS_DIR = path.resolve(__dirname, '../../../../tests/e2e/orm/schemas');
const SHOWCASE_SCHEMA = path.resolve(__dirname, '../zenstack/showcase.zmodel');
const MULTIFILE_SCHEMA = path.resolve(__dirname, '../zenstack/multifile/schema.zmodel');

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

describe('integration: showcase schema', () => {
    it('generates expected file structure with correct model and enum counts', async () => {
        const tmpDir = await generateDocs(SHOWCASE_SCHEMA);

        expect(fs.existsSync(path.join(tmpDir, 'index.md'))).toBe(true);
        expect(fs.existsSync(path.join(tmpDir, 'relationships.md'))).toBe(true);

        const expectedModels = [
            'Activity', 'Comment', 'Organization', 'Project',
            'Tag', 'Task', 'Team', 'TeamMember', 'User',
        ];
        for (const name of expectedModels) {
            expect(fs.existsSync(path.join(tmpDir, 'models', `${name}.md`))).toBe(true);
        }

        const expectedEnums = ['Priority', 'Role', 'TaskStatus'];
        for (const name of expectedEnums) {
            expect(fs.existsSync(path.join(tmpDir, 'enums', `${name}.md`))).toBe(true);
        }

        expect(fs.existsSync(path.join(tmpDir, 'types', 'Timestamps.md'))).toBe(true);

        expect(fs.existsSync(path.join(tmpDir, 'models', 'JobRun.md'))).toBe(false);
        expect(fs.existsSync(path.join(tmpDir, 'models', 'ApiToken.md'))).toBe(false);
    });

    it('has zero broken links across all generated files', async () => {
        const tmpDir = await generateDocs(SHOWCASE_SCHEMA);
        const broken = findBrokenLinks(tmpDir);
        expect(broken).toEqual([]);
    });

    it('type pages render with fields, Used By, and cross-links to models', async () => {
        const tmpDir = await generateDocs(SHOWCASE_SCHEMA);

        const tsDoc = readDoc(tmpDir, 'types', 'Timestamps.md');
        expect(tsDoc).toContain('# Timestamps');
        expect(tsDoc).toContain('[Index](../index.md)');
        expect(tsDoc).toContain('## Fields');
        expect(tsDoc).toContain('| createdAt');
        expect(tsDoc).toContain('| updatedAt');
        expect(tsDoc).toContain('## Used By');
        expect(tsDoc).toContain('[Organization](../models/Organization.md)');
        expect(tsDoc).toContain('[User](../models/User.md)');

        const index = readDoc(tmpDir, 'index.md');
        expect(index).toContain('## Types');
        expect(index).toContain('[Timestamps](./types/Timestamps.md)');

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('## Mixins');
        expect(userDoc).toContain('[Timestamps](../types/Timestamps.md)');

        const createdAtLine = userDoc.split('\n').find((l) => l.includes('| createdAt'));
        expect(createdAtLine).toContain('[Timestamps](../types/Timestamps.md)');
    });

    it('index page lists all visible models, enums, and relationships link', async () => {
        const tmpDir = await generateDocs(SHOWCASE_SCHEMA);
        const index = readDoc(tmpDir, 'index.md');

        expect(index).not.toContain('JobRun');
        expect(index).not.toContain('ApiToken');

        for (const name of ['Activity', 'Comment', 'Organization', 'Project', 'Tag', 'Task', 'Team', 'TeamMember', 'User']) {
            expect(index).toContain(`[${name}]`);
        }
        for (const name of ['Priority', 'Role', 'TaskStatus']) {
            expect(index).toContain(`[${name}](./enums/${name}.md)`);
        }
        expect(index).toContain('[Relationships](./relationships.md)');
    });

    it('renders computed fields, enum type links, policies, validation, and indexes', async () => {
        const tmpDir = await generateDocs(SHOWCASE_SCHEMA);

        const userDoc = readDoc(tmpDir, 'models', 'User.md');

        const taskCountLine = userDoc.split('\n').find((l) => l.includes('| taskCount'));
        expect(taskCountLine).toContain('**Computed**');

        expect(userDoc).toContain('[Role](../enums/Role.md)');

        expect(userDoc).toContain('## Access Policies');
        expect(userDoc).toContain('Allow');
        expect(userDoc).toContain('Deny');

        expect(userDoc).toContain('## Indexes');

        const orgDoc = readDoc(tmpDir, 'models', 'Organization.md');
        expect(orgDoc).toContain('## Validation Rules');
        expect(orgDoc).toContain('`@length`');
        expect(orgDoc).toContain('`@email`');
        expect(orgDoc).toContain('## Indexes');
    });

    it('renders @@meta category, since, and deprecated annotations', async () => {
        const tmpDir = await generateDocs(SHOWCASE_SCHEMA);

        const orgDoc = readDoc(tmpDir, 'models', 'Organization.md');
        expect(orgDoc).toContain('| **Category** | Core |');
        expect(orgDoc).toContain('| **Since** | 1.0 |');

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('| **Category** | Identity |');

        const activityDoc = readDoc(tmpDir, 'models', 'Activity.md');
        expect(activityDoc).toContain('| **Category** | Audit |');
        expect(activityDoc).toContain('| **Since** | 2.0 |');
    });

    it('renders self-referential relations and @meta doc:example values', async () => {
        const tmpDir = await generateDocs(SHOWCASE_SCHEMA);

        const taskDoc = readDoc(tmpDir, 'models', 'Task.md');
        expect(taskDoc).toContain('## Relationships');
        expect(taskDoc).toContain('[Task](./Task.md)');

        const titleLine = taskDoc.split('\n').find((l) => l.includes('| title'));
        expect(titleLine).toContain('Fix login redirect bug');

        const orgDoc = readDoc(tmpDir, 'models', 'Organization.md');
        const slugLine = orgDoc.split('\n').find((l) => l.includes('| slug'));
        expect(slugLine).toContain('acme-corp');

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        const emailLine = userDoc.split('\n').find((l) => l.includes('| email'));
        expect(emailLine).toContain('jane@acme.com');
    });

    it('enum pages show descriptions and Used By with correct links', async () => {
        const tmpDir = await generateDocs(SHOWCASE_SCHEMA);

        const roleDoc = readDoc(tmpDir, 'enums', 'Role.md');
        expect(roleDoc).toContain('Defines the access level');
        expect(roleDoc).toContain('Full administrative access');
        expect(roleDoc).toContain('| OWNER');
        expect(roleDoc).toContain('| GUEST');
        expect(roleDoc).toContain('## Used By');
        expect(roleDoc).toContain('[User](../models/User.md)');
        expect(roleDoc).toContain('[TeamMember](../models/TeamMember.md)');

        const statusDoc = readDoc(tmpDir, 'enums', 'TaskStatus.md');
        expect(statusDoc).toContain('Lifecycle status');
        expect(statusDoc).toContain('Waiting to be started');
        expect(statusDoc).toContain('## Used By');
        expect(statusDoc).toContain('[Task](../models/Task.md)');

        const priorityDoc = readDoc(tmpDir, 'enums', 'Priority.md');
        expect(priorityDoc).toContain('Priority levels');
        expect(priorityDoc).toContain('| LOW');
        expect(priorityDoc).toContain('| CRITICAL');
    });

    it('relationships page has cross-reference and Mermaid diagram with links', async () => {
        const tmpDir = await generateDocs(SHOWCASE_SCHEMA);
        const relDoc = readDoc(tmpDir, 'relationships.md');

        expect(relDoc).toContain('[Index](./index.md)');
        expect(relDoc).toContain('## Cross-Reference');
        expect(relDoc).toContain('[Organization](./models/Organization.md)');
        expect(relDoc).toContain('[User](./models/User.md)');
        expect(relDoc).toContain('[Task](./models/Task.md)');

        expect(relDoc).toContain('## Entity Relationship Diagram');
        expect(relDoc).toContain('erDiagram');
    });

    it('models without descriptions still render correctly', async () => {
        const tmpDir = await generateDocs(SHOWCASE_SCHEMA);

        const tagDoc = readDoc(tmpDir, 'models', 'Tag.md');
        expect(tagDoc).toContain('# Tag');
        expect(tagDoc).toContain('## Fields');
        expect(tagDoc).toContain('| name');
        expect(tagDoc).toContain('[Index](../index.md)');
    });

    it('generates procedure pages for all declared procedures', async () => {
        const tmpDir = await generateDocs(SHOWCASE_SCHEMA);

        const expectedProcedures = [
            'signUp', 'getUser', 'listOrgUsers',
            'createAndAssignTask', 'getProjectStats',
            'bulkUpdateTaskStatus', 'archiveProject',
        ];

        for (const name of expectedProcedures) {
            expect(fs.existsSync(path.join(tmpDir, 'procedures', `${name}.md`))).toBe(true);
        }

        const index = readDoc(tmpDir, 'index.md');
        expect(index).toContain('## Procedures');
        for (const name of expectedProcedures) {
            expect(index).toContain(`[${name}](./procedures/${name}.md)`);
        }
        expect(index).toContain('7 procedures');
    });

    it('procedure pages have correct content for mutations and queries', async () => {
        const tmpDir = await generateDocs(SHOWCASE_SCHEMA);

        const signUpDoc = readDoc(tmpDir, 'procedures', 'signUp.md');
        expect(signUpDoc).toContain('# signUp');
        expect(signUpDoc).toContain('<kbd>Mutation</kbd>');
        expect(signUpDoc).toContain('Register a new user');
        expect(signUpDoc).toContain('## Parameters');
        expect(signUpDoc).toContain('| email');
        expect(signUpDoc).toContain('| name');
        expect(signUpDoc).toContain('| role');
        expect(signUpDoc).toContain('## Returns');
        expect(signUpDoc).toContain('[User](../models/User.md)');

        const getUserDoc = readDoc(tmpDir, 'procedures', 'getUser.md');
        expect(getUserDoc).toContain('# getUser');
        expect(getUserDoc).toContain('<kbd>Query</kbd>');
        expect(getUserDoc).toContain('## Returns');
        expect(getUserDoc).toContain('[User](../models/User.md)');

        const bulkDoc = readDoc(tmpDir, 'procedures', 'bulkUpdateTaskStatus.md');
        expect(bulkDoc).toContain('<kbd>Mutation</kbd>');
        expect(bulkDoc).toContain('| taskIds');
        expect(bulkDoc).toContain('| status');
        expect(bulkDoc).toContain('`Void`');

        const statsDoc = readDoc(tmpDir, 'procedures', 'getProjectStats.md');
        expect(statsDoc).toContain('<kbd>Query</kbd>');
        expect(statsDoc).toContain('[ProjectStats](../types/ProjectStats.md)');
    });

    it('procedure pages link to return types and param types correctly', async () => {
        const tmpDir = await generateDocs(SHOWCASE_SCHEMA);

        const signUpDoc = readDoc(tmpDir, 'procedures', 'signUp.md');
        expect(signUpDoc).toContain('[Role](../enums/Role.md)');
        expect(signUpDoc).toContain('[User](../models/User.md)');

        const createDoc = readDoc(tmpDir, 'procedures', 'createAndAssignTask.md');
        expect(createDoc).toContain('[Priority](../enums/Priority.md)');
        expect(createDoc).toContain('[Task](../models/Task.md)');
    });

    it('model pages show Used in Procedures backlinks', async () => {
        const tmpDir = await generateDocs(SHOWCASE_SCHEMA);

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('## Used in Procedures');
        expect(userDoc).toContain('[signUp](../procedures/signUp.md)');
        expect(userDoc).toContain('[getUser](../procedures/getUser.md)');
        expect(userDoc).toContain('[listOrgUsers](../procedures/listOrgUsers.md)');

        const taskDoc = readDoc(tmpDir, 'models', 'Task.md');
        expect(taskDoc).toContain('## Used in Procedures');
        expect(taskDoc).toContain('[createAndAssignTask](../procedures/createAndAssignTask.md)');
    });

    it('procedure pages have collapsible declarations and source paths', async () => {
        const tmpDir = await generateDocs(SHOWCASE_SCHEMA);

        const signUpDoc = readDoc(tmpDir, 'procedures', 'signUp.md');
        expect(signUpDoc).toContain('<summary>Declaration</summary>');
        expect(signUpDoc).toContain('mutation procedure signUp');
        expect(signUpDoc).toContain('| **Defined in** |');
        expect(signUpDoc).toContain('.zmodel');
    });

    it('has zero broken links including procedure pages', async () => {
        const tmpDir = await generateDocs(SHOWCASE_SCHEMA);
        const broken = findBrokenLinks(tmpDir);
        expect(broken).toEqual([]);
    });

    it('includeInternalModels=true includes @@ignore models in output', async () => {
        const tmpDir = await generateDocs(SHOWCASE_SCHEMA, { includeInternalModels: true });

        const index = readDoc(tmpDir, 'index.md');
        expect(index).toContain('[JobRun]');
        expect(index).toContain('[ApiToken]');
        expect(fs.existsSync(path.join(tmpDir, 'models', 'JobRun.md'))).toBe(true);
        expect(fs.existsSync(path.join(tmpDir, 'models', 'ApiToken.md'))).toBe(true);

        expect(findBrokenLinks(tmpDir)).toEqual([]);
    });
});

describe('integration: multi-file schema', () => {
    it('artifacts show correct source file paths for declarations across files', async () => {
        const tmpDir = await generateDocs(MULTIFILE_SCHEMA);

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('| **Defined in** |');
        expect(userDoc).toContain('models.zmodel');

        const roleDoc = readDoc(tmpDir, 'enums', 'Role.md');
        expect(roleDoc).toContain('| **Defined in** |');
        expect(roleDoc).toContain('enums.zmodel');

        const tsDoc = readDoc(tmpDir, 'types', 'Timestamps.md');
        expect(tsDoc).toContain('| **Defined in** |');
        expect(tsDoc).toContain('mixins.zmodel');
    });

    it('has zero broken links across multi-file output', async () => {
        const tmpDir = await generateDocs(MULTIFILE_SCHEMA);
        expect(findBrokenLinks(tmpDir)).toEqual([]);
    });

    it('declaration code blocks show correct source for each file', async () => {
        const tmpDir = await generateDocs(MULTIFILE_SCHEMA);

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('<summary>Declaration</summary>');
        expect(userDoc).toContain('model User');

        const roleDoc = readDoc(tmpDir, 'enums', 'Role.md');
        expect(roleDoc).toContain('<summary>Declaration</summary>');
        expect(roleDoc).toContain('enum Role');

        const tsDoc = readDoc(tmpDir, 'types', 'Timestamps.md');
        expect(tsDoc).toContain('<summary>Declaration</summary>');
        expect(tsDoc).toContain('type Timestamps');
    });
});

describe('integration: e2e procedures schema', () => {
    it('generates procedure pages from real procedures schema', async () => {
        const tmpDir = await generateDocs(
            path.join(E2E_SCHEMAS_DIR, 'procedures', 'schema.zmodel'),
        );

        const index = readDoc(tmpDir, 'index.md');
        expect(index).toContain('## Procedures');
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

    it('has zero broken links', async () => {
        const tmpDir = await generateDocs(
            path.join(E2E_SCHEMAS_DIR, 'procedures', 'schema.zmodel'),
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
