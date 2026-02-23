---
name: schema-documentation-schema
description: Schema reference for Schema Documentation. Use when writing queries, building forms, creating or modifying models, generating API endpoints, writing tests with seed data, or reasoning about data access and validation in this project.
---

# Schema Documentation — Schema Skill

This skill provides the data schema context for Schema Documentation. Consult it whenever you need to understand the data model, write type-safe code against it, or respect its constraints.

## Schema Overview

This schema contains 9 models, 3 views, 2 types, 3 enums, 7 procedures.

Entities:
- **Activity** (Model) — Records significant events for audit and activity feed purposes.
- **Comment** (Model) — A comment on a task. Comments do not have descriptions intentionally
- **Organization** (Model) — An organization is the top-level tenant in the system.
- **Project** (Model) — A project organizes tasks under a team within an organization.
- **ProjectTaskSummary** (View) — Aggregated task metrics per project for analytics dashboards.
- **Tag** (Model) — A label that can be attached to tasks and projects for categorization.
- **Task** (Model) — A unit of work within a project.
- **Team** (Model) — A team groups users within an organization for project collaboration.
- **TeamMember** (Model) — Represents a user's membership in a team with a specific role.
- **User** (Model) — A registered user in the platform.
- **UserLeaderboard** (View) — Leaderboard view ranking users by completed task count.
- **UserProfile** (View) — Flattened user profile for reporting dashboards.

## Conventions

Follow these patterns when working with this schema:

- **IDs**: Most models use `@default(cuid())` for IDs. Exceptions: 1 use `uuid()`.
- **Mixins** (shared field sets applied via `with`):
  - **Timestamps** (`createdAt`, `updatedAt`) — used by Organization, User, Team, TeamMember, Project, Task, Comment, Activity
- **Computed fields** are read-only and derived at the database level. Never set them directly:
  - Organization.memberCount — Total number of users across all teams.
  - User.taskCount
  - Project.taskCount — Total number of tasks in this project.
  - Project.completionRate — Percentage of completed tasks (0.0–1.0).
  - Project.hasOverdueTasks — Whether the project has any tasks past their due date.
  - Task.commentCount — Number of comments on this task.
- **Relations**: 9 of 9 models have relationships. When creating records, always provide required foreign key fields (e.g. `organizationId`, `userId`, `teamId`).

## Constraints You Must Respect

### Access Policies

ZenStack enforces these rules at the ORM level. Your code does not need to re-implement them, but you must be aware of them when reasoning about what operations will succeed or fail.

> Some rules reference `auth()` — the currently authenticated user. Operations that require `auth()` will fail for unauthenticated requests.

**Activity**: allow('read', true) · deny('update,delete', true)

**Comment**: allow('read', true) · allow('create', true) · allow('update,delete', author == auth())

**Organization**: allow('read', true) · allow('update,delete', users?[role == 'OWNER'])

**Project**: allow('read', true) · allow('create,update', true) · deny('delete', archived)

**Task**: allow('read', true) · allow('create,update', true) · deny('delete', status == 'DONE')

**Team**: allow('read', true) · allow('create,update,delete', members?[role == 'ADMIN' || role == 'OWNER'])

**TeamMember**: allow('read', true)

**User**: allow('read', true) · allow('update', this == auth()) · deny('delete', role == 'OWNER')

### Validation

These constraints are enforced at the schema level. When generating test data, seed scripts, or form inputs, produce values that satisfy them.

- **Organization**: name: @length(2, 100), slug: @length(3, 40), email: @email
- **Project**: name: @length(1, 100)
- **Tag**: name: @length(1, 50)
- **Task**: title: @length(1, 200), title: @trim, slug: @regex('^[a-z0-9-]+$'), estimatedHours: @gt(0), estimatedHours: @lte(1000)
- **Team**: name: @length(1, 80)
- **User**: email: @email, name: @length(1, 120), avatarUrl: @url

## How To Use This Schema

### Writing queries or mutations

1. Find the model in the Entity Reference below
2. Check its fields for types, optionality, and defaults
3. Check access policies — will the operation be allowed for the current user?
4. Check validation — will the input values pass schema-level validation?
5. For full field details, follow the entity documentation link

### Calling procedures

This schema defines server-side procedures. Use them instead of writing raw queries when available:

- `archiveProject(projectId: String) → Project` *(mutation)* — Archive a project and all its tasks. — [archiveProject (Procedure)](./procedures/archiveProject.md)
- `bulkUpdateTaskStatus(taskIds: String[], status: TaskStatus) → Void` *(mutation)* — Bulk-update the status of multiple tasks at once. — [bulkUpdateTaskStatus (Procedure)](./procedures/bulkUpdateTaskStatus.md)
- `createAndAssignTask(title: String, projectId: String, assigneeId: String?, priority: Priority?) → Task` *(mutation)* — Create a new task and assign it to a user in one step. — [createAndAssignTask (Procedure)](./procedures/createAndAssignTask.md)
- `getProjectStats(projectId: String) → ProjectStats` *(query)* — Get aggregated statistics for a project. — [getProjectStats (Procedure)](./procedures/getProjectStats.md)
- `getUser(id: String) → User` *(query)* — Retrieve a user by their unique identifier. — [getUser (Procedure)](./procedures/getUser.md)
- `listOrgUsers(organizationId: String) → User[]` *(query)* — List all users belonging to a given organization. — [listOrgUsers (Procedure)](./procedures/listOrgUsers.md)
- `signUp(email: String, name: String, role: Role?) → User` *(mutation)* — Register a new user in the platform. Creates the user record and sends a welcome email. — [signUp (Procedure)](./procedures/signUp.md)

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

#### Activity

```prisma
/// Records significant events for audit and activity feed purposes.
model Activity with Timestamps {
    id String @id @default(uuid())
    action String
    detail String?
    user User @relation(fields: [userId], references: [id])
    userId String
    task Task? @relation(fields: [taskId], references: [id])
    taskId String?
    @@allow('read', true)
    @@deny('update,delete', true)
    @@meta('doc:category', 'Audit')
    @@meta('doc:since', '2.0')
}
```

Relationships:
- user → User (required)
- task → Task (optional)

[Activity (Model)](./models/Activity.md)

#### Comment

```prisma
/// A comment on a task. Comments do not have descriptions intentionally
/// to test the plugin's handling of undocumented fields.
model Comment with Timestamps {
    id String @id @default(cuid())
    body String
    task Task @relation(fields: [taskId], references: [id])
    taskId String
    author User @relation(fields: [authorId], references: [id])
    authorId String
    @@allow('read', true)
    @@allow('create', true)
    @@allow('update,delete', author == auth())
    @@meta('doc:category', 'Work')
}
```

Relationships:
- task → Task (required)
- author → User (required)

[Comment (Model)](./models/Comment.md)

#### Organization

```prisma
/// An organization is the top-level tenant in the system.
/// All users, teams, and projects belong to exactly one organization.
model Organization with Timestamps {
    id String @id @default(cuid())
    /// The public display name of the organization.
    name String @length(2, 100)
    /// URL-safe identifier used in routing.
    slug String @unique @length(3, 40)
    /// Primary contact email for the organization.
    email String? @email
    /// Total number of users across all teams.
    memberCount Int @computed
    users User[]
    teams Team[]
    projects Project[]
    @@allow('read', true)
    @@allow('update,delete', users?[role == 'OWNER'])
    @@index([slug])
    @@meta('doc:category', 'Core')
    @@meta('doc:since', '1.0')
}
```

Relationships:
- users → User (has many)
- teams → Team (has many)
- projects → Project (has many)

[Organization (Model)](./models/Organization.md)

#### Project

```prisma
/// A project organizes tasks under a team within an organization.
model Project with Timestamps {
    id String @id @default(cuid())
    /// The project name.
    name String @length(1, 100)
    /// Detailed description of the project scope and goals.
    description String?
    archived Boolean @default(false)
    /// Total number of tasks in this project.
    taskCount Int @computed
    /// Percentage of completed tasks (0.0–1.0).
    completionRate Float @computed
    /// Whether the project has any tasks past their due date.
    hasOverdueTasks Boolean @computed
    organization Organization @relation(fields: [organizationId], references: [id])
    organizationId String
    team Team? @relation(fields: [teamId], references: [id])
    teamId String?
    tasks Task[]
    tags Tag[]
    @@allow('read', true)
    @@allow('create,update', true)
    @@deny('delete', archived)
    @@index([organizationId])
    @@meta('doc:category', 'Work')
    @@meta('doc:since', '1.0')
}
```

Relationships:
- organization → Organization (required)
- team → Team (optional)
- tasks → Task (has many)
- tags → Tag (has many)

[Project (Model)](./models/Project.md)

#### Tag

```prisma
/// A label that can be attached to tasks and projects for categorization.
model Tag {
    id String @id @default(cuid())
    name String @unique @length(1, 50)
    color String?
    tasks Task[]
    projects Project[]
}
```

Relationships:
- tasks → Task (has many)
- projects → Project (has many)

[Tag (Model)](./models/Tag.md)

#### Task

```prisma
/// A unit of work within a project.
/// Tasks support self-referential parent/child hierarchy for sub-tasks.
model Task with Timestamps {
    id String @id @default(cuid())
    /// Short summary of the task.
    title String @length(1, 200) @trim
    /// Rich-text body with full details.
    body String?
    /// Unique slug for URL-friendly references.
    slug String? @regex('^[a-z0-9-]+$')
    status TaskStatus @default(TODO)
    priority Priority @default(MEDIUM)
    dueDate DateTime?
    /// Estimated effort in hours.
    estimatedHours Float? @gt(0) @lte(1000)
    /// Number of comments on this task.
    commentCount Int @computed
    project Project @relation(fields: [projectId], references: [id])
    projectId String
    assignee User? @relation(fields: [assigneeId], references: [id])
    assigneeId String?
    /// Parent task — allows nesting sub-tasks.
    parent Task? @relation("SubTasks", fields: [parentId], references: [id])
    parentId String?
    children Task[] @relation("SubTasks")
    comments Comment[]
    tags Tag[]
    activities Activity[]
    @@allow('read', true)
    @@allow('create,update', true)
    @@deny('delete', status == 'DONE')
    @@validate(estimatedHours == null || estimatedHours > 0, "Estimated hours must be positive when set")
    @@index([projectId])
    @@index([assigneeId])
    @@meta('doc:category', 'Work')
    @@meta('doc:since', '1.0')
}
```

Relationships:
- project → Project (required)
- assignee → User (optional)
- parent → Task (optional)
- children → Task (has many)
- comments → Comment (has many)
- tags → Tag (has many)
- activities → Activity (has many)

[Task (Model)](./models/Task.md)

#### Team

```prisma
/// A team groups users within an organization for project collaboration.
model Team with Timestamps {
    id String @id @default(cuid())
    /// Team display name.
    name String @length(1, 80)
    /// Optional description of the team's purpose.
    description String?
    organization Organization @relation(fields: [organizationId], references: [id])
    organizationId String
    members TeamMember[]
    projects Project[]
    @@allow('read', true)
    @@allow('create,update,delete', members?[role == 'ADMIN' || role == 'OWNER'])
    @@meta('doc:category', 'Identity')
    @@meta('doc:since', '1.0')
}
```

Relationships:
- organization → Organization (required)
- members → TeamMember (has many)
- projects → Project (has many)

[Team (Model)](./models/Team.md)

#### TeamMember

```prisma
/// Represents a user's membership in a team with a specific role.
model TeamMember with Timestamps {
    id String @id @default(cuid())
    user User @relation(fields: [userId], references: [id])
    userId String
    team Team @relation(fields: [teamId], references: [id])
    teamId String
    role Role @default(MEMBER)
    @@unique([userId, teamId])
    @@allow('read', true)
    @@meta('doc:category', 'Identity')
}
```

Relationships:
- user → User (required)
- team → Team (required)

[TeamMember (Model)](./models/TeamMember.md)

#### User

```prisma
/// A registered user in the platform.
/// Users belong to an organization and may be members of multiple teams.
model User with Timestamps {
    id String @id @default(cuid())
    /// Email address used for login.
    email String @unique @email
    /// Full name displayed in the UI.
    name String @length(1, 120)
    /// URL to the user's avatar image.
    avatarUrl String? @url
    role Role @default(MEMBER)
    taskCount Int @computed
    organization Organization @relation(fields: [organizationId], references: [id])
    organizationId String
    memberships TeamMember[]
    assignedTasks Task[]
    comments Comment[]
    activities Activity[]
    @@allow('read', true)
    @@allow('update', this == auth())
    @@deny('delete', role == 'OWNER')
    @@index([email])
    @@unique([email, organizationId])
    @@meta('doc:category', 'Identity')
    @@meta('doc:since', '1.0')
}
```

Relationships:
- organization → Organization (required)
- memberships → TeamMember (has many)
- assignedTasks → Task (has many)
- comments → Comment (has many)
- activities → Activity (has many)

[User (Model)](./models/User.md)

### Enums

#### Priority

```prisma
/// Priority levels for tasks.
enum Priority {
    LOW
    MEDIUM
    HIGH
    CRITICAL
}
```

[Priority (Enum)](./enums/Priority.md)

#### Role

```prisma
/// Defines the access level of a user within an organization.
enum Role {
    /// Full administrative access — can manage billing, members, and settings.
    OWNER
    /// Can manage projects and team members.
    ADMIN
    /// Standard team member with project access.
    MEMBER
    /// View-only access to public resources.
    GUEST
}
```

[Role (Enum)](./enums/Role.md)

#### TaskStatus

```prisma
/// Lifecycle status of a task.
enum TaskStatus {
    /// Waiting to be started.
    TODO
    /// Actively being worked on.
    IN_PROGRESS
    /// Submitted for peer review.
    IN_REVIEW
    /// Completed and closed.
    DONE
}
```

[TaskStatus (Enum)](./enums/TaskStatus.md)

### Types

#### ProjectStats

```prisma
/// Aggregated statistics for a project dashboard.
type ProjectStats {
    taskCount Int
    completedCount Int
    memberCount Int
}
```

[ProjectStats (Type)](./types/ProjectStats.md)

#### Timestamps

```prisma
type Timestamps {
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt
}
```

[Timestamps (Type)](./types/Timestamps.md)

### Views

#### ProjectTaskSummary

```prisma
/// Aggregated task metrics per project for analytics dashboards.
view ProjectTaskSummary {
    projectId String
    /// Name of the project.
    projectName String
    totalTasks Int
    completedTasks Int
    openTasks Int
    /// Average days to completion for finished tasks.
    avgDaysToClose Float
}
```

[ProjectTaskSummary (View)](./views/ProjectTaskSummary.md)

#### UserLeaderboard

```prisma
/// Leaderboard view ranking users by completed task count.
view UserLeaderboard {
    userId String
    userName String
    completedTasks Int
    rank Int
}
```

[UserLeaderboard (View)](./views/UserLeaderboard.md)

#### UserProfile

```prisma
/// Flattened user profile for reporting dashboards.
/// Backed by a SQL view joining User, Organization, and TeamMember.
view UserProfile {
    id Int
    /// Full name of the user.
    name String
    /// Email address of the user.
    email String
    /// Name of the organization the user belongs to.
    organizationName String
    /// Number of teams the user is a member of.
    teamCount Int
}
```

[UserProfile (View)](./views/UserProfile.md)

---

## Detailed Documentation

For Mermaid diagrams, formatted tables, and fully cross-linked pages:

- [Full schema index](./index.md)
- [Relationships and ER diagrams](./relationships.md)
