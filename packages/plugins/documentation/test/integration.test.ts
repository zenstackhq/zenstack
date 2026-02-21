import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { findBrokenLinks, generateFromFile, readDoc } from './utils';

const SAMPLES_DIR = path.resolve(__dirname, '../../../../samples');
const E2E_SCHEMAS_DIR = path.resolve(__dirname, '../../../../tests/e2e/orm/schemas');
const SHOWCASE_SCHEMA = path.resolve(__dirname, '../zenstack/showcase.zmodel');
const MULTIFILE_SCHEMA = path.resolve(__dirname, '../zenstack/multifile/schema.zmodel');

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
        expect(userDoc).toContain('# User');
        expect(userDoc).toContain('User model');
        expect(userDoc).toContain('## Fields');
        expect(userDoc).toContain('field-email');
        expect(userDoc).toContain('field-posts');
        expect(userDoc).toContain('## Relationships');
        expect(userDoc).toContain('[Post](./Post.md)');

        const postDoc = readDoc(tmpDir, 'models', 'Post.md');
        expect(postDoc).toContain('# Post');
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
        expect(roleDoc).toContain('| ADMIN');
        expect(roleDoc).toContain('| USER');
        expect(roleDoc).toContain('## Used By');
        expect(roleDoc).toContain('[User](../models/User.md)');

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('# User');
        expect(userDoc).toContain('User model');
        expect(userDoc).toContain('[Role](../enums/Role.md)');

        const postCountLine = userDoc.split('\n').find((l) => l.includes('field-postCount'));
        expect(postCountLine).toBeDefined();
        expect(postCountLine).toContain('<kbd>computed</kbd>');

        expect(userDoc).toContain('## Access Policies');
        expect(userDoc).toContain('Allow');

        expect(userDoc).toContain('## Relationships');
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

describe('integration: e2e basic schema', () => {
    it('excludes @@ignore models and documents the rest', async () => {
        const tmpDir = await generateFromFile(
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
        const tmpDir = await generateFromFile(
            path.join(E2E_SCHEMAS_DIR, 'basic', 'schema.zmodel'),
        );
        expect(findBrokenLinks(tmpDir)).toEqual([]);
    });
});

describe('integration: showcase schema', () => {
    it('generates expected file structure with correct model and enum counts', async () => {
        const tmpDir = await generateFromFile(SHOWCASE_SCHEMA);

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

        const expectedViews = ['UserProfile', 'ProjectTaskSummary', 'UserLeaderboard'];
        for (const name of expectedViews) {
            expect(fs.existsSync(path.join(tmpDir, 'views', `${name}.md`))).toBe(true);
        }
        // Views should NOT appear in models/
        for (const name of expectedViews) {
            expect(fs.existsSync(path.join(tmpDir, 'models', `${name}.md`))).toBe(false);
        }

        expect(fs.existsSync(path.join(tmpDir, 'models', 'JobRun.md'))).toBe(false);
        expect(fs.existsSync(path.join(tmpDir, 'models', 'ApiToken.md'))).toBe(false);
    });

    it('has zero broken links across all generated files', async () => {
        const tmpDir = await generateFromFile(SHOWCASE_SCHEMA);
        const broken = findBrokenLinks(tmpDir);
        expect(broken).toEqual([]);
    });

    it('type pages render with fields, Used By, and cross-links to models', async () => {
        const tmpDir = await generateFromFile(SHOWCASE_SCHEMA);

        const tsDoc = readDoc(tmpDir, 'types', 'Timestamps.md');
        expect(tsDoc).toContain('# Timestamps');
        expect(tsDoc).toContain('[Index](../index.md)');
        expect(tsDoc).toContain('## Fields');
        expect(tsDoc).toContain('field-createdAt');
        expect(tsDoc).toContain('field-updatedAt');
        expect(tsDoc).toContain('## Used By');
        expect(tsDoc).toContain('[Organization](../models/Organization.md');
        expect(tsDoc).toContain('[User](../models/User.md');

        const index = readDoc(tmpDir, 'index.md');
        expect(index).toContain('## Types');
        expect(index).toContain('[Timestamps](./types/Timestamps.md)');

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('## Mixins');
        expect(userDoc).toContain('[Timestamps](../types/Timestamps.md)');

        const createdAtLine = userDoc.split('\n').find((l) => l.includes('field-createdAt'));
        expect(createdAtLine).toContain('[Timestamps](../types/Timestamps.md)');
    });

    it('index page lists all visible models, enums, and relationships link', async () => {
        const tmpDir = await generateFromFile(SHOWCASE_SCHEMA);
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
        const tmpDir = await generateFromFile(SHOWCASE_SCHEMA);

        const userDoc = readDoc(tmpDir, 'models', 'User.md');

        const taskCountLine = userDoc.split('\n').find((l) => l.includes('field-taskCount'));
        expect(taskCountLine).toContain('<kbd>computed</kbd>');

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

    it('renders diverse computed fields across multiple models', async () => {
        const tmpDir = await generateFromFile(SHOWCASE_SCHEMA);

        const projectDoc = readDoc(tmpDir, 'models', 'Project.md');
        const projectLines = projectDoc.split('\n');

        const taskCountLine = projectLines.find((l) => l.includes('field-taskCount'));
        expect(taskCountLine).toBeDefined();
        expect(taskCountLine).toContain('`Int` <kbd>computed</kbd>');
        expect(taskCountLine).toContain('Total number of tasks');

        const completionLine = projectLines.find((l) => l.includes('field-completionRate'));
        expect(completionLine).toBeDefined();
        expect(completionLine).toContain('`Float` <kbd>computed</kbd>');
        expect(completionLine).toContain('Percentage of completed tasks');

        const overdueLine = projectLines.find((l) => l.includes('field-hasOverdueTasks'));
        expect(overdueLine).toBeDefined();
        expect(overdueLine).toContain('`Boolean` <kbd>computed</kbd>');

        const taskDoc = readDoc(tmpDir, 'models', 'Task.md');
        const taskLines = taskDoc.split('\n');

        const commentCountLine = taskLines.find((l) => l.includes('field-commentCount'));
        expect(commentCountLine).toBeDefined();
        expect(commentCountLine).toContain('`Int` <kbd>computed</kbd>');
        expect(commentCountLine).toContain('Number of comments');

        const orgDoc = readDoc(tmpDir, 'models', 'Organization.md');
        const orgLines = orgDoc.split('\n');

        const memberCountLine = orgLines.find((l) => l.includes('field-memberCount'));
        expect(memberCountLine).toBeDefined();
        expect(memberCountLine).toContain('`Int` <kbd>computed</kbd>');
    });

    it('generates view pages in views/ directory with correct content', async () => {
        const tmpDir = await generateFromFile(SHOWCASE_SCHEMA);

        // Views appear on index
        const index = readDoc(tmpDir, 'index.md');
        expect(index).toContain('## Views');
        expect(index).toContain('[UserProfile](./views/UserProfile.md)');
        expect(index).toContain('[ProjectTaskSummary](./views/ProjectTaskSummary.md)');
        expect(index).toContain('[UserLeaderboard](./views/UserLeaderboard.md)');
        expect(index).toContain('3 views');

        // Views do NOT appear under Models
        const modelsSection = index.split('## Views')[0];
        expect(modelsSection).not.toContain('UserProfile');

        // View page structure
        const profileDoc = readDoc(tmpDir, 'views', 'UserProfile.md');
        expect(profileDoc).toContain('<kbd>View</kbd>');
        expect(profileDoc).not.toContain('<kbd>Model</kbd>');
        expect(profileDoc).toContain('[Views](../index.md#views)');
        expect(profileDoc).toContain('Flattened user profile for reporting');
        expect(profileDoc).toContain('## Fields');
        expect(profileDoc).toContain('field-name');
        expect(profileDoc).toContain('field-email');
        expect(profileDoc).toContain('field-organizationName');
        expect(profileDoc).toContain('field-teamCount');
        expect(profileDoc).toContain('<summary>Declaration');
        expect(profileDoc).toContain('view UserProfile');

        // Descriptions on view fields
        expect(profileDoc).toContain('Full name of the user');
        expect(profileDoc).toContain('Email address of the user');

        // Another view
        const summaryDoc = readDoc(tmpDir, 'views', 'ProjectTaskSummary.md');
        expect(summaryDoc).toContain('Aggregated task metrics');
        expect(summaryDoc).toContain('field-avgDaysToClose');
        expect(summaryDoc).toContain('`Float`');
    });

    it('renders @@meta category, since, and deprecated annotations', async () => {
        const tmpDir = await generateFromFile(SHOWCASE_SCHEMA);

        const orgDoc = readDoc(tmpDir, 'models', 'Organization.md');
        expect(orgDoc).toContain('**Category:** Core');
        expect(orgDoc).toContain('**Since:** 1.0');

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('**Category:** Identity');

        const activityDoc = readDoc(tmpDir, 'models', 'Activity.md');
        expect(activityDoc).toContain('**Category:** Audit');
        expect(activityDoc).toContain('**Since:** 2.0');
    });

    it('renders self-referential relations and @meta doc:example values', async () => {
        const tmpDir = await generateFromFile(SHOWCASE_SCHEMA);

        const taskDoc = readDoc(tmpDir, 'models', 'Task.md');
        expect(taskDoc).toContain('## Relationships');
        expect(taskDoc).toContain('[Task](./Task.md)');

        const titleLine = taskDoc.split('\n').find((l) => l.includes('field-title'));
        expect(titleLine).toContain('Fix login redirect bug');

        const orgDoc = readDoc(tmpDir, 'models', 'Organization.md');
        const slugLine = orgDoc.split('\n').find((l) => l.includes('field-slug'));
        expect(slugLine).toContain('acme-corp');

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        const emailLine = userDoc.split('\n').find((l) => l.includes('field-email'));
        expect(emailLine).toContain('jane@acme.com');
    });

    it('showcase models use diverse default-value functions (cuid, uuid, now)', async () => {
        const tmpDir = await generateFromFile(SHOWCASE_SCHEMA);

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        const userIdLine = userDoc.split('\n').find((l) => l.includes('field-id'));
        expect(userIdLine).toContain('`cuid()`');

        const activityDoc = readDoc(tmpDir, 'models', 'Activity.md');
        const actIdLine = activityDoc.split('\n').find((l) => l.includes('field-id'));
        expect(actIdLine).toContain('`uuid()`');

        const tsDoc = readDoc(tmpDir, 'types', 'Timestamps.md');
        const createdLine = tsDoc.split('\n').find((l) => l.includes('field-createdAt'));
        expect(createdLine).toContain('`now()`');
    });

    it('Task model renders @@validate model-level rule in Validation Rules', async () => {
        const tmpDir = await generateFromFile(SHOWCASE_SCHEMA);

        const taskDoc = readDoc(tmpDir, 'models', 'Task.md');
        expect(taskDoc).toContain('## Validation Rules');
        expect(taskDoc).toContain('estimatedHours');
        expect(taskDoc).toContain('Estimated hours must be positive when set');
    });

    it('Task model renders all validation attributes including @regex, @gt, @lte, @trim', async () => {
        const tmpDir = await generateFromFile(SHOWCASE_SCHEMA);

        const taskDoc = readDoc(tmpDir, 'models', 'Task.md');
        expect(taskDoc).toContain('## Validation Rules');

        const validationSection = taskDoc.split('## Validation Rules')[1]!;
        expect(validationSection).toContain('`@length`');
        expect(validationSection).toContain('`@trim`');
        expect(validationSection).toContain('`@regex`');
        expect(validationSection).toContain('`@gt`');
        expect(validationSection).toContain('`@lte`');
    });

    it('enum pages show descriptions and Used By with correct links', async () => {
        const tmpDir = await generateFromFile(SHOWCASE_SCHEMA);

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
        const tmpDir = await generateFromFile(SHOWCASE_SCHEMA);
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
        const tmpDir = await generateFromFile(SHOWCASE_SCHEMA);

        const tagDoc = readDoc(tmpDir, 'models', 'Tag.md');
        expect(tagDoc).toContain('# Tag');
        expect(tagDoc).toContain('## Fields');
        expect(tagDoc).toContain('field-name');
        expect(tagDoc).toContain('[Index](../index.md)');
    });

    it('generates procedure pages for all declared procedures', async () => {
        const tmpDir = await generateFromFile(SHOWCASE_SCHEMA);

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
        const tmpDir = await generateFromFile(SHOWCASE_SCHEMA);

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
        const tmpDir = await generateFromFile(SHOWCASE_SCHEMA);

        const signUpDoc = readDoc(tmpDir, 'procedures', 'signUp.md');
        expect(signUpDoc).toContain('[Role](../enums/Role.md)');
        expect(signUpDoc).toContain('[User](../models/User.md)');

        const createDoc = readDoc(tmpDir, 'procedures', 'createAndAssignTask.md');
        expect(createDoc).toContain('[Priority](../enums/Priority.md)');
        expect(createDoc).toContain('[Task](../models/Task.md)');
    });

    it('model pages show Used in Procedures backlinks', async () => {
        const tmpDir = await generateFromFile(SHOWCASE_SCHEMA);

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
        const tmpDir = await generateFromFile(SHOWCASE_SCHEMA);

        const signUpDoc = readDoc(tmpDir, 'procedures', 'signUp.md');
        expect(signUpDoc).toContain('<summary>Declaration');
        expect(signUpDoc).toContain('mutation procedure signUp');
        expect(signUpDoc).toContain('**Defined in:**');
        expect(signUpDoc).toContain('.zmodel');
    });

    it('has zero broken links including procedure pages', async () => {
        const tmpDir = await generateFromFile(SHOWCASE_SCHEMA);
        const broken = findBrokenLinks(tmpDir);
        expect(broken).toEqual([]);
    });

    it('includeInternalModels=true includes @@ignore models in output', async () => {
        const tmpDir = await generateFromFile(SHOWCASE_SCHEMA, { includeInternalModels: true });

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
        const tmpDir = await generateFromFile(MULTIFILE_SCHEMA);

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('**Defined in:**');
        expect(userDoc).toContain('models.zmodel');

        const roleDoc = readDoc(tmpDir, 'enums', 'Role.md');
        expect(roleDoc).toContain('**Defined in:**');
        expect(roleDoc).toContain('enums.zmodel');

        const tsDoc = readDoc(tmpDir, 'types', 'Timestamps.md');
        expect(tsDoc).toContain('**Defined in:**');
        expect(tsDoc).toContain('mixins.zmodel');
    });

    it('has zero broken links across multi-file output', async () => {
        const tmpDir = await generateFromFile(MULTIFILE_SCHEMA);
        expect(findBrokenLinks(tmpDir)).toEqual([]);
    });

    it('declaration code blocks show correct source for each file', async () => {
        const tmpDir = await generateFromFile(MULTIFILE_SCHEMA);

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('<summary>Declaration');
        expect(userDoc).toContain('model User');

        const roleDoc = readDoc(tmpDir, 'enums', 'Role.md');
        expect(roleDoc).toContain('<summary>Declaration');
        expect(roleDoc).toContain('enum Role');

        const tsDoc = readDoc(tmpDir, 'types', 'Timestamps.md');
        expect(tsDoc).toContain('<summary>Declaration');
        expect(tsDoc).toContain('type Timestamps');
    });
});

describe('integration: e2e procedures schema', () => {
    it('generates procedure pages from real procedures schema', async () => {
        const tmpDir = await generateFromFile(
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
        const tmpDir = await generateFromFile(
            path.join(E2E_SCHEMAS_DIR, 'procedures', 'schema.zmodel'),
        );
        expect(findBrokenLinks(tmpDir)).toEqual([]);
    });
});

describe('integration: e2e todo schema', () => {
    it('renders validation rules and complex policies', async () => {
        const tmpDir = await generateFromFile(
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
        const tmpDir = await generateFromFile(
            path.join(E2E_SCHEMAS_DIR, 'todo', 'schema.zmodel'),
        );
        expect(findBrokenLinks(tmpDir)).toEqual([]);
    });
});
