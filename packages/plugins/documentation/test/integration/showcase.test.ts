import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { findBrokenLinks, generateFromFile, readDoc } from '../utils';

const SHOWCASE_SCHEMA = path.resolve(__dirname, '../../zenstack/showcase.zmodel');

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
        expect(tsDoc).toContain('Fields');
        expect(tsDoc).toContain('field-createdAt');
        expect(tsDoc).toContain('field-updatedAt');
        expect(tsDoc).toContain('Used By');
        expect(tsDoc).toContain('[Organization](../models/Organization.md');
        expect(tsDoc).toContain('[User](../models/User.md');

        const index = readDoc(tmpDir, 'index.md');
        expect(index).toContain('Types');
        expect(index).toContain('[Timestamps](./types/Timestamps.md)');

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('Mixins');
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

        expect(userDoc).toContain('Access Policies');
        expect(userDoc).toContain('Allow');
        expect(userDoc).toContain('Deny');

        expect(userDoc).toContain('Indexes');

        const orgDoc = readDoc(tmpDir, 'models', 'Organization.md');
        expect(orgDoc).toContain('Validation Rules');
        expect(orgDoc).toContain('`@length`');
        expect(orgDoc).toContain('`@email`');
        expect(orgDoc).toContain('Indexes');
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

        const index = readDoc(tmpDir, 'index.md');
        expect(index).toContain('Views');
        expect(index).toContain('[UserProfile](./views/UserProfile.md)');
        expect(index).toContain('[ProjectTaskSummary](./views/ProjectTaskSummary.md)');
        expect(index).toContain('[UserLeaderboard](./views/UserLeaderboard.md)');
        expect(index).toContain('3 views');

        const profileDoc = readDoc(tmpDir, 'views', 'UserProfile.md');
        expect(profileDoc).toContain('<kbd>View</kbd>');
        expect(profileDoc).not.toContain('<kbd>Model</kbd>');
        expect(profileDoc).toContain('[Views](../index.md#views)');
        expect(profileDoc).toContain('Flattened user profile for reporting');
        expect(profileDoc).toContain('Fields');
        expect(profileDoc).toContain('field-name');
        expect(profileDoc).toContain('field-email');
        expect(profileDoc).toContain('field-organizationName');
        expect(profileDoc).toContain('field-teamCount');
        expect(profileDoc).toContain('<summary>Declaration');
        expect(profileDoc).toContain('view UserProfile');

        expect(profileDoc).toContain('Full name of the user');
        expect(profileDoc).toContain('Email address of the user');

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
        expect(taskDoc).toContain('Relationships');
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
        expect(taskDoc).toContain('Validation Rules');
        expect(taskDoc).toContain('estimatedHours');
        expect(taskDoc).toContain('Estimated hours must be positive when set');
    });

    it('Task model renders all validation attributes including @regex, @gt, @lte, @trim', async () => {
        const tmpDir = await generateFromFile(SHOWCASE_SCHEMA);

        const taskDoc = readDoc(tmpDir, 'models', 'Task.md');
        expect(taskDoc).toContain('✅ Validation Rules');

        const parts = taskDoc.split('✅ Validation Rules');
        expect(parts).toHaveLength(2);
        const validationSection = parts[1]!;
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
        expect(roleDoc).toContain('| `OWNER`');
        expect(roleDoc).toContain('| `GUEST`');
        expect(roleDoc).toContain('Used By');
        expect(roleDoc).toContain('[User](../models/User.md)');
        expect(roleDoc).toContain('[TeamMember](../models/TeamMember.md)');

        const statusDoc = readDoc(tmpDir, 'enums', 'TaskStatus.md');
        expect(statusDoc).toContain('Lifecycle status');
        expect(statusDoc).toContain('Waiting to be started');
        expect(statusDoc).toContain('Used By');
        expect(statusDoc).toContain('[Task](../models/Task.md)');

        const priorityDoc = readDoc(tmpDir, 'enums', 'Priority.md');
        expect(priorityDoc).toContain('Priority levels');
        expect(priorityDoc).toContain('| `LOW`');
        expect(priorityDoc).toContain('| `CRITICAL`');
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
        expect(tagDoc).toContain('Fields');
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
        expect(index).toContain('Procedures');
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
        expect(signUpDoc).toContain('Parameters');
        expect(signUpDoc).toContain('| `email`');
        expect(signUpDoc).toContain('| `name`');
        expect(signUpDoc).toContain('| `role`');
        expect(signUpDoc).toContain('Returns');
        expect(signUpDoc).toContain('[User](../models/User.md)');

        const getUserDoc = readDoc(tmpDir, 'procedures', 'getUser.md');
        expect(getUserDoc).toContain('# getUser');
        expect(getUserDoc).toContain('<kbd>Query</kbd>');
        expect(getUserDoc).toContain('Returns');
        expect(getUserDoc).toContain('[User](../models/User.md)');

        const bulkDoc = readDoc(tmpDir, 'procedures', 'bulkUpdateTaskStatus.md');
        expect(bulkDoc).toContain('<kbd>Mutation</kbd>');
        expect(bulkDoc).toContain('| `taskIds`');
        expect(bulkDoc).toContain('| `status`');
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
        expect(userDoc).toContain('Used in Procedures');
        expect(userDoc).toContain('[signUp](../procedures/signUp.md)');
        expect(userDoc).toContain('[getUser](../procedures/getUser.md)');
        expect(userDoc).toContain('[listOrgUsers](../procedures/listOrgUsers.md)');

        const taskDoc = readDoc(tmpDir, 'models', 'Task.md');
        expect(taskDoc).toContain('Used in Procedures');
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

    it('generates SKILL.md with comprehensive content when generateSkill=true', async () => {
        const tmpDir = await generateFromFile(SHOWCASE_SCHEMA, { generateSkill: true });

        const skill = readDoc(tmpDir, 'SKILL.md');

        // Frontmatter
        expect(skill).toMatch(/^---\n/);
        expect(skill).toContain('name:');
        expect(skill).toContain('description:');

        // Overview lists ALL entities with type labels
        expect(skill).toContain('## Schema Overview');
        expect(skill).toContain('9 models');
        expect(skill).toContain('3 enums');
        expect(skill).toContain('2 types');
        expect(skill).toContain('3 views');
        expect(skill).toContain('7 procedures');
        expect(skill).toContain('Entities:');
        expect(skill).toContain('**User** (Model)');
        expect(skill).toContain('**Organization** (Model)');
        expect(skill).toContain('**UserProfile** (View)');
        expect(skill).not.toContain('...and');

        // Conventions
        expect(skill).toContain('## Conventions');
        expect(skill).toContain('**IDs**');
        expect(skill).toContain('**Mixins**');
        expect(skill).toContain('Timestamps');
        expect(skill).toContain('**Computed fields**');

        // Constraints
        expect(skill).toContain('## Constraints You Must Respect');
        expect(skill).toContain('### Access Policies');
        expect(skill).toContain("allow('read', true)");
        expect(skill).toContain('### Validation');
        expect(skill).toContain('@email');
        expect(skill).toContain('@length');

        // Workflow
        expect(skill).toContain('## How To Use This Schema');
        expect(skill).toContain('### Calling procedures');
        expect(skill).toContain('signUp');
        expect(skill).toContain('mutation');
        expect(skill).toContain('getUser');
        expect(skill).toContain('query');

        // Entity Reference: full declarations in prisma code blocks
        expect(skill).toContain('## Entity Reference');
        expect(skill).toContain('### Models');
        expect(skill).toContain('#### User');
        expect(skill).toContain('#### Organization');
        expect(skill).toContain('#### Task');
        expect(skill).toContain('```prisma');
        expect(skill).toContain('model User');
        expect(skill).toContain('model Organization');
        expect(skill).toContain('### Enums');
        expect(skill).toContain('#### Role');
        expect(skill).toContain('enum Role {');
        expect(skill).toContain('#### Priority');
        expect(skill).toContain('#### TaskStatus');
        expect(skill).toContain('### Types');
        expect(skill).toContain('#### Timestamps');
        expect(skill).toContain('type Timestamps {');
        expect(skill).toContain('#### ProjectStats');
        expect(skill).toContain('### Views');
        expect(skill).toContain('#### UserProfile');
        expect(skill).toContain('view UserProfile {');

        // Relationships inline under models
        expect(skill).toContain('Relationships:');

        // Links use entity name and type, not "Full documentation"
        expect(skill).toContain('[User (Model)](./models/User.md)');
        expect(skill).toContain('[Role (Enum)](./enums/Role.md)');
        expect(skill).toContain('[Timestamps (Type)](./types/Timestamps.md)');
        expect(skill).toContain('[UserProfile (View)](./views/UserProfile.md)');
        expect(skill).not.toContain('[Full documentation]');

        // Footer
        expect(skill).toContain('## Detailed Documentation');
        expect(skill).toContain('[Full schema index](./index.md)');
        expect(skill).toContain('[Relationships and ER diagrams](./relationships.md)');
        expect(skill).toContain('procedures/signUp.md');
    });

    it('does not generate SKILL.md by default', async () => {
        const tmpDir = await generateFromFile(SHOWCASE_SCHEMA);
        expect(fs.existsSync(path.join(tmpDir, 'SKILL.md'))).toBe(false);
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
