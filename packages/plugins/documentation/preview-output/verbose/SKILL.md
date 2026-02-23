---
name: schema-documentation-schema
description: Schema reference for Schema Documentation. Use when writing queries, building forms, creating or modifying models, generating API endpoints, writing tests with seed data, or reasoning about data access and validation in this project.
---

# Schema Documentation — Schema Skill

This skill provides the data schema context for Schema Documentation. Consult it whenever you need to understand the data model, write type-safe code against it, or respect its constraints.

## Schema Overview

This schema contains 11 models, 2 views, 3 types, 6 enums, 6 procedures.

Entities:
- **Article** (Model) — A long-form content article published within a workspace.
- **ArticleAnalytics** (View) — Aggregated article metrics for the workspace analytics dashboard.
- **AuditLog** (Model) — A record in the append-only audit log for compliance and debugging.
- **Category** (Model) — A content category for organizing articles within a workspace.
- **Comment** (Model) — A threaded comment on an article.
- **Invoice** (Model) — An invoice generated for a subscription billing cycle.
- **MemberActivity** (View) — Per-member activity summary for workspace admin dashboards.
- **Notification** (Model) — A notification delivered to a user.
- **NotificationPreference** (Model) — Per-user notification delivery preferences.
- **Subscription** (Model) — A subscription linking a workspace to a billing plan.
- **User** (Model) — A registered user account in the platform.
- **Workspace** (Model) — A collaborative workspace that groups users, content, and billing.
- **WorkspaceMember** (Model) — Represents a user's membership in a workspace with an assigned role.

## Conventions

Follow these patterns when working with this schema:

- **IDs**: All models use `@default(cuid())` for IDs.
- **Mixins** (shared field sets applied via `with`):
  - **Timestamps** (`createdAt`, `updatedAt`) — used by User, Workspace, WorkspaceMember, Category, Article, Comment, AuditLog, Subscription, Invoice, Notification, NotificationPreference
  - **SoftDeletable** (`deletedAt`, `deletedBy`) — used by User, Article, Comment
- **Computed fields** are read-only and derived at the database level. Never set them directly:
  - Article.readingTimeMin — Estimated reading time in minutes, computed from word count.
  - Article.commentCount — Number of comments on this article.
- **Relations**: 10 of 11 models have relationships. When creating records, always provide required foreign key fields (e.g. `userId`, `workspaceId`, `authorId`).

## Constraints You Must Respect

### Access Policies

ZenStack enforces these rules at the ORM level. Your code does not need to re-implement them, but you must be aware of them when reasoning about what operations will succeed or fail.

> Some rules reference `auth()` — the currently authenticated user. Operations that require `auth()` will fail for unauthenticated requests.

**Article**: allow('read', status == 'PUBLISHED' || workspace.members?[user == auth()]) · allow('create', workspace.members?[user == auth()]) · allow('update', author == auth() || workspace.members?[role == 'ADMIN' || role == 'OWNER']) · deny('update', status == 'IN_REVIEW' && author == auth()) · deny('delete', status == 'PUBLISHED')

**AuditLog**: allow('read', true) · deny('create,update,delete', true)

**Category**: allow('read', true) · allow('create,update,delete', workspace.members?[role == 'OWNER' || role == 'ADMIN'])

**Comment**: allow('read', article.status == 'PUBLISHED' || workspace.members?[user == auth()]) · allow('create', workspace.members?[user == auth()]) · allow('update', author == auth() && deletedAt == null) · deny('delete', true)

**Invoice**: allow('read', subscription.workspace.members?[userId == auth().id]) · deny('update', paidAt != null) · deny('delete', true)

**Notification**: allow('read', recipient == auth()) · allow('update', recipient == auth()) · deny('create,delete', true)

**Subscription**: allow('read', workspace.members?[userId == auth().id]) · allow('create,update', workspace.members?[role == 'OWNER']) · deny('delete', status == 'ACTIVE')

**User**: allow('read', true) · allow('update', this == auth()) · deny('update', deletedAt != null) · deny('delete', true)

**Workspace**: allow('read', members?[user == auth()]) · allow('update', members?[role == 'OWNER' || role == 'ADMIN']) · deny('delete', subscriptions?[status == 'ACTIVE'])

**WorkspaceMember**: allow('read', workspace.members?[user == auth()]) · allow('create', workspace.members?[role == 'OWNER' || role == 'ADMIN']) · allow('update', workspace.members?[role == 'OWNER' || role == 'ADMIN']) · deny('delete', role == 'OWNER')

### Validation

These constraints are enforced at the schema level. When generating test data, seed scripts, or form inputs, produce values that satisfy them.

- **Article**: title: @length(1, 200), slug: @length(2, 120), slug: @regex('^[a-z0-9][a-z0-9-]*[a-z0-9]$'), slug: @lower, excerpt: @length(0, 500), metaTitle: @length(0, 70), metaDescription: @length(0, 160)
- **AuditLog**: action: @length(1, 100)
- **Category**: name: @length(1, 80), slug: @length(2, 60), slug: @regex('^[a-z0-9][a-z0-9-]*[a-z0-9]$'), slug: @lower
- **Comment**: body: @length(1, 5000)
- **Invoice**: currency: @length(3, 3), currency: @lower
- **Notification**: type: @length(1, 80), title: @length(1, 200), actionUrl: @url
- **NotificationPreference**: type: @length(1, 80)
- **Subscription**: planName: @length(1, 100), currency: @length(3, 3), currency: @lower
- **User**: primaryEmail: @email, displayName: @length(1, 120), handle: @length(3, 30), handle: @regex('^[a-z0-9][a-z0-9-]*[a-z0-9]$'), handle: @lower, avatarUrl: @url, locale: @length(2, 10)
- **Workspace**: name: @length(2, 100), slug: @length(3, 40), slug: @regex('^[a-z0-9][a-z0-9-]*[a-z0-9]$'), slug: @lower, logoUrl: @url
- **WorkspaceMember**: title: @length(0, 100)

## How To Use This Schema

### Writing queries or mutations

1. Find the model in the Entity Reference below
2. Check its fields for types, optionality, and defaults
3. Check access policies — will the operation be allowed for the current user?
4. Check validation — will the input values pass schema-level validation?
5. For full field details, follow the entity documentation link

### Calling procedures

This schema defines server-side procedures. Use them instead of writing raw queries when available:

- `cancelSubscription(subscriptionId: String) → Subscription` *(mutation)* — Cancel a workspace subscription.  The workspace retains access to paid features until `currentPeriodEnd`. After that date, the workspace is downgraded to the free tier automatically.  Cancellation sends a Stripe API call to stop future renewals and records the `canceledAt` timestamp locally. — [cancelSubscription (Procedure)](./procedures/cancelSubscription.md)
- `getWorkspaceAnalytics(workspaceId: String) → WorkspaceAnalytics` *(query)* — Retrieve workspace analytics including article counts, total views, and member activity metrics.  Returns aggregated statistics computed from the underlying views. Results are cached for 5 minutes to reduce database load. — [getWorkspaceAnalytics (Procedure)](./procedures/getWorkspaceAnalytics.md)
- `inviteMember(workspaceId: String, email: String, role: WorkspaceRole?) → WorkspaceMember` *(mutation)* — Invite a new member to a workspace.  Sends an invitation email to the specified address. If the user already has an account, the invitation is linked immediately. Otherwise, a pending membership is created and fulfilled when the user signs up.  Only workspace OWNERs and ADMINs can invite new members. The invited user's role cannot exceed the inviter's role (e.g. an ADMIN cannot invite an OWNER). — [inviteMember (Procedure)](./procedures/inviteMember.md)
- `publishArticle(articleId: String) → Article` *(mutation)* — Publish an article, transitioning it from DRAFT to PUBLISHED.  Sets `publishedAt` to the current timestamp and makes the article visible to all readers. The article must be in DRAFT or IN_REVIEW status — already-published articles cannot be re-published (use `unpublishArticle` first).  Triggers notifications to all workspace members who have subscribed to the article's category. — [publishArticle (Procedure)](./procedures/publishArticle.md)
- `searchArticles(workspaceId: String, query: String, offset: Int?, limit: Int?) → Article[]` *(query)* — Search articles within a workspace by title and body content.  Performs a case-insensitive full-text search across the `title` and `body` fields of published articles. Results are ordered by relevance score (title matches ranked higher than body matches).  Supports pagination via `offset` and `limit`. Maximum `limit` is 100. — [searchArticles (Procedure)](./procedures/searchArticles.md)
- `unpublishArticle(articleId: String) → Article` *(mutation)* — Unpublish a live article, moving it back to DRAFT status.  The article becomes invisible to public readers but retains all its content, comments, and metadata. The `publishedAt` field is preserved for historical reference. — [unpublishArticle (Procedure)](./procedures/unpublishArticle.md)

### Generating test data

When creating seed data or test fixtures:

- Respect `@unique` constraints — duplicate values will cause insert failures
- Satisfy validation rules (see Constraints above)
- Provide all required foreign keys for relations
- Fields with `@default(...)` can be omitted — the database generates them
- Fields with `@computed` cannot be set — they are derived

### Understanding relationships

See the [relationships page](./relationships.md) for a full ER diagram and cross-reference table.

---

## Entity Reference

### Models

#### Article

```prisma
/// A long-form content article published within a workspace.
/// 
/// Articles are the primary content unit. They support a full editorial
/// workflow: authors create drafts, submit them for review, and editors
/// publish or request revisions.
/// 
/// The `body` field stores Markdown content. The `excerpt` is auto-generated
/// from the first 280 characters of the body if not explicitly set.
/// 
/// SEO metadata (`metaTitle`, `metaDescription`) is optional but
/// recommended for published articles. If omitted, the `title` and
/// `excerpt` are used as fallbacks by the frontend renderer.
/// 
/// Revision history is not modeled explicitly — the application layer
/// stores diffs in an append-only audit log (see `AuditLog`).
model Article with Timestamps, SoftDeletable {
    id String @id @default(cuid())
    /// Article headline displayed in listings and the article page.
    title String @length(1, 200)
    /// URL-safe article slug, unique within its workspace.
    slug String @length(2, 120) @regex('^[a-z0-9][a-z0-9-]*[a-z0-9]$') @lower
    /// Full article body in Markdown format.
    body String
    /// Short summary shown in listings and social media previews.
Auto-generated from `body` if not explicitly provided.
    excerpt String? @length(0, 500)
    /// Current editorial status. Controls visibility and edit permissions.
    status ArticleStatus @default(DRAFT)
    /// When the article was first published. Set automatically on the
DRAFT → PUBLISHED transition and never updated thereafter.
    publishedAt DateTime?
    /// Number of times the article has been viewed. Incremented by
the analytics middleware, not by the ORM.
    viewCount Int @default(0)
    /// Estimated reading time in minutes, computed from word count.
    readingTimeMin Int @computed
    /// Number of comments on this article.
    commentCount Int @computed
    /// SEO: custom page title for search engine results. Falls back
to `title` if not set.
    metaTitle String? @length(0, 70)
    /// SEO: meta description for search engine results. Falls back
to `excerpt` if not set.
    metaDescription String? @length(0, 160)
    /// Comma-separated list of tags for filtering and discovery.
    tags String?
    /// Whether the article is featured on the workspace homepage.
    featured Boolean @default(false)
    author User @relation(fields: [authorId], references: [id])
    authorId String
    workspace Workspace @relation(fields: [workspaceId], references: [id])
    workspaceId String
    category Category? @relation(fields: [categoryId], references: [id])
    categoryId String?
    comments Comment[]
    @@unique([slug, workspaceId])
    @@allow('read', status == 'PUBLISHED' || workspace.members?[user == auth()])
    @@allow('create', workspace.members?[user == auth()])
    @@allow('update', author == auth() || workspace.members?[role == 'ADMIN' || role == 'OWNER'])
    @@deny('update', status == 'IN_REVIEW' && author == auth())
    @@deny('delete', status == 'PUBLISHED')
    @@validate(publishedAt == null || status == 'PUBLISHED' || status == 'ARCHIVED', "publishedAt can only be set for published or archived articles")
    @@index([workspaceId, status])
    @@index([authorId])
    @@index([publishedAt])
    @@meta('doc:category', 'Content')
    @@meta('doc:since', '1.0')
}
```

Relationships:
- author → User (required)
- workspace → Workspace (required)
- category → Category (optional)
- comments → Comment (has many)

[Article (Model)](./models/Article.md)

#### AuditLog

```prisma
/// A record in the append-only audit log for compliance and debugging.
/// 
/// Every significant state change in the system generates an audit log
/// entry. Entries are immutable — they cannot be updated or deleted,
/// even by owners. The log is retained for 7 years per compliance
/// requirements.
/// 
/// The `payload` field stores a JSON snapshot of the changed fields
/// (before/after values). The `ipAddress` and `userAgent` fields are
/// captured for security forensics.
model AuditLog with Timestamps {
    id String @id @default(cuid())
    /// Machine-readable action identifier (e.g. `article.published`,
`member.invited`, `subscription.canceled`).
    action String @length(1, 100)
    /// Human-readable description of what changed.
    description String?
    /// JSON payload containing before/after field values.
    payload Json?
    /// IP address of the client that initiated the action.
    ipAddress String?
    /// User-Agent header from the originating request.
    userAgent String?
    /// ID of the user who performed the action. Null for system-initiated
events (e.g. scheduled jobs, webhook handlers).
    actorId String?
    /// Fully qualified resource identifier (e.g. `article:clx9abc123`).
    resourceId String?
    /// Resource type for filtering (e.g. `article`, `subscription`, `member`).
    resourceType String?
    @@allow('read', true)
    @@deny('create,update,delete', true)
    @@index([action])
    @@index([resourceType, resourceId])
    @@index([actorId])
    @@meta('doc:category', 'Audit')
    @@meta('doc:since', '1.0')
}
```

[AuditLog (Model)](./models/AuditLog.md)

#### Category

```prisma
/// A content category for organizing articles within a workspace.
/// 
/// Categories form a flat (non-hierarchical) taxonomy. Each workspace
/// can define its own categories. An article can belong to at most one
/// category. Categories without articles are hidden from the public
/// navigation but remain visible in the admin panel.
model Category with Timestamps {
    id String @id @default(cuid())
    /// Display name for the category, shown in navigation and filters.
    name String @length(1, 80)
    /// URL-safe identifier used in routes (`/blog/:categorySlug/:articleSlug`).
    slug String @length(2, 60) @regex('^[a-z0-9][a-z0-9-]*[a-z0-9]$') @lower
    /// Ordering weight for display. Lower values appear first.
Categories with equal weight are sorted alphabetically.
    sortOrder Int @default(0)
    /// Optional description shown at the top of the category listing page.
    description String?
    workspace Workspace @relation(fields: [workspaceId], references: [id])
    workspaceId String
    articles Article[]
    @@unique([slug, workspaceId])
    @@allow('read', true)
    @@allow('create,update,delete', workspace.members?[role == 'OWNER' || role == 'ADMIN'])
    @@index([workspaceId])
    @@meta('doc:category', 'Content')
    @@meta('doc:since', '1.0')
}
```

Relationships:
- workspace → Workspace (required)
- articles → Article (has many)

[Category (Model)](./models/Category.md)

#### Comment

```prisma
/// A threaded comment on an article.
/// 
/// Comments support one level of nesting via `parentId`. Top-level
/// comments have `parentId` set to null. Replies are displayed
/// in chronological order beneath their parent.
/// 
/// Soft-deletion is used so that reply threads remain coherent
/// even after a parent comment is removed. Deleted comments display
/// as "[deleted]" in the UI.
model Comment with Timestamps, SoftDeletable {
    id String @id @default(cuid())
    /// Comment body in Markdown format. Supports inline formatting
and `@mention` syntax for notifying other users.
    body String @length(1, 5000)
    /// Parent comment for threaded replies. Null for top-level comments.
    parent Comment? @relation("Replies", fields: [parentId], references: [id])
    parentId String?
    /// Replies to this comment.
    replies Comment[] @relation("Replies")
    author User @relation(fields: [authorId], references: [id])
    authorId String
    article Article @relation(fields: [articleId], references: [id])
    articleId String
    workspace Workspace @relation(fields: [workspaceId], references: [id])
    workspaceId String
    @@allow('read', article.status == 'PUBLISHED' || workspace.members?[user == auth()])
    @@allow('create', workspace.members?[user == auth()])
    @@allow('update', author == auth() && deletedAt == null)
    @@deny('delete', true)
    @@index([articleId])
    @@index([authorId])
    @@meta('doc:category', 'Content')
    @@meta('doc:since', '1.0')
}
```

Relationships:
- parent → Comment (optional)
- replies → Comment (has many)
- author → User (required)
- article → Article (required)
- workspace → Workspace (required)

[Comment (Model)](./models/Comment.md)

#### Invoice

```prisma
/// An invoice generated for a subscription billing cycle.
/// 
/// Invoices are created automatically by the billing system when a
/// subscription renews. They can also be created manually by admins
/// for one-off charges (e.g. overage fees, professional services).
/// 
/// The `paidAt` timestamp is set when payment is confirmed via the
/// Stripe `invoice.payment_succeeded` webhook. Invoices without
/// `paidAt` are considered outstanding.
model Invoice with Timestamps {
    id String @id @default(cuid())
    /// Sequential invoice number within the workspace, formatted as
`INV-YYYY-NNNN` (e.g. `INV-2025-0042`).
    invoiceNumber String @unique
    /// Invoice amount in the smallest currency unit.
    amountCents Int
    /// ISO 4217 currency code matching the subscription currency.
    currency String @default("usd") @length(3, 3) @lower
    /// When the invoice was fully paid. Null if outstanding or failed.
    paidAt DateTime?
    /// When the invoice payment was last attempted. Used to prevent
retrying too frequently.
    lastPaymentAttempt DateTime?
    /// Number of times payment has been attempted. Capped at 10 retries.
    paymentAttempts Int @default(0)
    /// Stripe invoice ID for reconciliation.
    stripeInvoiceId String? @unique
    /// Optional human-readable memo attached to the invoice.
    memo String?
    subscription Subscription @relation(fields: [subscriptionId], references: [id])
    subscriptionId String
    @@allow('read', subscription.workspace.members?[userId == auth().id])
    @@deny('update', paidAt != null)
    @@deny('delete', true)
    @@index([subscriptionId])
    @@index([invoiceNumber])
    @@validate(amountCents > 0, "Invoice amount must be positive")
    @@validate(paymentAttempts >= 0 && paymentAttempts <= 10, "Payment attempts must be between 0 and 10")
    @@meta('doc:category', 'Billing')
    @@meta('doc:since', '2.0')
}
```

Relationships:
- subscription → Subscription (required)

[Invoice (Model)](./models/Invoice.md)

#### Notification

```prisma
/// A notification delivered to a user.
/// 
/// Notifications are created by the application layer in response to
/// events (e.g. comment on your article, workspace invitation, payment
/// failure). They can be delivered across multiple channels based on
/// the user's `NotificationPreference` settings.
/// 
/// Notifications are never deleted — they are marked as read and
/// eventually archived by a background cleanup job after 90 days.
model Notification with Timestamps {
    id String @id @default(cuid())
    /// Machine-readable notification type for filtering and routing.
Convention: `resource.event` (e.g. `comment.created`, `invoice.failed`).
    type String @length(1, 80)
    /// Human-readable notification title shown in the notification center.
    title String @length(1, 200)
    /// Optional body text with additional context.
    body String?
    /// How the notification was delivered.
    channel NotificationChannel @default(IN_APP)
    /// Visual severity for UI treatment and delivery behavior.
    severity NotificationSeverity @default(INFO)
    /// Whether the user has seen/dismissed this notification.
    read Boolean @default(false)
    /// Deep link URL to the relevant resource in the application.
    actionUrl String? @url
    /// When the user dismissed or read the notification. Null if unread.
    readAt DateTime?
    recipient User @relation(fields: [recipientId], references: [id])
    recipientId String
    @@allow('read', recipient == auth())
    @@allow('update', recipient == auth())
    @@deny('create,delete', true)
    @@index([recipientId, read])
    @@index([recipientId, createdAt])
    @@meta('doc:category', 'Notifications')
    @@meta('doc:since', '2.0')
}
```

Relationships:
- recipient → User (required)

[Notification (Model)](./models/Notification.md)

#### NotificationPreference

```prisma
/// Per-user notification delivery preferences.
/// 
/// Each record controls whether a specific notification type is
/// delivered via a given channel. If no preference exists for a
/// type/channel combination, the system default applies:
/// - IN_APP: always on (cannot be disabled)
/// - EMAIL: on for CRITICAL, off for INFO/WARNING
/// - PUSH: off by default
/// 
/// Preferences are workspace-independent — they apply globally
/// to the user's account.
model NotificationPreference with Timestamps {
    id String @id @default(cuid())
    /// The notification type this preference applies to.
Use `*` as a wildcard to set defaults for all types.
    type String @length(1, 80)
    /// The delivery channel this preference controls.
    channel NotificationChannel
    /// Whether delivery via this channel is enabled.
    enabled Boolean @default(true)
    user User @relation(fields: [userId], references: [id])
    userId String
    @@unique([userId, type, channel])
    @@meta('doc:category', 'Notifications')
    @@meta('doc:since', '2.0')
}
```

Relationships:
- user → User (required)

[NotificationPreference (Model)](./models/NotificationPreference.md)

#### Subscription

```prisma
/// A subscription linking a workspace to a billing plan.
/// 
/// Each workspace can have at most one active subscription at a time.
/// When a workspace upgrades or downgrades, the current subscription
/// is canceled and a new one is created with the updated plan details.
/// 
/// Subscriptions integrate with Stripe via `stripeSubscriptionId`.
/// The `currentPeriodStart` and `currentPeriodEnd` fields are synced
/// from the Stripe webhook `invoice.paid` event and define the
/// window during which the workspace has access to paid features.
/// 
/// Canceled subscriptions retain access until `currentPeriodEnd`.
/// Past-due subscriptions enter a 7-day grace period before the
/// system downgrades the workspace to the free tier.
model Subscription with Timestamps {
    id String @id @default(cuid())
    /// Current lifecycle status of the subscription.
    status SubscriptionStatus @default(TRIALING)
    /// Human-readable plan name displayed in the billing UI.
    planName String @length(1, 100)
    /// Billing amount in the smallest currency unit (e.g. cents for USD).
Null during trial periods.
    priceAmountCents Int?
    /// ISO 4217 currency code for the subscription price.
    currency String @default("usd") @length(3, 3) @lower
    /// How often the subscription renews.
    billingInterval BillingInterval @default(MONTHLY)
    /// Start of the current billing period. Updated on each renewal.
    currentPeriodStart DateTime
    /// End of the current billing period. Access continues until this date
even after cancellation.
    currentPeriodEnd DateTime
    /// When the trial period ends. Null if the subscription started
without a trial.
    trialEndsAt DateTime?
    /// When the subscription was canceled by the user or system.
Null if the subscription has not been canceled.
    canceledAt DateTime?
    /// Stripe subscription ID for payment integration.
Used to reconcile webhook events with local records.
    stripeSubscriptionId String? @unique
    /// Stripe customer ID associated with this workspace's billing account.
    stripeCustomerId String?
    workspace Workspace @relation(fields: [workspaceId], references: [id])
    workspaceId String
    invoices Invoice[]
    @@allow('read', workspace.members?[userId == auth().id])
    @@allow('create,update', workspace.members?[role == 'OWNER'])
    @@deny('delete', status == 'ACTIVE')
    @@index([workspaceId])
    @@index([stripeSubscriptionId])
    @@meta('doc:category', 'Billing')
    @@meta('doc:since', '2.0')
}
```

Relationships:
- workspace → Workspace (required)
- invoices → Invoice (has many)

[Subscription (Model)](./models/Subscription.md)

#### User

```prisma
/// A registered user account in the platform.
/// 
/// Users authenticate via email/password or SSO. Each user belongs
/// to one or more workspaces through `WorkspaceMember` join records.
/// A user's `primaryEmail` is used for login and transactional emails;
/// additional email aliases can be added but are not modeled here.
/// 
/// The `displayName` is shown throughout the UI (comments, bylines,
/// mentions). The `handle` is the URL-safe unique identifier used in
/// `@mention` syntax and profile URLs.
model User with Timestamps, SoftDeletable {
    id String @id @default(cuid())
    /// Primary email address used for authentication and notifications.
Must be verified before the account is fully activated.
    primaryEmail String @unique @email
    /// User-facing display name shown in the UI. Can contain spaces,
emoji, and Unicode characters.
    displayName String @length(1, 120)
    /// URL-safe unique handle for mentions and profile URLs.
Lowercase alphanumeric and hyphens only. Immutable after first set.
    handle String @unique @length(3, 30) @regex('^[a-z0-9][a-z0-9-]*[a-z0-9]$') @lower
    /// URL to the user's profile avatar. Served via CDN with automatic
resizing. Falls back to Gravatar if not set.
    avatarUrl String? @url
    /// IANA timezone identifier for date/time localization.
    timezone String @default("UTC")
    /// ISO 639-1 language code for UI localization.
    locale String @default("en") @length(2, 10)
    /// Whether the user has completed email verification.
    emailVerified Boolean @default(false)
    /// When the user last logged in. Null if never logged in.
    lastLoginAt DateTime?
    memberships WorkspaceMember[]
    articles Article[]
    comments Comment[]
    notifications Notification[]
    notificationPreferences NotificationPreference[]
    @@allow('read', true)
    @@allow('update', this == auth())
    @@deny('update', deletedAt != null)
    @@deny('delete', true)
    @@index([primaryEmail])
    @@index([handle])
    @@meta('doc:category', 'Identity')
    @@meta('doc:since', '1.0')
}
```

Relationships:
- memberships → WorkspaceMember (has many)
- articles → Article (has many)
- comments → Comment (has many)
- notifications → Notification (has many)
- notificationPreferences → NotificationPreference (has many)

[User (Model)](./models/User.md)

#### Workspace

```prisma
/// A collaborative workspace that groups users, content, and billing.
/// 
/// Workspaces are the top-level tenant boundary. All content, billing,
/// and permissions are scoped to a workspace. A user can be a member of
/// multiple workspaces, each with a different role.
/// 
/// The workspace `slug` is used in URLs (`app.example.com/:slug`)
/// and must be globally unique. Once set, it can only be changed by
/// an OWNER — and the old slug is reserved for 30 days to prevent
/// broken links.
model Workspace with Timestamps {
    id String @id @default(cuid())
    /// Human-readable workspace name. Displayed in the sidebar,
page titles, and email subjects.
    name String @length(2, 100)
    /// URL-safe workspace identifier used in routing.
Lowercase alphanumeric and hyphens only. Globally unique.
    slug String @unique @length(3, 40) @regex('^[a-z0-9][a-z0-9-]*[a-z0-9]$') @lower
    /// Optional longer description shown on the workspace settings page.
    description String?
    /// URL to the workspace logo. Displayed in the sidebar and
public-facing pages. Recommended size: 256x256px.
    logoUrl String? @url
    /// Maximum number of members allowed. Enforced at the application
layer. Null means unlimited (enterprise plans only).
    memberLimit Int?
    /// Whether the workspace is on a paid plan with active billing.
Free-tier workspaces have reduced limits on storage and members.
    isPaid Boolean @default(false)
    members WorkspaceMember[]
    subscriptions Subscription[]
    articles Article[]
    categories Category[]
    comments Comment[]
    @@allow('read', members?[user == auth()])
    @@allow('update', members?[role == 'OWNER' || role == 'ADMIN'])
    @@deny('delete', subscriptions?[status == 'ACTIVE'])
    @@index([slug])
    @@meta('doc:category', 'Identity')
    @@meta('doc:since', '1.0')
}
```

Relationships:
- members → WorkspaceMember (has many)
- subscriptions → Subscription (has many)
- articles → Article (has many)
- categories → Category (has many)
- comments → Comment (has many)

[Workspace (Model)](./models/Workspace.md)

#### WorkspaceMember

```prisma
/// Represents a user's membership in a workspace with an assigned role.
/// 
/// This is the join table between User and Workspace. A user can have
/// at most one membership per workspace. The `role` determines what
/// the user can see and do within that workspace.
/// 
/// When a user is invited, a membership record is created with
/// `joinedAt` set to null. It is populated when the user accepts
/// the invitation.
model WorkspaceMember with Timestamps {
    id String @id @default(cuid())
    /// The role assigned to this member within the workspace.
Determines permissions for content, settings, and billing.
    role WorkspaceRole @default(MEMBER)
    /// When the member formally accepted the invitation.
Null indicates a pending invitation.
    joinedAt DateTime?
    /// Optional title or job function shown on the member's
workspace profile (e.g. "Senior Engineer", "Content Lead").
    title String? @length(0, 100)
    user User @relation(fields: [userId], references: [id])
    userId String
    workspace Workspace @relation(fields: [workspaceId], references: [id])
    workspaceId String
    @@unique([userId, workspaceId])
    @@allow('read', workspace.members?[user == auth()])
    @@allow('create', workspace.members?[role == 'OWNER' || role == 'ADMIN'])
    @@allow('update', workspace.members?[role == 'OWNER' || role == 'ADMIN'])
    @@deny('delete', role == 'OWNER')
    @@meta('doc:category', 'Identity')
    @@meta('doc:since', '1.0')
}
```

Relationships:
- user → User (required)
- workspace → Workspace (required)

[WorkspaceMember (Model)](./models/WorkspaceMember.md)

### Enums

#### ArticleStatus

```prisma
/// Lifecycle status of a published article.
/// 
/// Content follows a linear publishing workflow:
/// DRAFT → IN_REVIEW → PUBLISHED → ARCHIVED
/// Articles can return from ARCHIVED to DRAFT for re-publishing.
enum ArticleStatus {
    /// Initial state. Only visible to the author and workspace admins.
    DRAFT
    /// Submitted for editorial review. Locked from further edits by the author.
    IN_REVIEW
    /// Live and publicly accessible (subject to workspace visibility settings).
    PUBLISHED
    /// Removed from public listings but still accessible via direct URL.
Can be moved back to DRAFT for revision.
    ARCHIVED
}
```

[ArticleStatus (Enum)](./enums/ArticleStatus.md)

#### BillingInterval

```prisma
/// Billing interval for subscription plans.
/// 
/// All plans offer both monthly and annual billing. Annual billing
/// provides a ~17% discount compared to monthly. Enterprise plans
/// use custom invoicing and are not tied to a standard interval.
enum BillingInterval {
    /// Billed on the same day each month.
    MONTHLY
    /// Billed once per year. Includes two months free vs. monthly.
    ANNUAL
}
```

[BillingInterval (Enum)](./enums/BillingInterval.md)

#### NotificationChannel

```prisma
/// Delivery channel for user notifications.
/// 
/// Users can configure per-channel preferences for each notification type.
/// EMAIL and PUSH are opt-in; IN_APP is always enabled and cannot be disabled.
enum NotificationChannel {
    /// Displayed in the notification center within the application.
    IN_APP
    /// Sent to the user's primary email address.
    EMAIL
    /// Delivered via browser or mobile push notification.
    PUSH
}
```

[NotificationChannel (Enum)](./enums/NotificationChannel.md)

#### NotificationSeverity

```prisma
/// Severity level of a notification.
/// 
/// Determines visual treatment and default delivery behavior.
/// CRITICAL notifications bypass "Do Not Disturb" settings.
enum NotificationSeverity {
    /// Informational. No action required.
    INFO
    /// Requires attention but is not urgent.
    WARNING
    /// Requires immediate action. Bypasses DND settings.
    CRITICAL
}
```

[NotificationSeverity (Enum)](./enums/NotificationSeverity.md)

#### SubscriptionStatus

```prisma
/// Current status of a subscription lifecycle.
/// 
/// Subscriptions follow this state machine:
/// TRIALING → ACTIVE → (PAST_DUE → ACTIVE | CANCELED) → CANCELED
/// Canceled subscriptions remain accessible until the period end date.
enum SubscriptionStatus {
    /// Free trial period. Full feature access, no payment method required.
    TRIALING
    /// Paid and active. All plan features available.
    ACTIVE
    /// Payment failed. A 7-day grace period allows retry before suspension.
    PAST_DUE
    /// Terminated by user or system. Read-only access until period end.
    CANCELED
}
```

[SubscriptionStatus (Enum)](./enums/SubscriptionStatus.md)

#### WorkspaceRole

```prisma
/// Defines the access level of a user within a workspace.
/// 
/// Roles follow a strict hierarchy: OWNER > ADMIN > MEMBER > VIEWER.
/// Higher roles inherit all permissions of lower roles. The OWNER role
/// cannot be assigned — it is granted automatically to the workspace creator.
enum WorkspaceRole {
    /// Full control over workspace settings, billing, and member management.
Automatically assigned to the workspace creator. Cannot be revoked.
    OWNER
    /// Can manage members, integrations, and most workspace settings.
Cannot modify billing or transfer ownership.
    ADMIN
    /// Standard access to workspace resources. Can create and edit
their own content, comment on others' content, and participate
in workflows.
    MEMBER
    /// Read-only access. Can view content and download exports
but cannot create, edit, or comment.
    VIEWER
}
```

[WorkspaceRole (Enum)](./enums/WorkspaceRole.md)

### Types

#### SoftDeletable

```prisma
/// Adds soft-delete capability to a model.
/// 
/// Soft-deleted records are excluded from default queries via
/// access policies. The `deletedAt` timestamp is used for
/// data retention compliance — records older than the
/// configured retention window are permanently purged by a
/// background job.
type SoftDeletable {
    /// When the record was soft-deleted, or null if active.
    deletedAt DateTime?
    /// The ID of the user who performed the deletion, for audit purposes.
    deletedBy String?
}
```

[SoftDeletable (Type)](./types/SoftDeletable.md)

#### Timestamps

```prisma
/// Standard timestamp fields applied to all persistent entities.
/// 
/// `createdAt` is set once on insert and never modified.
/// `updatedAt` is bumped automatically by the ORM on every write.
/// Downstream consumers (analytics, sync) rely on `updatedAt`
/// for incremental change detection.
type Timestamps {
    /// When the record was first created. Immutable after insert.
    createdAt DateTime @default(now())
    /// When the record was last modified. Updated automatically.
    updatedAt DateTime @updatedAt
}
```

[Timestamps (Type)](./types/Timestamps.md)

#### WorkspaceAnalytics

```prisma
/// Aggregated workspace-level analytics returned by `getWorkspaceAnalytics`.
/// 
/// This type is not persisted — it is computed on demand from
/// the underlying Article, Comment, and WorkspaceMember tables.
type WorkspaceAnalytics {
    /// Total number of articles in the workspace (all statuses).
    totalArticles Int
    /// Number of currently published articles.
    publishedArticles Int
    /// Sum of `viewCount` across all published articles.
    totalViews Int
    /// Number of active workspace members (accepted invitation).
    activeMemberCount Int
}
```

[WorkspaceAnalytics (Type)](./types/WorkspaceAnalytics.md)

### Views

#### ArticleAnalytics

```prisma
/// Aggregated article metrics for the workspace analytics dashboard.
/// 
/// Backed by a SQL view that joins Article, Comment, and User.
/// Refreshed on each query — not materialized. For high-traffic
/// workspaces, consider caching at the application layer.
view ArticleAnalytics {
    articleId String
    /// Title of the article.
    title String
    /// Current editorial status.
    status String
    /// Display name of the author.
    authorName String
    /// Total number of views.
    viewCount Int
    /// Total number of comments.
    commentCount Int
    /// When the article was published, or null if unpublished.
    publishedAt DateTime?
    /// Days since publication. Null for unpublished articles.
    daysSincePublished Int?
}
```

[ArticleAnalytics (View)](./views/ArticleAnalytics.md)

#### MemberActivity

```prisma
/// Per-member activity summary for workspace admin dashboards.
/// 
/// Shows each member's contribution metrics: articles written,
/// comments posted, and last activity timestamp. Useful for
/// identifying inactive members and top contributors.
view MemberActivity {
    userId String
    /// Display name of the member.
    displayName String
    /// The member's role in the workspace.
    role String
    /// Total articles authored by this member.
    articleCount Int
    /// Total comments posted by this member.
    commentCount Int
    /// When the member last created or updated content.
    lastActiveAt DateTime?
}
```

[MemberActivity (View)](./views/MemberActivity.md)

---

## Detailed Documentation

For Mermaid diagrams, formatted tables, and fully cross-linked pages:

- [Full schema index](./index.md)
- [Relationships and ER diagrams](./relationships.md)
