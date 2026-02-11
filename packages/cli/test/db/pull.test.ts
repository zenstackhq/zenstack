import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createProject, getDefaultPrelude, getTestDbName, getTestDbUrl, runCli } from '../utils';
import { formatDocument } from '@zenstackhq/language';
import { getTestDbProvider } from '@zenstackhq/testtools';

const getSchema = (workDir: string) => fs.readFileSync(path.join(workDir, 'zenstack/schema.zmodel')).toString();

describe('DB pull - Common features (all providers)', () => {
    describe('Pull from zero - restore complete schema from database', () => {
        it('should restore basic schema with all supported types', async () => {
            const { workDir, schema } = await createProject(
                `model User {
    id         Int      @id @default(autoincrement())
    email      String   @unique
    name       String?
    age        Int      @default(0)
    balance    Decimal  @default(0.00)
    isActive   Boolean  @default(true)
    bigCounter BigInt   @default(0)
    score      Float    @default(0.0)
    bio        String?
    avatar     Bytes?
    metadata   Json?
    createdAt  DateTime @default(now())
    updatedAt  DateTime @updatedAt
}`,
            );
            runCli('db push', workDir);

            // Store the schema after db push (this is what provider names will be)
            const schemaFile = path.join(workDir, 'zenstack/schema.zmodel');

            // Remove schema content to simulate restoration from zero
            fs.writeFileSync(schemaFile, getDefaultPrelude());

            // Pull should fully restore the schema
            runCli('db pull --indent 4', workDir);

            const restoredSchema = getSchema(workDir);
            expect(restoredSchema).toEqual(schema);
        });

        it('should restore schema with relations', async () => {
            const { workDir, schema } = await createProject(
                `model Post {
    id       Int    @id @default(autoincrement())
    title    String
    author   User   @relation(fields: [authorId], references: [id], onDelete: Cascade)
    authorId Int
}

model User {
    id    Int    @id @default(autoincrement())
    email String @unique
    posts Post[]
}`,
            );
            runCli('db push', workDir);

            const schemaFile = path.join(workDir, 'zenstack/schema.zmodel');

            fs.writeFileSync(schemaFile, getDefaultPrelude());
            runCli('db pull --indent 4', workDir);

            const restoredSchema = getSchema(workDir);
            expect(restoredSchema).toEqual(schema);
        });

        it('should restore schema with many-to-many relations', async () => {
            const { workDir, schema } = await createProject(
                `model Post {
    id   Int       @id @default(autoincrement())
    title String
    postTags PostTag[]
}

model PostTag {
    post   Post @relation(fields: [postId], references: [id], onDelete: Cascade)
    postId Int
    tag    Tag  @relation(fields: [tagId], references: [id], onDelete: Cascade)
    tagId  Int

    @@id([postId, tagId])
}

model Tag {
    id    Int       @id @default(autoincrement())
    name  String    @unique
    postTags PostTag[]
}`,
            );
            runCli('db push', workDir);

            const schemaFile = path.join(workDir, 'zenstack/schema.zmodel');

            fs.writeFileSync(schemaFile, getDefaultPrelude());
            runCli('db pull --indent 4', workDir);

            const restoredSchema = getSchema(workDir);
            expect(restoredSchema).toEqual(schema);
        });

        it('should restore self-referencing model with multiple FK columns without duplicate fields', async () => {
            const { workDir, schema } = await createProject(
                `model Category {
    id               Int       @id @default(autoincrement())
    categoryParentId Category? @relation('Category_parentIdToCategory', fields: [parentId], references: [id])
    parentId Int?
    categoryBuddyId    Category?  @relation('Category_buddyIdToCategory', fields: [buddyId], references: [id])
    buddyId  Int?
    categoryMentorId   Category?  @relation('Category_mentorIdToCategory', fields: [mentorId], references: [id])
    mentorId Int?
    categoryParentIdToCategoryId Category[] @relation('Category_parentIdToCategory')
    categoryBuddyIdToCategoryId  Category[] @relation('Category_buddyIdToCategory')
    categoryMentorIdToCategoryId  Category[] @relation('Category_mentorIdToCategory')
}`,
            );
            runCli('db push', workDir);

            const schemaFile = path.join(workDir, 'zenstack/schema.zmodel');

            fs.writeFileSync(schemaFile, getDefaultPrelude());
            runCli('db pull --indent 4', workDir);

            const restoredSchema = getSchema(workDir);

            expect(restoredSchema).toEqual(schema);
        });

        it('should preserve self-referencing model with multiple FK columns', async () => {
            const { workDir, schema } = await createProject(
                `model Category {
    id               Int       @id @default(autoincrement())
    category Category? @relation('Category_parentIdToCategory', fields: [parentId], references: [id])
    parentId Int?
    buddy    Category?  @relation('Category_buddyIdToCategory', fields: [buddyId], references: [id])
    buddyId  Int?
    mentor   Category?  @relation('Category_mentorIdToCategory', fields: [mentorId], references: [id])
    mentorId Int?
    categories Category[] @relation('Category_parentIdToCategory')
    buddys  Category[] @relation('Category_buddyIdToCategory')
    mentees  Category[] @relation('Category_mentorIdToCategory')
}`,
            );
            runCli('db push', workDir);
            runCli('db pull --indent 4', workDir);

            const restoredSchema = getSchema(workDir);

            expect(restoredSchema).toEqual(schema);
        });

        it('should restore one-to-one relation when FK is the single-column primary key', async () => {
            const { workDir, schema } = await createProject(
                `model Profile {
    user User   @relation(fields: [id], references: [id], onDelete: Cascade)
    id   Int    @id @default(autoincrement())
    bio  String?
}

model User {
    id      Int      @id @default(autoincrement())
    email   String   @unique
    profile Profile?
}`,
            );
            runCli('db push', workDir);

            const schemaFile = path.join(workDir, 'zenstack/schema.zmodel');

            fs.writeFileSync(schemaFile, getDefaultPrelude());
            runCli('db pull --indent 4', workDir);

            const restoredSchema = getSchema(workDir);
            expect(restoredSchema).toEqual(schema);
        });

        it('should restore schema with indexes and unique constraints', async () => {
            const { workDir, schema } = await createProject(
                `model User {
    id        Int      @id @default(autoincrement())
    email     String   @unique
    username  String
    firstName String
    lastName  String
    role      String

    @@unique([username, email])
    @@index([role])
    @@index([firstName, lastName])
    @@index([email, username, role])
}`,
            );
            runCli('db push', workDir);

            const schemaFile = path.join(workDir, 'zenstack/schema.zmodel');

            fs.writeFileSync(schemaFile, getDefaultPrelude());
            runCli('db pull --indent 4', workDir);

            const restoredSchema = getSchema(workDir);
            expect(restoredSchema).toEqual(schema);
        });

        it('should restore schema with composite primary keys', async () => {
            const { workDir, schema } = await createProject(
                `model UserRole {
    userId String
    role   String
    grantedAt DateTime @default(now())

    @@id([userId, role])
}`,
            );
            runCli('db push', workDir);

            const schemaFile = path.join(workDir, 'zenstack/schema.zmodel');

            fs.writeFileSync(schemaFile, getDefaultPrelude());
            runCli('db pull --indent 4', workDir);

            const restoredSchema = getSchema(workDir);
            expect(restoredSchema).toEqual(schema);
        });

        it('should preserve Decimal and Float default value precision', async () => {
            const { workDir, schema } = await createProject(
                `model Product {
    id          Int     @id @default(autoincrement())
    price       Decimal @default(99.99)
    discount    Decimal @default(0.50)
    taxRate     Decimal @default(7.00)
    weight      Float   @default(1.5)
    rating      Float   @default(4.0)
    temperature Float   @default(98.6)
}`,
            );
            runCli('db push', workDir);

            const schemaFile = path.join(workDir, 'zenstack/schema.zmodel');

            fs.writeFileSync(schemaFile, getDefaultPrelude());
            runCli('db pull --indent 4', workDir);

            const restoredSchema = getSchema(workDir);
            expect(restoredSchema).toEqual(schema);
        });

    });

    describe('Pull with existing schema - preserve schema features', () => {
        it('should preserve field and table mappings', async () => {
            const { workDir, schema } = await createProject(
                `model User {
    id         Int    @id @default(autoincrement())
    email      String @unique @map('email_address')
    firstName  String @map('first_name')
    lastName   String @map('last_name')

    @@map('users')
}`,
            );
            runCli('db push', workDir);

            runCli('db pull --indent 4', workDir);

            expect(getSchema(workDir)).toEqual(schema);
        });

        it('should not modify a comprehensive schema with all features', async () => {
            const { workDir, schema } = await createProject(`model User {
    id             Int      @id @default(autoincrement())
    email          String   @unique @map('email_address')
    name           String?  @default('Anonymous')
    role           Role     @default(USER)
    profile        Profile?
    shared_profile Profile? @relation('shared')
    posts          Post[]
    createdAt      DateTime @default(now())
    updatedAt      DateTime @updatedAt
    jsonData       Json?
    balance        Decimal  @default(0.00)
    isActive       Boolean  @default(true)
    bigCounter     BigInt   @default(0)
    bytes          Bytes?

    @@index([role])
    @@map('users')
}

model Profile {
    id            Int     @id @default(autoincrement())
    user          User    @relation(fields: [userId], references: [id], onDelete: Cascade)
    userId        Int     @unique
    user_shared   User    @relation('shared', fields: [shared_userId], references: [id], onDelete: Cascade)
    shared_userId Int     @unique
    bio           String?
    avatarUrl     String?

    @@map('profiles')
}

model Post {
    id        Int       @id @default(autoincrement())
    author    User      @relation(fields: [authorId], references: [id], onDelete: Cascade)
    authorId  Int
    title     String
    content   String?
    published Boolean   @default(false)
    tags      PostTag[]
    createdAt DateTime  @default(now())
    updatedAt DateTime  @updatedAt
    slug      String
    score     Float     @default(0.0)
    metadata  Json?

    @@unique([authorId, slug])
    @@index([authorId, published])
    @@map('posts')
}

model Tag {
    id        Int       @id @default(autoincrement())
    name      String    @unique
    posts     PostTag[]
    createdAt DateTime  @default(now())

    @@index([name], name: 'tag_name_idx')
    @@map('tags')
}

model PostTag {
    post       Post     @relation(fields: [postId], references: [id], onDelete: Cascade)
    postId     Int
    tag        Tag      @relation(fields: [tagId], references: [id], onDelete: Cascade)
    tagId      Int
    assignedAt DateTime @default(now())
    note       String?  @default('initial')

    @@id([postId, tagId])
    @@map('post_tags')
}

enum Role {
    USER
    ADMIN
    MODERATOR
}`,
// When using MySQL, the introspection simply overrides the enum and cannot detect if it exists with the same name because it only stores the values.
// TODO: Create a better way to handle this, possibly by finding enums by their values as well if the schema exists.
            );
            runCli('db push', workDir);

            runCli('db pull --indent 4', workDir);
            expect(getSchema(workDir)).toEqual(schema);
        });

        it('should preserve imports when pulling with multi-file schema', async () => {
            const { workDir } = await createProject('', { customPrelude: true });
            const schemaPath = path.join(workDir, 'zenstack/schema.zmodel');
            const modelsDir = path.join(workDir, 'zenstack/models');

            fs.mkdirSync(modelsDir, { recursive: true });

            // Create main schema with imports
            const mainSchema = await formatDocument(`import './models/user'
import './models/post'

${getDefaultPrelude()}`);
            fs.writeFileSync(schemaPath, mainSchema);

            // Create user model
            const userModel = await formatDocument(`import './post'

model User {
    id        Int      @id @default(autoincrement())
    email     String   @unique
    name      String?
    posts     Post[]
    createdAt DateTime @default(now())
}`);
            fs.writeFileSync(path.join(modelsDir, 'user.zmodel'), userModel);

            // Create post model
            const postModel = await formatDocument(`import './user'

model Post {
    id        Int      @id @default(autoincrement())
    title     String
    content   String?
    author    User     @relation(fields: [authorId], references: [id], onDelete: Cascade)
    authorId  Int
    createdAt DateTime @default(now())
}`);
            fs.writeFileSync(path.join(modelsDir, 'post.zmodel'), postModel);

            runCli('db push', workDir);

            // Pull and verify imports are preserved
            runCli('db pull --indent 4', workDir);

            const pulledMainSchema = fs.readFileSync(schemaPath).toString();
            const pulledUserSchema = fs.readFileSync(path.join(modelsDir, 'user.zmodel')).toString();
            const pulledPostSchema = fs.readFileSync(path.join(modelsDir, 'post.zmodel')).toString();

            expect(pulledMainSchema).toEqual(mainSchema);
            expect(pulledUserSchema).toEqual(userModel);
            expect(pulledPostSchema).toEqual(postModel);
        });
    });

    describe('Pull should preserve enum declaration order', () => {

        it('should preserve interleaved enum and model ordering', async () => {
            const { workDir, schema } = await createProject(
                `enum Role {
    USER
    ADMIN
}

model User {
    id     Int    @id @default(autoincrement())
    email  String @unique
    role   Role   @default(USER)
    status Status @default(ACTIVE)
}

enum Status {
    ACTIVE
    INACTIVE
    SUSPENDED
}`,
            );
            runCli('db push', workDir);

            runCli('db pull --indent 4', workDir);

            // Enum-model-enum ordering should be preserved
            expect(getSchema(workDir)).toEqual(schema);
        });
    });

    describe('Pull should consolidate shared enums', () => {
        it('should consolidate per-column enums back to the original shared enum', async () => {
            const { workDir, schema } = await createProject(
                `enum Status {
    ACTIVE
    INACTIVE
    SUSPENDED
}

model User {
    id     Int    @id @default(autoincrement())
    status Status @default(ACTIVE)
}

model Group {
    id     Int    @id @default(autoincrement())
    status Status @default(ACTIVE)
}`,
            );
            runCli('db push', workDir);

            runCli('db pull --indent 4', workDir);

            // MySQL creates per-column enums (UserStatus, GroupStatus) but
            // consolidation should map them back to the original shared Status enum
            expect(getSchema(workDir)).toEqual(schema);
        });

        it('should consolidate per-column enums with --always-map without stale @@map', async () => {
            // This test targets a bug where consolidateEnums renames keepEnum.name
            // to oldEnum.name but leaves the synthetic @@map attribute added by
            // syncEnums, so getDbName(keepEnum) still returns the old mapped name
            // (e.g., 'UserStatus') instead of the consolidated name ('Status'),
            // preventing matching in the downstream delete/add enum logic.
            const { workDir } = await createProject(
                `enum Status {
    ACTIVE
    INACTIVE
    SUSPENDED
}

model User {
    id     Int    @id @default(autoincrement())
    status Status @default(ACTIVE)
}

model Group {
    id     Int    @id @default(autoincrement())
    status Status @default(ACTIVE)
}`,
            );
            runCli('db push', workDir);

            runCli('db pull --indent 4 --always-map', workDir);

            const pulledSchema = getSchema(workDir);

            // The consolidated enum should be named Status, not UserStatus/GroupStatus
            expect(pulledSchema).toContain('enum Status');
            expect(pulledSchema).not.toContain('enum UserStatus');
            expect(pulledSchema).not.toContain('enum GroupStatus');

            // There should be no stale @@map referencing the synthetic per-column name
            expect(pulledSchema).not.toMatch(/@@map\(['"]UserStatus['"]\)/);
            expect(pulledSchema).not.toMatch(/@@map\(['"]GroupStatus['"]\)/);
        });
    });

    describe('Pull should preserve triple-slash comments on enums', () => {
        it('should preserve triple-slash comments on enum declarations and fields', async () => {
            const { workDir, schema } = await createProject(
                `model User {
    id     Int    @id @default(autoincrement())
    status Status @default(ACTIVE)
}

/// User account status
/// ACTIVE - user can log in
/// INACTIVE - user is disabled
enum Status {
    /// User can log in
    ACTIVE
    /// User is disabled
    INACTIVE
    /// User is suspended
    SUSPENDED
}`,
            );
            runCli('db push', workDir);

            runCli('db pull --indent 4', workDir);

            expect(getSchema(workDir)).toEqual(schema);
        });
    });

    describe('Pull should preserve data validation attributes', () => {
        it('should preserve field-level validation attributes after db pull', async () => {
            const { workDir, schema } = await createProject(
                `model User {
    id       Int     @id @default(autoincrement())
    email    String  @unique @email
    name     String  @length(min: 2, max: 100)
    website  String? @url
    code     String? @regex('^[A-Z]+$')
    age      Int     @gt(0)
    score    Float   @gte(0.0)
    rating   Decimal @lt(10)
    rank     BigInt  @lte(999)
}`,
            );
            runCli('db push', workDir);

            // Pull should preserve all validation attributes
            runCli('db pull --indent 4', workDir);

            expect(getSchema(workDir)).toEqual(schema);
        });

        it('should preserve string transformation attributes after db pull', async () => {
            const { workDir, schema } = await createProject(
                `model Setting {
    id    Int    @id @default(autoincrement())
    key   String @trim @lower
    value String @trim @upper
}`,
            );
            runCli('db push', workDir);

            runCli('db pull --indent 4', workDir);

            expect(getSchema(workDir)).toEqual(schema);
        });

        it('should preserve model-level @@validate attribute after db pull', async () => {
            const { workDir, schema } = await createProject(
                `model Product {
    id       Int     @id @default(autoincrement())
    minPrice Decimal @default(0.00)
    maxPrice Decimal @default(100.00)

    @@validate(minPrice < maxPrice, 'minPrice must be less than maxPrice')
}`,
            );
            runCli('db push', workDir);

            runCli('db pull --indent 4', workDir);

            expect(getSchema(workDir)).toEqual(schema);
        });
    });

    describe('Pull should update existing field definitions when database changes', () => {
        it('should update field type when database column type changes', async () => {
            // Step 1: Create initial schema with String field
            const { workDir } = await createProject(
                `model User {
    id    Int    @id @default(autoincrement())
    email String @unique
    age   String
}`,
            );
            runCli('db push', workDir);

            // Step 2: Modify schema to change age from String to Int
            const schemaFile = path.join(workDir, 'zenstack/schema.zmodel');
            const updatedSchema = await formatDocument(`${getDefaultPrelude()}

model User {
    id    Int @id @default(autoincrement())
    email String @unique
    age   Int
}`);
            fs.writeFileSync(schemaFile, updatedSchema);
            runCli('db push', workDir);

            // Step 3: Revert schema back to original (with String type)
            const originalSchema = await formatDocument(`${getDefaultPrelude()}

model User {
    id    Int    @id @default(autoincrement())
    email String @unique
    age   String
}`);
            fs.writeFileSync(schemaFile, originalSchema);

            // Step 4: Pull from database - should detect that age is now Int
            runCli('db pull --indent 4', workDir);

            // Step 5: Verify that pulled schema has Int type (matching database)
            const pulledSchema = getSchema(workDir);
            expect(pulledSchema).toEqual(updatedSchema);
        });

        it('should update field optionality when database column nullability changes', async () => {
            // Step 1: Create initial schema with required field
            const { workDir } = await createProject(
                `model User {
    id    Int    @id @default(autoincrement())
    email String @unique
    name  String
}`,
            );
            runCli('db push', workDir);

            // Step 2: Modify schema to make name optional
            const schemaFile = path.join(workDir, 'zenstack/schema.zmodel');
            const updatedSchema = await formatDocument(`${getDefaultPrelude()}

model User {
    id    Int     @id @default(autoincrement())
    email String  @unique
    name  String?
}`);
            fs.writeFileSync(schemaFile, updatedSchema);
            runCli('db push', workDir);

            // Step 3: Revert schema back to original (with required name)
            const originalSchema = await formatDocument(`${getDefaultPrelude()}

model User {
    id    Int    @id @default(autoincrement())
    email String @unique
    name  String
}`);
            fs.writeFileSync(schemaFile, originalSchema);

            // Step 4: Pull from database - should detect that name is now optional
            runCli('db pull --indent 4', workDir);

            // Step 5: Verify that pulled schema has optional name (matching database)
            const pulledSchema = getSchema(workDir);
            expect(pulledSchema).toEqual(updatedSchema);
        });

        it('should update default value when database default changes', async () => {
            // Step 1: Create initial schema with default value
            const { workDir } = await createProject(
                `model User {
    id     Int    @id @default(autoincrement())
    email  String @unique
    status String @default('active')
}`,
            );
            runCli('db push', workDir);

            // Step 2: Modify schema to change default value
            const schemaFile = path.join(workDir, 'zenstack/schema.zmodel');
            const updatedSchema = await formatDocument(`${getDefaultPrelude()}

model User {
    id     Int    @id @default(autoincrement())
    email  String @unique
    status String @default('pending')
}`);
            fs.writeFileSync(schemaFile, updatedSchema);
            runCli('db push', workDir);

            // Step 3: Revert schema back to original default
            const originalSchema = await formatDocument(`${getDefaultPrelude()}

model User {
    id     Int    @id @default(autoincrement())
    email  String @unique
    status String @default('active')
}`);
            fs.writeFileSync(schemaFile, originalSchema);

            // Step 4: Pull from database - should detect that default changed
            runCli('db pull --indent 4', workDir);

            // Step 5: Verify that pulled schema has updated default (matching database)
            const pulledSchema = getSchema(workDir);
            expect(pulledSchema).toEqual(updatedSchema);
        });
    });
});

describe('DB pull - PostgreSQL specific features', () => {
    it('should restore schema with multiple database schemas', async ({ skip }) => {
        const provider = getTestDbProvider();
        if (provider !== 'postgresql') {
            skip();
            return;
        }
        const { workDir, schema } = await createProject(
            `model User {
    id    Int    @id @default(autoincrement())
    email String @unique
    posts Post[]

    @@schema('auth')
}

model Post {
    id       Int    @id @default(autoincrement())
    title    String
    author   User   @relation(fields: [authorId], references: [id], onDelete: Cascade)
    authorId Int

    @@schema('content')
}`,
            { provider: 'postgresql', datasourceFields:{ schemas: ['public', 'content', 'auth'] } },
        );
        runCli('db push', workDir);

        const schemaFile = path.join(workDir, 'zenstack/schema.zmodel');

        fs.writeFileSync(schemaFile, getDefaultPrelude({ provider: 'postgresql', datasourceFields:{ schemas: ['public', 'content', 'auth']} }));
        runCli('db pull --indent 4', workDir);

        const restoredSchema = getSchema(workDir);
        expect(restoredSchema).toEqual(schema);
    });

    it('should preserve native PostgreSQL enums when schema exists', async ({ skip }) => {
        const provider = getTestDbProvider();
        if (provider !== 'postgresql') {
            skip();
            return;
        }
        const { workDir, schema } = await createProject(
            `model User {
    id     Int        @id @default(autoincrement())
    email  String     @unique
    status Status @default(ACTIVE)
    role   Role   @default(USER)
}

enum Status {
    ACTIVE
    INACTIVE
    SUSPENDED
}

enum Role {
    USER
    ADMIN
    MODERATOR
}`,
            { provider: 'postgresql' },
        );
        runCli('db push', workDir);

        runCli('db pull --indent 4', workDir);
        const pulledSchema = getSchema(workDir);

        expect(pulledSchema).toEqual(schema);
    });

    it('should not modify schema with PostgreSQL-specific features', async ({ skip }) => {
        const provider = getTestDbProvider();
        if (provider !== 'postgresql') {
            skip();
            return;
        }
        const { workDir, schema } = await createProject(
            `model User {
    id       Int        @id @default(autoincrement())
    email    String     @unique
    status   Status @default(ACTIVE)
    posts    Post[]
    metadata Json?

    @@schema('auth')
    @@index([status])
}

model Post {
    id       Int    @id @default(autoincrement())
    title    String
    author   User   @relation(fields: [authorId], references: [id], onDelete: Cascade)
    authorId Int
    tags     String[]

    @@schema('content')
    @@index([authorId])
}

enum Status {
    ACTIVE
    INACTIVE
    SUSPENDED
}`,
            { provider: 'postgresql', datasourceFields:{ schemas: ['public', 'content', 'auth'] }  },
        );
        runCli('db push', workDir);

        runCli('db pull --indent 4', workDir);

        expect(getSchema(workDir)).toEqual(schema);
    });

    it('should restore native type attributes from PostgreSQL typnames', async ({ skip }) => {
        const provider = getTestDbProvider();
        if (provider !== 'postgresql') {
            skip();
            return;
        }
        // PostgreSQL introspection returns typnames like 'int2', 'float8', 'bpchar',
        // but Prisma/ZenStack attributes are named @db.SmallInt, @db.DoublePrecision, @db.Char, etc.
        // This test verifies the mapping works correctly.
        // Note: Default native types (jsonb for Json, bytea for Bytes) are not added when pulling from zero
        // because they match the default database type for that field type.
        const { workDir } = await createProject(
            `model TypeTest {
    id          Int      @id @default(autoincrement())
    smallNumber Int      @db.SmallInt()
    realNumber  Float    @db.Real()
    doubleNum   Float    @db.DoublePrecision()
    fixedChar   String   @db.Char(10)
    uuid        String   @db.Uuid()
    jsonData    Json     @db.Json()
    jsonbData   Json     @db.JsonB()
    binaryData  Bytes    @db.ByteA()
}`,
            { provider: 'postgresql' },
        );
        runCli('db push', workDir);

        const schemaFile = path.join(workDir, 'zenstack/schema.zmodel');

        // Remove schema content to simulate restoration from zero
        fs.writeFileSync(schemaFile, getDefaultPrelude({ provider: 'postgresql' }));

        // Pull should restore non-default native type attributes
        // Default types (jsonb for Json, bytea for Bytes) are not added
        runCli('db pull --indent 4', workDir);

        const restoredSchema = getSchema(workDir);
        // Verify key native type mappings are restored correctly:
        // - @db.SmallInt for int2 (non-default for Int which defaults to integer/int4)
        // - @db.Real for float4 (non-default for Float which defaults to double precision/float8)
        // - @db.Char(10) for bpchar with length (non-default for String which defaults to text)
        // - @db.Uuid for uuid (non-default for String which defaults to text)
        // - @db.Json for json (non-default for Json which defaults to jsonb)
        expect(restoredSchema).toContain('@db.SmallInt');
        expect(restoredSchema).toContain('@db.Real');
        expect(restoredSchema).toContain('@db.Char(10)');
        expect(restoredSchema).toContain('@db.Uuid');
        expect(restoredSchema).toContain('@db.Json');
        // Default types should NOT be added when pulling from zero
        expect(restoredSchema).not.toContain('@db.Integer'); // integer is default for Int
        expect(restoredSchema).not.toContain('@db.DoublePrecision'); // double precision is default for Float
        expect(restoredSchema).not.toContain('@db.JsonB'); // jsonb is default for Json
        expect(restoredSchema).not.toContain('@db.ByteA'); // bytea is default for Bytes
    });

    it('should correctly map composite foreign key columns by position', async ({ skip }) => {
        const provider = getTestDbProvider();
        if (provider !== 'postgresql') {
            skip();
            return;
        }
        // Composite FK: (tenantId, authorId) REFERENCES Tenant(tenantId, userId)
        // The introspection must correlate by position, not match each source column
        // to every target column. Without the fix, tenantId would incorrectly map to
        // both tenantId AND userId in the target table.
        const { workDir, schema } = await createProject(
            `model Post {
    id       Int    @id @default(autoincrement())
    title    String
    tenant   Tenant @relation(fields: [tenantId, authorId], references: [tenantId, userId], onDelete: Cascade)
    tenantId Int
    authorId Int

    @@index([tenantId, authorId])
}

model Tenant {
    tenantId Int
    userId   Int
    name     String
    posts    Post[]

    @@id([tenantId, userId])
}`,
            { provider: 'postgresql' },
        );
        runCli('db push', workDir);

        const schemaFile = path.join(workDir, 'zenstack/schema.zmodel');

        fs.writeFileSync(schemaFile, getDefaultPrelude({ provider: 'postgresql' }));
        runCli('db pull --indent 4', workDir);

        const restoredSchema = getSchema(workDir);
        expect(restoredSchema).toEqual(schema);
    });

    it('should pull stored generated columns as Unsupported with full expression', async ({ skip }) => {
        const provider = getTestDbProvider();
        if (provider !== 'postgresql') {
            skip();
            return;
        }
        // PostgreSQL supports GENERATED ALWAYS AS (expr) STORED since PG 12.
        // The introspection should include the full generation expression in the
        // datatype so it is rendered as Unsupported("type GENERATED ALWAYS AS (expr) STORED").

        // 1. Create a project with a base table (we need the DB to exist first)
        const { workDir } = await createProject(
            `model ComputedUsers {
    id        Int    @id @default(autoincrement())
    firstName String
    lastName  String
}`,
            { provider: 'postgresql' },
        );
        runCli('db push', workDir);

        // 2. Add a generated column via raw SQL (can't be defined in ZModel)
        const { Client } = await import('pg');
        const dbName = getTestDbName('postgresql');
        const client = new Client({ connectionString: getTestDbUrl('postgresql', dbName) });
        await client.connect();
        try {
            await client.query(
                `ALTER TABLE "ComputedUsers" ADD COLUMN "fullName" text GENERATED ALWAYS AS ("firstName" || ' ' || "lastName") STORED`
            );
        } finally {
            await client.end();
        }

        // 3. Pull from zero
        const schemaFile = path.join(workDir, 'zenstack/schema.zmodel');
        fs.writeFileSync(schemaFile, getDefaultPrelude({ provider: 'postgresql' }));
        runCli('db pull --indent 4', workDir);

        const restoredSchema = getSchema(workDir);

        // The generated column should be pulled as Unsupported with the full expression.
        // format_type returns 'text', and pg_get_expr returns the expression.
        expect(restoredSchema).toEqual(await formatDocument(`${getDefaultPrelude({ provider: 'postgresql' })}

model ComputedUsers {
    id        Int                                                                                        @id @default(autoincrement())
    firstName String
    lastName  String
    fullName  Unsupported('text GENERATED ALWAYS AS ((("firstName" || \\' \\'::text) || "lastName")) STORED')?
}`));
    });

    it('should pull virtual generated columns as Unsupported with full expression', async ({ skip }) => {
        const provider = getTestDbProvider();
        if (provider !== 'postgresql') {
            skip();
            return;
        }
        // PostgreSQL 17+ supports VIRTUAL generated columns.
        // For earlier versions, only STORED is supported, so this test may need to be
        // adapted. We test STORED here since it's universally supported.

        const { workDir } = await createProject(
            `model ComputedProducts {
    id    Int @id @default(autoincrement())
    price Int @default(0)
    qty   Int @default(0)
}`,
            { provider: 'postgresql' },
        );
        runCli('db push', workDir);

        const { Client } = await import('pg');
        const dbName = getTestDbName('postgresql');
        const client = new Client({ connectionString: getTestDbUrl('postgresql', dbName) });
        await client.connect();
        try {
            await client.query(
                `ALTER TABLE "ComputedProducts" ADD COLUMN "total" integer GENERATED ALWAYS AS ("price" * "qty") STORED`
            );
        } finally {
            await client.end();
        }

        const schemaFile = path.join(workDir, 'zenstack/schema.zmodel');
        fs.writeFileSync(schemaFile, getDefaultPrelude({ provider: 'postgresql' }));
        runCli('db pull --indent 4', workDir);

        const restoredSchema = getSchema(workDir);

        expect(restoredSchema).toEqual(await formatDocument(`${getDefaultPrelude({ provider: 'postgresql' })}

model ComputedProducts {
    id    Int                                                                    @id @default(autoincrement())
    price Int                                                                    @default(0)
    qty   Int                                                                    @default(0)
    total Unsupported('integer GENERATED ALWAYS AS ((price * qty)) STORED')?
}`));
    });
});

describe('DB pull - MySQL specific features', () => {
    it('should detect single-column unique indexes via STATISTICS', async ({ skip }) => {
        const provider = getTestDbProvider();
        if (provider !== 'mysql') {
            skip();
            return;
        }
        // MySQL's COLUMN_KEY may not reliably reflect unique indexes in all cases.
        // The introspection should also check INFORMATION_SCHEMA.STATISTICS for
        // NON_UNIQUE = 0 single-column indexes to correctly detect uniqueness,
        // so that the index-processing skip logic (which checks index.unique +
        // single-column) doesn't cause a missing @unique attribute.
        const { workDir, schema } = await createProject(
            `model User {
    id       Int     @id @default(autoincrement())
    email    String  @unique
    nickname String? @unique
}`,
            { provider: 'mysql' },
        );
        runCli('db push', workDir);

        const schemaFile = path.join(workDir, 'zenstack/schema.zmodel');

        // Pull from zero to test introspection detects unique columns correctly
        fs.writeFileSync(schemaFile, getDefaultPrelude({ provider: 'mysql' }));
        runCli('db pull --indent 4', workDir);

        const restoredSchema = getSchema(workDir);
        expect(restoredSchema).toEqual(schema);
    });

    it('should pull stored generated columns as Unsupported with full expression', async ({ skip }) => {
        const provider = getTestDbProvider();
        if (provider !== 'mysql') {
            skip();
            return;
        }
        // MySQL supports both VIRTUAL and STORED generated columns.
        // The introspection should include the full generation expression in the
        // datatype so it is rendered as Unsupported("type GENERATED ALWAYS AS (expr) STORED").

        // 1. Create a project with a base table (we need the DB to exist first)
        const { workDir } = await createProject(
            `model ComputedUsers {
    id        Int    @id @default(autoincrement())
    firstName String @db.VarChar(255)
    lastName  String @db.VarChar(255)
}`,
            { provider: 'mysql' },
        );
        runCli('db push', workDir);

        // 2. Add a generated column via raw SQL (can't be defined in ZModel)
        const mysql = await import('mysql2/promise');
        const dbName = getTestDbName('mysql');
        const connection = await mysql.createConnection(getTestDbUrl('mysql', dbName));
        try {
            await connection.execute(
                "ALTER TABLE `ComputedUsers` ADD COLUMN `fullName` varchar(511) GENERATED ALWAYS AS (CONCAT(`firstName`, ' ', `lastName`)) STORED"
            );
        } finally {
            await connection.end();
        }

        // 3. Pull from zero
        const schemaFile = path.join(workDir, 'zenstack/schema.zmodel');
        fs.writeFileSync(schemaFile, getDefaultPrelude({ provider: 'mysql' }));
        runCli('db pull --indent 4', workDir);

        const restoredSchema = getSchema(workDir);

        // The generated column should be pulled as Unsupported with the full expression.
        // MySQL uses COLUMN_TYPE (e.g., 'varchar(511)') and GENERATION_EXPRESSION for the expr,
        // and EXTRA contains 'STORED GENERATED' or 'VIRTUAL GENERATED'.
        expect(restoredSchema).toEqual(await formatDocument(`${getDefaultPrelude({ provider: 'mysql' })}

model ComputedUsers {
    id        Int                                                                                                         @id @default(autoincrement())
    firstName String                                                                                                      @db.VarChar(255)
    lastName  String                                                                                                      @db.VarChar(255)
    fullName  Unsupported('varchar(511) GENERATED ALWAYS AS (concat(\`firstName\`,\\' \\',\`lastName\`)) STORED')?
}`));
    });

    it('should pull virtual generated columns as Unsupported with full expression', async ({ skip }) => {
        const provider = getTestDbProvider();
        if (provider !== 'mysql') {
            skip();
            return;
        }

        const { workDir } = await createProject(
            `model ComputedProducts {
    id    Int @id @default(autoincrement())
    price Int @default(0)
    qty   Int @default(0)
}`,
            { provider: 'mysql' },
        );
        runCli('db push', workDir);

        const mysql = await import('mysql2/promise');
        const dbName = getTestDbName('mysql');
        const connection = await mysql.createConnection(getTestDbUrl('mysql', dbName));
        try {
            await connection.execute(
                "ALTER TABLE `ComputedProducts` ADD COLUMN `total` int GENERATED ALWAYS AS (`price` * `qty`) VIRTUAL"
            );
        } finally {
            await connection.end();
        }

        const schemaFile = path.join(workDir, 'zenstack/schema.zmodel');
        fs.writeFileSync(schemaFile, getDefaultPrelude({ provider: 'mysql' }));
        runCli('db pull --indent 4', workDir);

        const restoredSchema = getSchema(workDir);

        expect(restoredSchema).toEqual(await formatDocument(`${getDefaultPrelude({ provider: 'mysql' })}

model ComputedProducts {
    id    Int                                                              @id @default(autoincrement())
    price Int                                                              @default(0)
    qty   Int                                                              @default(0)
    total Unsupported('int GENERATED ALWAYS AS ((\`price\` * \`qty\`)) VIRTUAL')?
}`));
    });
});

describe('DB pull - SQLite specific features', () => {
    it('should restore composite foreign key relations', async ({ skip }) => {
        const provider = getTestDbProvider();
        if (provider !== 'sqlite') {
            skip();
            return;
        }
        // Composite FK: (tenantId, authorId) REFERENCES Tenant(tenantId, userId).
        // The SQLite introspection extracts FK constraint names by parsing the
        // CREATE TABLE DDL. The current regex only captures a single column inside
        // FOREIGN KEY(...), so composite FK constraint names are lost. Without a
        // constraint name, the downstream relation grouping (pull/index.ts) skips
        // the FK columns entirely and the relation is not restored.
        const { workDir, schema } = await createProject(
            `model Post {
    id       Int    @id @default(autoincrement())
    title    String
    tenant   Tenant @relation(fields: [tenantId, authorId], references: [tenantId, userId], onDelete: Cascade)
    tenantId Int
    authorId Int

    @@index([tenantId, authorId])
}

model Tenant {
    tenantId Int
    userId   Int
    name     String
    posts    Post[]

    @@id([tenantId, userId])
}`,
        );
        runCli('db push', workDir);

        const schemaFile = path.join(workDir, 'zenstack/schema.zmodel');

        fs.writeFileSync(schemaFile, getDefaultPrelude());
        runCli('db pull --indent 4', workDir);

        const restoredSchema = getSchema(workDir);
        expect(restoredSchema).toEqual(schema);
    });

    it('should map columns without a declared type to Bytes', async ({ skip }) => {
        const provider = getTestDbProvider();
        if (provider !== 'sqlite') {
            skip();
            return;
        }
        // Create a minimal project and push to get the database file.
        const { workDir } = await createProject("");

        // Open the SQLite database directly and add a table with an untyped column.
        // In SQLite, CREATE TABLE t("data") gives column "data" no declared type,
        // which per affinity rules means BLOB affinity — should map to Bytes.
        const dbPath = path.join(workDir, 'zenstack', 'test.db');
        const SQLite = (await import('better-sqlite3')).default;
        const db = new SQLite(dbPath);
        db.exec('CREATE TABLE "UntypedTest" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "data")');
        db.close();

        const schemaFile = path.join(workDir, 'zenstack/schema.zmodel');
        fs.writeFileSync(schemaFile, getDefaultPrelude());
        runCli('db pull --indent 4', workDir);

        const restoredSchema = getSchema(workDir);
        // The untyped "data" column should be pulled as Bytes (BLOB affinity),
        // not as Unsupported.
        expect(restoredSchema).toContain('data Bytes?');
        expect(restoredSchema).not.toContain('Unsupported');
    });

    it('should pull stored generated columns as Unsupported', async ({ skip }) => {
        const provider = getTestDbProvider();
        if (provider !== 'sqlite') {
            skip();
            return;
        }
        // SQLite PRAGMA table_xinfo reports generated columns with hidden values:
        //   hidden = 2 → VIRTUAL generated column
        //   hidden = 3 → STORED generated column
        // Both types should be pulled as Unsupported("full type definition")
        // because generated columns are read-only and cannot be written to.

        const { workDir } = await createProject('');

        const dbPath = path.join(workDir, 'zenstack', 'test.db');
        const SQLite = (await import('better-sqlite3')).default;
        const db = new SQLite(dbPath);
        db.exec(`
            CREATE TABLE "ComputedUsers" (
                "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                "firstName" TEXT NOT NULL,
                "lastName" TEXT NOT NULL,
                "fullName" TEXT GENERATED ALWAYS AS (firstName || ' ' || lastName) STORED
            )
        `);
        db.close();

        const schemaFile = path.join(workDir, 'zenstack/schema.zmodel');
        fs.writeFileSync(schemaFile, getDefaultPrelude());
        runCli('db pull --indent 4', workDir);

        const restoredSchema = getSchema(workDir);

        // first_name and last_name should be regular String fields
      expect(restoredSchema).toEqual(await formatDocument(`${getDefaultPrelude()}

model ComputedUsers {
  id Int @id @default(autoincrement())
  firstName String
  lastName  String
  fullName  Unsupported('TEXT GENERATED ALWAYS AS (firstName || \\' \\' || lastName) STORED')?
}`));
    });

    it('should pull virtual generated columns as Unsupported', async ({ skip }) => {
        const provider = getTestDbProvider();
        if (provider !== 'sqlite') {
            skip();
            return;
        }

        const { workDir } = await createProject('');

        const dbPath = path.join(workDir, 'zenstack', 'test.db');
        const SQLite = (await import('better-sqlite3')).default;
        const db = new SQLite(dbPath);
        db.exec(`
            CREATE TABLE "ComputedProducts" (
                "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                "price" INTEGER NOT NULL DEFAULT 0,
                "qty" INTEGER NOT NULL DEFAULT 0,
                "total" INTEGER GENERATED ALWAYS AS ("price" * "qty") VIRTUAL
            )
        `);
        db.close();

        const schemaFile = path.join(workDir, 'zenstack/schema.zmodel');
        fs.writeFileSync(schemaFile, getDefaultPrelude());
        runCli('db pull --indent 4', workDir);

        const restoredSchema = getSchema(workDir);

        expect(restoredSchema).toEqual(await formatDocument(`${getDefaultPrelude()}

model ComputedProducts {
    id    Int                                                      @id @default(autoincrement())
    price Int                                                      @default(0)
    qty   Int                                                      @default(0)
    total Unsupported('INTEGER GENERATED ALWAYS AS ("price" * "qty") VIRTUAL')?
}`));
    });
});

describe('DB pull - SQL specific features', () => {
    it('should restore enum fields from zero', async ({ skip }) => {
        const provider = getTestDbProvider();
        if (provider !== 'mysql' && provider !== 'postgresql') {
            skip();
            return;
        }

        const { workDir, schema } = await createProject(
            `model User {
    id     Int        @id @default(autoincrement())
    email  String     @unique
    status UserStatus @default(ACTIVE)
}

enum UserStatus {
    ACTIVE
    INACTIVE
    SUSPENDED
}`);
        runCli('db push', workDir);

        const schemaFile = path.join(workDir, 'zenstack/schema.zmodel');

        // Remove schema content to simulate restoration from zero
        fs.writeFileSync(schemaFile, getDefaultPrelude());

        // Pull should fully restore the schema including enum fields
        runCli('db pull --indent 4', workDir);

        const restoredSchema = getSchema(workDir);
        expect(restoredSchema).toContain(`model User {
    id     Int        @id @default(autoincrement())
    email  String     @unique
    status UserStatus @default(ACTIVE)
}`);

        expect(restoredSchema).toContain(`enum UserStatus {
    ACTIVE
    INACTIVE
    SUSPENDED
}`);
    });
});
