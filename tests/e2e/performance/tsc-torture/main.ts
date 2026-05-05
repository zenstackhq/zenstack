/* eslint-disable @typescript-eslint/no-unused-vars */

// Type-checking-only torture file. NOT a vitest test (intentionally `.ts`,
// not `.test.ts`) — exists solely so `pnpm test:typecheck` exercises a
// large, deeply-nested ORM workload against `tsc` to surface compiler
// performance regressions. Never executed at runtime.

import { ZenStackClient } from '@zenstackhq/orm';
import { SqliteDialect } from '@zenstackhq/orm/dialects/sqlite';
import Database from 'better-sqlite3';
import { schema } from './zenstack/schema';

function createClient() {
    return new ZenStackClient(schema, {
        dialect: new SqliteDialect({ database: new Database(':memory:') }),
    });
}

type Client = ReturnType<typeof createClient>;

// ─── Cleanup: delete all rows in FK-safe leaf-to-root order ─────────────────

async function cleanupAll(db: Client) {
    // Concrete delegate subtypes first (they hold the extra columns)
    await db.approvalNotification.deleteMany();
    await db.reviewRequestNotification.deleteMany();
    await db.commentNotification.deleteMany();
    await db.statusChangeNotification.deleteMany();
    await db.assignmentNotification.deleteMany();
    await db.mentionNotification.deleteMany();
    await db.attachmentComment.deleteMany();
    await db.codeSnippetComment.deleteMany();
    await db.textComment.deleteMany();
    // Base delegate models (rows remaining after concrete removal)
    await db.notification.deleteMany();
    await db.comment.deleteMany();
    // Leaf / junction tables
    await db.commentReaction.deleteMany();
    await db.reviewComment.deleteMany();
    await db.review.deleteMany();
    await db.timeEntry.deleteMany();
    await db.activityLogEntry.deleteMany();
    await db.auditLog.deleteMany();
    await db.attachment.deleteMany();
    await db.taskLabel.deleteMany();
    await db.customFieldValue.deleteMany();
    await db.task.deleteMany();
    await db.label.deleteMany();
    await db.integrationLink.deleteMany();
    await db.integration.deleteMany();
    await db.documentSection.deleteMany();
    await db.document.deleteMany();
    await db.sprint.deleteMany();
    await db.milestone.deleteMany();
    await db.projectTeamAssignment.deleteMany();
    await db.project.deleteMany();
    await db.invoiceLineItem.deleteMany();
    await db.invoice.deleteMany();
    await db.billingInfo.deleteMany();
    await db.customFieldDefinition.deleteMany();
    await db.teamMember.deleteMany();
    await db.team.deleteMany();
    await db.apiToken.deleteMany();
    await db.userPreferences.deleteMany();
    await db.organizationMember.deleteMany();
    await db.user.deleteMany();
    await db.organization.deleteMany();
}

// ─── Seed: deep nested creates across multiple calls ─────────────────────────

async function seedDeep(db: Client) {
    // Step 1: create users
    const alice = await db.user.create({
        data: {
            email: 'alice@acme.com',
            username: 'alice',
            displayName: 'Alice',
            userPreferences: {
                create: { emailNotifications: true, theme: 'dark' },
            },
            apiTokens: {
                create: [
                    { name: 'CI token', tokenHash: 'hash-alice-ci' },
                    { name: 'Dev token', tokenHash: 'hash-alice-dev' },
                ],
            },
        },
        include: { userPreferences: true, apiTokens: true },
    });

    const bob = await db.user.create({
        data: {
            email: 'bob@acme.com',
            username: 'bob',
            displayName: 'Bob',
            userPreferences: { create: { emailNotifications: false, theme: 'light' } },
        },
        include: { userPreferences: true },
    });

    // Step 2: organization with billing, teams, integrations, custom fields
    const org = await db.organization.create({
        data: {
            name: 'Acme Corp',
            slug: 'acme',
            members: {
                create: [
                    { role: 'ADMIN', user: { connect: { id: alice.id } } },
                    { role: 'MEMBER', user: { connect: { id: bob.id } } },
                ],
            },
            teams: {
                create: [{ name: 'Engineering', color: '#0066cc' }],
            },
            billingInfo: {
                create: {
                    planName: 'Pro',
                    billingEmail: 'billing@acme.com',
                    paymentMethod: 'CREDIT_CARD',
                    invoices: {
                        create: [
                            {
                                number: 'INV-001',
                                amountCents: 9900,
                                dueDate: new Date('2026-05-01'),
                                status: 'SENT',
                                lineItems: {
                                    create: [
                                        { description: 'Pro plan — April 2026', quantity: 1, unitCents: 9900 },
                                    ],
                                },
                            },
                        ],
                    },
                },
            },
            customFields: {
                create: [
                    { name: 'Business Unit', fieldType: 'text' },
                    { name: 'Risk Score', fieldType: 'number', required: false },
                ],
            },
            integrations: {
                create: [
                    { provider: 'github', config: JSON.stringify({ repo: 'acme/monorepo' }) },
                    { provider: 'slack', config: JSON.stringify({ channel: '#eng' }) },
                ],
            },
        },
    });

    // Step 3: project with labels, milestones, sprints, documents
    const project = await db.project.create({
        data: {
            name: 'Titan Platform',
            slug: 'titan',
            description: 'Next-gen platform rebuild',
            status: 'ACTIVE',
            organization: { connect: { id: org.id } },
            owner: { connect: { id: alice.id } },
            labels: {
                create: [
                    { name: 'bug', color: '#e11d48' },
                    { name: 'feature', color: '#16a34a' },
                    { name: 'chore', color: '#ca8a04' },
                ],
            },
            milestones: {
                create: [
                    { name: 'Alpha', dueDate: new Date('2026-06-01') },
                    { name: 'Beta', dueDate: new Date('2026-08-01') },
                ],
            },
            sprints: {
                create: [
                    {
                        name: 'Sprint 1',
                        goal: 'Set up CI/CD',
                        startDate: new Date('2026-04-21'),
                        endDate: new Date('2026-05-04'),
                    },
                ],
            },
            documents: {
                create: [
                    {
                        title: 'Architecture Decision Records',
                        published: true,
                        sections: {
                            create: [
                                { order: 1, heading: 'ADR-001: Database choice', content: 'We chose SQLite.' },
                                { order: 2, heading: 'ADR-002: Auth strategy', content: 'JWT with refresh tokens.' },
                            ],
                        },
                    },
                ],
            },
        },
        include: {
            labels: true,
            milestones: true,
            sprints: true,
        },
    });

    const alphaMilestone = project.milestones.find((m) => m.name === 'Alpha')!;
    const sprint = project.sprints[0]!;
    const featureLabel = project.labels.find((l) => l.name === 'feature')!;

    // Step 4: tasks
    const bootstrapTask = await db.task.create({
        data: {
            title: 'Bootstrap repo',
            status: 'DONE',
            priority: 'HIGH',
            project: { connect: { id: project.id } },
            milestone: { connect: { id: alphaMilestone.id } },
            sprint: { connect: { id: sprint.id } },
            reporter: { connect: { id: alice.id } },
            assignee: { connect: { id: alice.id } },
            attachments: {
                create: [
                    {
                        filename: 'screenshot.png',
                        mimeType: 'image/png',
                        sizeBytes: 204800,
                        storageKey: 's3://bucket/screenshot.png',
                    },
                ],
            },
            labels: {
                create: [{ label: { connect: { id: featureLabel.id } } }],
            },
        },
    });

    // Step 5: delegate comment types — TextComment, CodeSnippetComment, AttachmentComment

    // TextComment with reactions and a reply
    const mainComment = await db.textComment.create({
        data: {
            body: 'Bootstrap is complete! Repo is live.',
            task: { connect: { id: bootstrapTask.id } },
            author: { connect: { id: alice.id } },
            reactions: {
                create: [{ emoji: '🎉' }, { emoji: '👍' }],
            },
        },
        include: { reactions: true },
    });

    // Reply (TextComment) to mainComment
    await db.textComment.create({
        data: {
            body: 'Great work, Alice!',
            task: { connect: { id: bootstrapTask.id } },
            author: { connect: { id: bob.id } },
            parent: { connect: { id: mainComment.id } },
        },
    });

    // CodeSnippetComment — shows CI config snippet
    await db.codeSnippetComment.create({
        data: {
            body: 'name: CI\non: [push]\njobs:\n  test:\n    runs-on: ubuntu-latest',
            language: 'yaml',
            task: { connect: { id: bootstrapTask.id } },
            author: { connect: { id: alice.id } },
        },
    });

    // AttachmentComment — inline file metadata
    await db.attachmentComment.create({
        data: {
            body: 'Attaching the architecture diagram for reference.',
            task: { connect: { id: bootstrapTask.id } },
            author: { connect: { id: alice.id } },
            attachFilename: 'arch-diagram.png',
            attachMimeType: 'image/png',
            attachSizeBytes: 512000,
            attachStorageKey: 's3://bucket/arch-diagram.png',
        },
    });

    // Step 6: subtask with review
    const testTask = await db.task.create({
        data: {
            title: 'Write unit tests',
            status: 'IN_PROGRESS',
            priority: 'MEDIUM',
            project: { connect: { id: project.id } },
            milestone: { connect: { id: alphaMilestone.id } },
            sprint: { connect: { id: sprint.id } },
            reporter: { connect: { id: bob.id } },
            assignee: { connect: { id: bob.id } },
            parent: { connect: { id: bootstrapTask.id } },
        },
    });

    const review = await db.review.create({
        data: {
            task: { connect: { id: testTask.id } },
            reviewer: { connect: { id: alice.id } },
            decision: 'CHANGES_REQUESTED',
            summary: 'Need more edge-case coverage',
            comments: {
                create: [
                    { body: 'Add a test for the null path', lineRef: 'src/index.ts:42' },
                    { body: 'Mock the DB layer here', lineRef: 'src/db.ts:17' },
                ],
            },
        },
        include: { comments: true },
    });

    await db.timeEntry.create({
        data: {
            task: { connect: { id: testTask.id } },
            user: { connect: { id: bob.id } },
            startedAt: new Date('2026-04-22T09:00:00Z'),
            stoppedAt: new Date('2026-04-22T11:30:00Z'),
            durationMin: 150,
        },
    });

    // Step 7: typed notifications via delegate concrete models
    await db.mentionNotification.create({
        data: {
            user: { connect: { id: bob.id } },
            mentionedByUserId: alice.id,
            taskId: bootstrapTask.id,
        },
    });

    await db.assignmentNotification.create({
        data: {
            user: { connect: { id: bob.id } },
            taskId: testTask.id,
            assignedByUserId: alice.id,
        },
    });

    await db.statusChangeNotification.create({
        data: {
            user: { connect: { id: alice.id } },
            taskId: bootstrapTask.id,
            fromStatus: 'IN_PROGRESS',
            toStatus: 'DONE',
        },
    });

    await db.commentNotification.create({
        data: {
            user: { connect: { id: alice.id } },
            commentId: mainComment.id,
        },
    });

    await db.reviewRequestNotification.create({
        data: {
            user: { connect: { id: alice.id } },
            reviewId: review.id,
            requestedByUserId: bob.id,
        },
    });

    await db.approvalNotification.create({
        data: {
            user: { connect: { id: alice.id } },
            targetType: 'Task',
            targetId: testTask.id,
        },
    });

    return { org, project, alice, bob, bootstrapTask, testTask, sprint, alphaMilestone };
}

// ─── Complex nested reads ─────────────────────────────────────────────────────

async function runComplexReads(db: Client, orgId: number) {
    // Read 1: org → billing → invoices → line-items (4 levels)
    const orgWithBilling = await db.organization.findUnique({
        where: { id: orgId },
        include: {
            billingInfo: {
                include: {
                    invoices: {
                        include: { lineItems: true },
                        where: { status: { in: ['SENT', 'OVERDUE'] } },
                    },
                },
            },
            members: {
                include: {
                    user: {
                        include: {
                            userPreferences: true,
                            apiTokens: { where: { expiresAt: null } },
                        },
                    },
                },
            },
        },
    });

    // Read 2: project → milestones → tasks → subtasks → reviews (5 levels)
    const projectDeep = await db.project.findFirst({
        where: { organizationId: orgId },
        include: {
            milestones: {
                include: {
                    tasks: {
                        include: {
                            subtasks: {
                                include: {
                                    reviews: {
                                        include: { comments: true, reviewer: true },
                                    },
                                    timeEntries: true,
                                    assignee: true,
                                },
                            },
                            // Query all comment subtypes through the base relation
                            comments: {
                                include: {
                                    reactions: true,
                                    replies: { include: { author: true } },
                                    author: true,
                                },
                            },
                            labels: { include: { label: true } },
                            attachments: true,
                        },
                        orderBy: { createdAt: 'desc' },
                    },
                },
            },
            sprints: {
                include: {
                    tasks: {
                        include: { assignee: true, reporter: true },
                    },
                },
            },
            documents: { include: { sections: { orderBy: { order: 'asc' } } } },
            labels: true,
        },
    });

    // Read 3: org → members → user → reportedTasks → comments → reactions (5 levels)
    const orgActivity = await db.organization.findUnique({
        where: { id: orgId },
        include: {
            members: {
                include: {
                    user: {
                        include: {
                            reportedTasks: {
                                include: {
                                    comments: {
                                        include: { reactions: true, author: true },
                                        take: 5,
                                    },
                                    milestone: true,
                                    sprint: true,
                                    labels: { include: { label: true } },
                                },
                                where: { status: { notIn: ['DONE', 'CANCELLED'] } },
                            },
                            assignedTasks: {
                                include: {
                                    reviews: {
                                        include: {
                                            comments: true,
                                            reviewer: { include: { userPreferences: true } },
                                        },
                                    },
                                    timeEntries: true,
                                    subtasks: { include: { assignee: true } },
                                },
                                take: 10,
                            },
                        },
                    },
                },
            },
            teams: {
                include: {
                    members: { include: { user: true } },
                    projects: {
                        include: {
                            project: { include: { milestones: true, sprints: true } },
                        },
                    },
                },
            },
        },
    });

    // Read 4: query base Notification — returns all subtypes with discriminated fields
    const allNotifications = await db.notification.findMany({
        where: { userId: { gt: 0 } },
        include: { user: true },
        orderBy: { createdAt: 'desc' },
    });

    // Read 5: query concrete comment subtypes separately
    const codeComments = await db.codeSnippetComment.findMany({
        include: {
            author: true,
            task: { include: { project: true } },
            reactions: true,
        },
    });

    const attachmentComments = await db.attachmentComment.findMany({
        include: {
            author: true,
            task: { include: { project: true, milestone: true } },
        },
    });

    // Read 6: custom fields → task → project (4 levels)
    const customFieldValues = await db.customFieldValue.findMany({
        where: { field: { organizationId: orgId } },
        include: {
            field: { include: { organization: true } },
            project: { include: { owner: true } },
            task: {
                include: {
                    project: { include: { milestones: true } },
                    assignee: true,
                },
            },
        },
    });

    return {
        orgWithBilling,
        projectDeep,
        orgActivity,
        allNotifications,
        codeComments,
        attachmentComments,
        customFieldValues,
    };
}

// ─── Mutations ────────────────────────────────────────────────────────────────

async function runMutations(db: Client, orgId: number, projectId: number, aliceId: number, bobId: number) {
    const integration = await db.integration.findFirst({
        where: { organizationId: orgId, provider: 'github' },
    });

    if (integration) {
        await db.integrationLink.upsert({
            where: {
                integrationId_externalId: {
                    integrationId: integration.id,
                    externalId: 'pr-42',
                },
            },
            create: {
                externalId: 'pr-42',
                url: 'https://github.com/acme/monorepo/pull/42',
                integration: { connect: { id: integration.id } },
                project: { connect: { id: projectId } },
            },
            update: { url: 'https://github.com/acme/monorepo/pull/42' },
        });
    }

    await db.task.createMany({
        data: [
            {
                title: 'Set up CI pipeline',
                status: 'TODO',
                priority: 'HIGH',
                projectId,
                reporterId: aliceId,
                assigneeId: bobId,
            },
            { title: 'Deploy to staging', status: 'BACKLOG', priority: 'MEDIUM', projectId, reporterId: aliceId },
            {
                title: 'Load testing',
                status: 'BACKLOG',
                priority: 'LOW',
                projectId,
                reporterId: bobId,
                assigneeId: bobId,
            },
        ],
    });

    const taskCounts = await db.task.groupBy({
        by: ['status'],
        where: { projectId },
        _count: { id: true },
    });

    const storyPointSum = await db.task.aggregate({
        where: { projectId },
        _sum: { storyPoints: true },
        _count: { id: true },
    });

    // Fan-out: typed notifications to all org members
    const members = await db.organizationMember.findMany({
        where: { organizationId: orgId },
    });

    for (const m of members) {
        await db.statusChangeNotification.create({
            data: {
                user: { connect: { id: m.userId } },
                taskId: 1,
                fromStatus: 'BACKLOG',
                toStatus: 'IN_PROGRESS',
            },
        });
    }

    return { taskCounts, storyPointSum };
}

// ─── Entry point (never invoked — this file is type-check-only) ──────────────

async function main() {
    const db = createClient();
    await cleanupAll(db);

    const { org, project } = await seedDeep(db);
    const reads = await runComplexReads(db, org.id);
    const mutations = await runMutations(
        db,
        org.id,
        project.id,
        reads.orgWithBilling!.members[0]!.userId,
        reads.orgWithBilling!.members[1]!.userId,
    );

    void mutations;
}

void main;
