#!/usr/bin/env -S npx tsx
/**
 * TaskForge CLI.
 *
 * A small command-line client over the ZenStack v3 ORM (and Better-Auth for
 * user creation). Run `taskforge --help` for the command list, or during
 * development:  `pnpm cli <command>`.
 */
import { Command } from 'commander';
import { db } from './db';
import { auth } from './auth';

const program = new Command();

program
    .name('taskforge')
    .description('CLI for the TaskForge collaboration platform (ZenStack v3 + Better-Auth)')
    .version('0.1.0');

// ---------------------------------------------------------------------------
//  organizations
// ---------------------------------------------------------------------------
program
    .command('orgs')
    .description('List organizations with member, team and project counts')
    .action(async () => {
        const orgs = await db.organization.findMany({
            include: {
                owner: { select: { name: true } },
                _count: { select: { members: true, teams: true, projects: true } },
                subscription: { include: { plan: true } },
            },
            orderBy: { createdAt: 'asc' },
        });
        if (orgs.length === 0) return console.log('No organizations. Run `pnpm seed` first.');
        for (const o of orgs) {
            const plan = o.subscription?.plan.name ?? 'no plan';
            console.log(
                `• ${o.name} (@${o.slug}) — owner ${o.owner.name} · ` +
                    `${o._count.members} members, ${o._count.teams} teams, ${o._count.projects} projects · ${plan}`,
            );
        }
    });

// ---------------------------------------------------------------------------
//  projects  (demonstrates the `openIssueCount` computed field)
// ---------------------------------------------------------------------------
program
    .command('projects')
    .argument('[orgSlug]', 'filter by organization slug')
    .description('List projects and their open-issue counts (computed field)')
    .action(async (orgSlug?: string) => {
        const projects = await db.project.findMany({
            where: orgSlug ? { organization: { slug: orgSlug } } : undefined,
            include: {
                team: { select: { key: true } },
                lead: { select: { name: true } },
                _count: { select: { issues: true, members: true } },
            },
            orderBy: { name: 'asc' },
        });
        if (projects.length === 0) return console.log('No projects found.');
        for (const p of projects) {
            console.log(
                `• ${p.name} (${p.slug}) — team ${p.team?.key ?? '—'}, lead ${p.lead?.name ?? '—'} · ` +
                    `${p.openIssueCount}/${p._count.issues} issues open · ${p._count.members} members`,
            );
        }
    });

// ---------------------------------------------------------------------------
//  issues  (demonstrates relation include + the `commentCount` computed field)
// ---------------------------------------------------------------------------
program
    .command('issues')
    .argument('<projectSlug>', 'project slug, e.g. "platform"')
    .option('-s, --status <status>', 'filter by status (e.g. IN_PROGRESS)')
    .description('List issues in a project')
    .action(async (projectSlug: string, opts: { status?: string }) => {
        const issues = await db.issue.findMany({
            where: {
                project: { slug: projectSlug },
                ...(opts.status ? { status: opts.status as never } : {}),
            },
            include: {
                assignee: { select: { name: true } },
                labels: { select: { name: true } },
                _count: { select: { children: true, attachments: true } },
            },
            orderBy: { number: 'asc' },
        });
        if (issues.length === 0) return console.log('No issues found.');
        for (const i of issues) {
            const labels = i.labels.map((l) => `#${l.name}`).join(' ');
            console.log(
                `#${i.number} [${i.status}/${i.priority}] ${i.title} — ` +
                    `@${i.assignee?.name ?? 'unassigned'} · ${i.commentCount} comments · ` +
                    `${i._count.children} subtasks · ${i._count.attachments} files ${labels}`,
            );
        }
    });

// ---------------------------------------------------------------------------
//  issue <id>  (deep relation read incl. polymorphic attachments)
// ---------------------------------------------------------------------------
program
    .command('issue')
    .argument('<projectSlug>')
    .argument('<number>', 'issue number within the project', Number)
    .description('Show a single issue in detail')
    .action(async (projectSlug: string, number: number) => {
        const issue = await db.issue.findFirst({
            where: { project: { slug: projectSlug }, number },
            include: {
                author: { select: { name: true } },
                assignee: { select: { name: true } },
                watchers: { select: { name: true } },
                milestone: { select: { title: true } },
                sprint: { select: { name: true } },
                comments: { include: { author: { select: { name: true } } }, orderBy: { createdAt: 'asc' } },
                attachments: true, // polymorphic — each row includes its concrete fields
                timeEntries: true,
            },
        });
        if (!issue) return console.log('Issue not found.');
        console.log(`#${issue.number}  ${issue.title}`);
        console.log(`  status   : ${issue.status} / ${issue.priority}`);
        console.log(`  author   : ${issue.author.name}`);
        console.log(`  assignee : ${issue.assignee?.name ?? '—'}`);
        console.log(`  milestone: ${issue.milestone?.title ?? '—'}   sprint: ${issue.sprint?.name ?? '—'}`);
        console.log(`  watchers : ${issue.watchers.map((w) => w.name).join(', ') || '—'}`);
        console.log(`  metadata : ${JSON.stringify(issue.metadata ?? {})}`);
        const mins = issue.timeEntries.reduce((s, t) => s + t.minutes, 0);
        console.log(`  time     : ${mins} minutes logged`);
        console.log('  attachments:');
        for (const a of issue.attachments) {
            // `kind` is the polymorphic discriminator; concrete fields are present.
            const detail =
                a.kind === 'FileAttachment'
                    ? `${(a as { fileName: string }).fileName}`
                    : `${(a as { url: string }).url}`;
            console.log(`    - [${a.kind}] ${detail}`);
        }
        console.log('  comments:');
        for (const c of issue.comments) {
            console.log(`    - ${c.author.name}: ${c.body}`);
        }
    });

// ---------------------------------------------------------------------------
//  stats  (groupBy + aggregate)
// ---------------------------------------------------------------------------
program
    .command('stats')
    .description('Aggregate issue statistics across all projects')
    .action(async () => {
        const byStatus = await db.issue.groupBy({
            by: ['status'],
            _count: { _all: true },
            _avg: { estimate: true },
        });
        console.log('Issues by status:');
        for (const row of byStatus) {
            const avg = row._avg.estimate?.toFixed(1) ?? '—';
            console.log(`  ${row.status.padEnd(12)} ${row._count._all}  (avg estimate ${avg})`);
        }

        const totals = await db.issue.aggregate({ _count: { _all: true }, _sum: { estimate: true } });
        console.log(`\nTotal issues: ${totals._count._all}, total points: ${totals._sum.estimate ?? 0}`);

        const revenue = await db.invoice.aggregate({
            where: { status: 'PAID' },
            _sum: { amountCents: true },
        });
        console.log(`Paid revenue: $${((revenue._sum.amountCents ?? 0) / 100).toFixed(2)}`);
    });

// ---------------------------------------------------------------------------
//  add-issue  (interactive-free create in a transaction + activity log)
// ---------------------------------------------------------------------------
program
    .command('add-issue')
    .argument('<projectSlug>')
    .argument('<title...>', 'issue title')
    .option('-p, --priority <priority>', 'NONE|LOW|MEDIUM|HIGH|URGENT', 'NONE')
    .description('Create a new issue (auto-numbered) inside a transaction')
    .action(async (projectSlug: string, titleParts: string[], opts: { priority: string }) => {
        const title = titleParts.join(' ');
        const project = await db.project.findFirst({
            where: { slug: projectSlug },
            include: { organization: { select: { id: true, ownerId: true } } },
        });
        if (!project) return console.log(`Project "${projectSlug}" not found.`);

        const created = await db.$transaction(async (tx) => {
            const max = await tx.issue.aggregate({
                where: { projectId: project.id },
                _max: { number: true },
            });
            const next = (max._max.number ?? 0) + 1;
            const issue = await tx.issue.create({
                data: {
                    number: next,
                    title,
                    priority: opts.priority as never,
                    project: { connect: { id: project.id } },
                    author: { connect: { id: project.organization.ownerId } },
                },
            });
            await tx.activityLog.create({
                data: {
                    action: 'issue.created',
                    targetType: 'Issue',
                    targetId: issue.id,
                    organization: { connect: { id: project.organization.id } },
                    actor: { connect: { id: project.organization.ownerId } },
                },
            });
            return issue;
        });
        console.log(`Created issue #${created.number}: ${created.title}`);
    });

// ---------------------------------------------------------------------------
//  signup  (Better-Auth — demonstrates the auth integration)
// ---------------------------------------------------------------------------
program
    .command('signup')
    .argument('<email>')
    .argument('<name...>')
    .option('--password <password>', 'account password', 'Password123!')
    .description('Register a user through Better-Auth (writes user + account rows)')
    .action(async (email: string, nameParts: string[], opts: { password: string }) => {
        const res: any = await auth.api.signUpEmail({
            body: { email, name: nameParts.join(' '), password: opts.password },
        });
        console.log(`Registered ${res.user.name} <${res.user.email}> (id: ${res.user.id})`);
    });

// ---------------------------------------------------------------------------
//  activity  (recent audit log)
// ---------------------------------------------------------------------------
program
    .command('activity')
    .option('-n, --limit <n>', 'number of entries', '10')
    .description('Show the most recent activity-log entries')
    .action(async (opts: { limit: string }) => {
        const entries = await db.activityLog.findMany({
            take: Number(opts.limit),
            orderBy: { createdAt: 'desc' },
            include: { actor: { select: { name: true } } },
        });
        for (const e of entries) {
            console.log(`${e.createdAt.toISOString()}  ${e.actor.name}  ${e.action}  (${e.targetType})`);
        }
    });

program
    .parseAsync()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error(err instanceof Error ? err.message : err);
        process.exit(1);
    });
