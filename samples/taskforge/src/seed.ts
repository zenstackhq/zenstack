/**
 * Seed script — populates the database with a realistic TaskForge workspace.
 *
 * It demonstrates the two halves of the stack working together:
 *   1. Users are created through Better-Auth (`auth.api.signUpEmail`), which
 *      writes `user` + `account` rows through the ZenStack adapter.
 *   2. The whole domain graph (orgs, teams, projects, issues, …) is created with
 *      the ZenStack ORM, using nested writes and relation connects.
 *
 * Run with:  pnpm seed
 */
import { db } from './db';
import { auth } from './auth';

async function resetDatabase() {
    // ZenStack emulates referential actions, so deleting the aggregate roots
    // cascades to everything they own. Order: domain first, then auth users.
    await db.organization.deleteMany();
    await db.notification.deleteMany();
    await db.user.deleteMany();
    await db.plan.deleteMany();
    await db.verification.deleteMany();
}

/** Create a user via Better-Auth and return its id. */
async function signUp(name: string, email: string): Promise<string> {
    const res = await auth.api.signUpEmail({
        body: { name, email, password: 'Password123!' },
    });
    return (res as any).user.id;
}

async function main() {
    console.log('Resetting database…');
    await resetDatabase();

    console.log('Creating users via Better-Auth…');
    const aliceId = await signUp('Alice Anders', 'alice@taskforge.dev');
    const bobId = await signUp('Bob Burns', 'bob@taskforge.dev');
    const carolId = await signUp('Carol Chen', 'carol@taskforge.dev');
    const daveId = await signUp('Dave Diaz', 'dave@taskforge.dev');

    console.log('Creating billing plans…');
    await db.plan.createMany({
        data: [
            { name: 'Free', tier: 'FREE', priceCents: 0, seatLimit: 5 },
            { name: 'Pro', tier: 'PRO', priceCents: 1200, seatLimit: 25 },
            { name: 'Business', tier: 'BUSINESS', priceCents: 4900, seatLimit: 100 },
            { name: 'Enterprise', tier: 'ENTERPRISE', priceCents: 0 },
        ],
    });
    const proPlan = await db.plan.findUniqueOrThrow({ where: { tier: 'PRO' } });

    console.log('Creating organization with nested members, billing & teams…');
    const org = await db.organization.create({
        data: {
            name: 'Acme Inc.',
            slug: 'acme',
            owner: { connect: { id: aliceId } },
            members: {
                create: [
                    { role: 'OWNER', user: { connect: { id: aliceId } } },
                    { role: 'ADMIN', user: { connect: { id: bobId } } },
                    { role: 'MEMBER', user: { connect: { id: carolId } } },
                    { role: 'MEMBER', user: { connect: { id: daveId } } },
                ],
            },
            billingCustomer: {
                create: { stripeCustomerId: 'cus_acme_001', email: 'billing@acme.test' },
            },
            subscription: {
                create: {
                    status: 'ACTIVE',
                    plan: { connect: { id: proPlan.id } },
                    invoices: {
                        create: [
                            { number: 'INV-0001', amountCents: 1200, status: 'PAID', paidAt: new Date() },
                            { number: 'INV-0002', amountCents: 1200, status: 'OPEN' },
                        ],
                    },
                },
            },
            labels: {
                create: [
                    { name: 'bug', color: '#d73a4a' },
                    { name: 'feature', color: '#0e8a16' },
                    { name: 'chore', color: '#fbca04' },
                ],
            },
            customFields: {
                create: [
                    { name: 'Severity', type: 'SELECT' },
                    { name: 'Reproducible', type: 'BOOLEAN' },
                ],
            },
        },
    });

    console.log('Creating a team and its members…');
    const team = await db.team.create({
        data: {
            name: 'Engineering',
            key: 'ENG',
            description: 'Core product engineering',
            organization: { connect: { id: org.id } },
            lead: { connect: { id: bobId } },
            members: {
                create: [
                    { user: { connect: { id: bobId } } },
                    { user: { connect: { id: carolId } } },
                    { user: { connect: { id: daveId } } },
                ],
            },
        },
    });

    console.log('Creating a project with members, milestone & sprint…');
    const project = await db.project.create({
        data: {
            name: 'Platform',
            slug: 'platform',
            description: 'The core TaskForge platform',
            organization: { connect: { id: org.id } },
            team: { connect: { id: team.id } },
            lead: { connect: { id: bobId } },
            members: {
                create: [
                    { role: 'LEAD', user: { connect: { id: bobId } } },
                    { role: 'CONTRIBUTOR', user: { connect: { id: carolId } } },
                    { role: 'CONTRIBUTOR', user: { connect: { id: daveId } } },
                ],
            },
            milestones: {
                create: [{ title: 'v1.0 launch', status: 'OPEN', dueDate: new Date(Date.now() + 30 * 864e5) }],
            },
            sprints: {
                create: [{ name: 'Sprint 1', status: 'ACTIVE', goal: 'Ship auth + projects' }],
            },
        },
    });

    const milestone = await db.milestone.findFirstOrThrow({ where: { projectId: project.id } });
    const sprint = await db.sprint.findFirstOrThrow({ where: { projectId: project.id } });
    const bugLabel = await db.label.findFirstOrThrow({ where: { organizationId: org.id, name: 'bug' } });
    const featureLabel = await db.label.findFirstOrThrow({ where: { organizationId: org.id, name: 'feature' } });

    console.log('Creating issues with labels, watchers, comments & attachments…');
    const issueSpecs = [
        { title: 'Set up authentication', status: 'DONE', priority: 'HIGH', assignee: carolId },
        { title: 'Design project schema', status: 'IN_PROGRESS', priority: 'URGENT', assignee: bobId },
        { title: 'Implement issue board', status: 'TODO', priority: 'MEDIUM', assignee: daveId },
        { title: 'Add billing integration', status: 'BACKLOG', priority: 'LOW', assignee: null },
        { title: 'Flaky CI pipeline', status: 'IN_REVIEW', priority: 'HIGH', assignee: carolId },
    ] as const;

    let n = 0;
    let parentIssueId: string | undefined;
    for (const spec of issueSpecs) {
        n += 1;
        const issue = await db.issue.create({
            data: {
                number: n,
                title: spec.title,
                status: spec.status,
                priority: spec.priority,
                estimate: (n % 3) + 1,
                project: { connect: { id: project.id } },
                author: { connect: { id: aliceId } },
                ...(spec.assignee ? { assignee: { connect: { id: spec.assignee } } } : {}),
                milestone: { connect: { id: milestone.id } },
                sprint: { connect: { id: sprint.id } },
                ...(parentIssueId ? { parent: { connect: { id: parentIssueId } } } : {}),
                metadata: { externalId: `EXT-${100 + n}`, storyPoints: (n % 3) + 1 },
                labels: { connect: n % 2 === 0 ? [{ id: featureLabel.id }] : [{ id: bugLabel.id }] },
                watchers: { connect: [{ id: bobId }, { id: carolId }] },
                comments: {
                    create: [
                        { body: 'Taking a look at this now.', author: { connect: { id: carolId } } },
                        { body: 'Thanks, ping me if blocked.', author: { connect: { id: bobId } } },
                    ],
                },
                timeEntries: {
                    create: [
                        { minutes: 30 * n, note: 'Initial work', user: { connect: { id: spec.assignee ?? aliceId } } },
                    ],
                },
            },
        });

        // Polymorphic attachments are created through their concrete models
        // (`@@delegate` base entities can't be created directly). The `kind`
        // discriminator is set automatically.
        await db.linkAttachment.create({
            data: {
                url: 'https://example.com/design',
                title: 'Design doc',
                issue: { connect: { id: issue.id } },
                uploadedBy: { connect: { id: aliceId } },
            },
        });
        if (n % 2 === 0) {
            await db.fileAttachment.create({
                data: {
                    fileName: `notes-${n}.pdf`,
                    fileSize: 1024 * n,
                    mimeType: 'application/pdf',
                    issue: { connect: { id: issue.id } },
                    uploadedBy: { connect: { id: bobId } },
                },
            });
        }

        if (n === 1) parentIssueId = issue.id; // later issues become sub-issues of #1
    }

    console.log('Creating a document tree…');
    const rootDoc = await db.document.create({
        data: {
            title: 'Engineering Handbook',
            content: { format: 'markdown', body: '# Handbook\nWelcome to the team.', revision: 1 },
            project: { connect: { id: project.id } },
            author: { connect: { id: bobId } },
            collaborators: { connect: [{ id: carolId }, { id: daveId }] },
        },
    });
    await db.document.create({
        data: {
            title: 'Onboarding',
            content: { format: 'markdown', body: '## Day 1\nGet your laptop.', revision: 1 },
            project: { connect: { id: project.id } },
            author: { connect: { id: bobId } },
            parent: { connect: { id: rootDoc.id } },
        },
    });

    console.log('Creating integrations, webhook, API token & notifications…');
    await db.integration.create({
        data: {
            provider: 'GITHUB',
            config: { accessToken: 'ghp_xxx', accountName: 'acme', scopes: 'repo,read:org' },
            organization: { connect: { id: org.id } },
            installedBy: { connect: { id: aliceId } },
        },
    });
    await db.webhook.create({
        data: {
            url: 'https://hooks.acme.test/taskforge',
            secret: 'whsec_123',
            config: { events: 'issue.created,issue.updated', contentType: 'application/json' },
            organization: { connect: { id: org.id } },
        },
    });
    await db.apiToken.create({
        data: {
            name: 'CI token',
            tokenHash: 'hash_ci_token',
            scopes: 'issues:read issues:write',
            organization: { connect: { id: org.id } },
            user: { connect: { id: bobId } },
        },
    });
    await db.notification.createMany({
        data: [
            {
                type: 'ISSUE_ASSIGNED',
                message: 'You were assigned "Set up authentication"',
                recipientId: carolId,
                actorId: aliceId,
            },
            { type: 'COMMENT_ADDED', message: 'Bob commented on an issue', recipientId: carolId, actorId: bobId },
        ],
    });
    await db.activityLog.createMany({
        data: [
            {
                action: 'project.created',
                targetType: 'Project',
                targetId: project.id,
                organizationId: org.id,
                actorId: aliceId,
            },
            { action: 'team.created', targetType: 'Team', targetId: team.id, organizationId: org.id, actorId: aliceId },
        ],
    });

    console.log('\n✅ Seed complete.');
    const counts = {
        users: await db.user.count(),
        organizations: await db.organization.count(),
        teams: await db.team.count(),
        projects: await db.project.count(),
        issues: await db.issue.count(),
        comments: await db.comment.count(),
        attachments: await db.attachment.count(),
        documents: await db.document.count(),
    };
    console.table(counts);
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err);
        process.exit(1);
    });
