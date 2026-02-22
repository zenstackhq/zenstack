import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { findFieldLine, generateFromSchema, loadSchemaFromFile, readDoc } from '../utils';
import plugin from '../../src/index';

describe('documentation plugin: model page', () => {
    it('access policy note uses GitHub Alert [!IMPORTANT] syntax', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id String @id @default(cuid())
                @@allow('read', true)
            }
        `);

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('> [!IMPORTANT]');
        expect(userDoc).toContain('denied by default');
    });

    it('scalar types in fields table are backtick-wrapped', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id    String   @id @default(cuid())
                name  String
                age   Int?
                score Float
                active Boolean @default(true)
                joined DateTime @default(now())
            }
        `);

        const doc = readDoc(tmpDir, 'models', 'User.md');
        expect(doc).toContain('| `String` |');
        expect(doc).toContain('| `Int?` |');
        expect(doc).toContain('| `Float` |');
        expect(doc).toContain('| `Boolean` |');
        expect(doc).toContain('| `DateTime` |');
    });

    it('model page shows source file path', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id String @id @default(cuid())
            }
        `);

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('**Defined in:**');
        expect(userDoc).toContain('.zmodel');
    });

    it('model page shows Mixins section linking to type pages', async () => {
        const tmpDir = await generateFromSchema(`
            type Timestamps {
                createdAt DateTime @default(now())
                updatedAt DateTime @updatedAt
            }
            type Metadata {
                version Int @default(1)
            }
            model User with Timestamps, Metadata {
                id String @id @default(cuid())
            }
        `);

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('Mixins');
        expect(userDoc).toContain('[Timestamps](../types/Timestamps.md)');
        expect(userDoc).toContain('[Metadata](../types/Metadata.md)');
    });

    it('fields table has Source column linking mixin fields to type page', async () => {
        const tmpDir = await generateFromSchema(`
            type Timestamps {
                /// Record creation time.
                createdAt DateTime @default(now())
                updatedAt DateTime @updatedAt
            }
            model User with Timestamps {
                id    String @id @default(cuid())
                /// User email address.
                email String
            }
        `);

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('| Source |');

        const createdAtLine = findFieldLine(userDoc, 'createdAt');
        expect(createdAtLine).toBeDefined();
        expect(createdAtLine).toContain('[Timestamps](../types/Timestamps.md)');
        expect(createdAtLine).toContain('Record creation time.');

        const emailLine = findFieldLine(userDoc, 'email');
        expect(emailLine).toBeDefined();
        expect(emailLine).toContain('User email address.');
        expect(emailLine).not.toContain('[Timestamps]');
    });

    it('generates model page with heading and description', async () => {
        const tmpDir = await generateFromSchema(`
            /// Represents a registered user.
            /// Has many posts.
            model User {
                id String @id @default(cuid())
            }
        `);

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('# User');
        expect(userDoc).toContain('Represents a registered user.');
        expect(userDoc).toContain('Has many posts.');
    });

    it('model page includes horizontal table of contents with anchor links', async () => {
        const tmpDir = await generateFromSchema(`
            enum Role { ADMIN MEMBER }
            model User {
                id    String @id @default(cuid())
                email String @unique @email
                role  Role
                posts Post[]
                @@allow('read', true)
                @@index([email])
            }
            model Post {
                id       String @id @default(cuid())
                author   User   @relation(fields: [authorId], references: [id])
                authorId String
            }
        `);

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('[Fields](#fields)');
        expect(userDoc).toContain('[Relationships](#relationships)');
        expect(userDoc).toContain('[Access Policies](#access-policies)');
        expect(userDoc).toContain('[Indexes](#indexes)');
        expect(userDoc).toContain('[Validation Rules](#validation-rules)');

        const tocLine = userDoc.split('\n').find((l: string) => l.includes('[Fields](#fields)') && l.includes(' · '));
        expect(tocLine).toBeDefined();

        expect(userDoc).not.toContain('- [Fields](#fields)');

        const tocIdx = userDoc.indexOf('[Fields](#fields)');
        const fieldsIdx = userDoc.indexOf('📋 Fields');
        expect(tocIdx).toBeLessThan(fieldsIdx);
    });

    it('model page includes external ZenStack docs link', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id String @id @default(cuid())
            }
        `);

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('zenstack.dev');
        expect(userDoc).toContain('/zmodel/model');
    });

    it('declaration summary includes source file path', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id String @id @default(cuid())
            }
        `);

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        const summaryLine = userDoc.split('\n').find((l) => l.includes('<summary>'));
        expect(summaryLine).toContain('Declaration');
        expect(summaryLine).toContain('.zmodel');
    });

    it('model page includes declaration code block', async () => {
        const tmpDir = await generateFromSchema(`
            /// A registered user.
            model User {
                id    String @id @default(cuid())
                email String
            }
        `);

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('<details>');
        expect(userDoc).toContain('<summary>Declaration');
        expect(userDoc).toContain('```prisma');
        expect(userDoc).toContain('model User {');
        expect(userDoc).toContain('id    String @id @default(cuid())');
        expect(userDoc).toContain('</details>');
    });

    it('fields with no description show em-dash instead of blank', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id    String @id @default(cuid())
                email String
            }
        `);

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        const idLine = findFieldLine(userDoc, 'id');
        expect(idLine).toBeDefined();
        expect(idLine).toMatch(/\| — \|$/);
    });

    it('fields default to declaration order', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id    String  @id @default(cuid())
                /// Display name shown in the UI.
                name  String
                email String?
            }
        `);

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('Fields');
        expect(userDoc).toContain('Display name shown in the UI.');
        expect(userDoc).toContain('`cuid()`');

        const idIdx = userDoc.indexOf('field-id');
        const nameIdx = userDoc.indexOf('field-name');
        const emailIdx = userDoc.indexOf('field-email');
        expect(idIdx).toBeLessThan(nameIdx);
        expect(nameIdx).toBeLessThan(emailIdx);

        const emailLine = findFieldLine(userDoc, 'email');
        expect(emailLine).toContain('No');

        const idLine = findFieldLine(userDoc, 'id');
        expect(idLine).toContain('Yes');
    });

    it('fieldOrder=alphabetical sorts fields alphabetically', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id    String  @id @default(cuid())
                name  String
                email String?
            }
        `, { fieldOrder: 'alphabetical' });

        const userDoc = readDoc(tmpDir, 'models', 'User.md');

        const emailIdx = userDoc.indexOf('field-email');
        const idIdx = userDoc.indexOf('field-id');
        const nameIdx = userDoc.indexOf('field-name');
        expect(emailIdx).toBeLessThan(idIdx);
        expect(idIdx).toBeLessThan(nameIdx);
    });

    it('generates model page with relationships section and mini ER diagram', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id    String @id @default(cuid())
                posts Post[]
            }
            model Post {
                id       String @id @default(cuid())
                author   User   @relation(fields: [authorId], references: [id])
                authorId String
            }
        `);

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('Relationships');
        expect(userDoc).toContain('| `posts`');
        expect(userDoc).toContain('Post');
        expect(userDoc).toContain('One→Many');

        expect(userDoc).toContain('```mermaid');
        expect(userDoc).toContain('erDiagram');
        expect(userDoc).toContain('User');
        expect(userDoc).toContain('Post');

        const postDoc = readDoc(tmpDir, 'models', 'Post.md');
        expect(postDoc).toContain('Relationships');
        expect(postDoc).toContain('| `author`');
        expect(postDoc).toContain('User');
        expect(postDoc).toContain('Many→One');

        expect(postDoc).toContain('```mermaid');
        expect(postDoc).toContain('erDiagram');

        const authorLine = postDoc.split('\n').find((l) => l.includes('field-author') && l.includes('@relation'));
        expect(authorLine).toBeDefined();
        expect(authorLine).toContain('fields: [authorId]');
        expect(authorLine).not.toContain('fields: fields:');
        expect(authorLine).toContain('references: [id]');
        expect(authorLine).not.toContain('references: references:');
    });

    it('generates access policies section from @@allow and @@deny', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id    String @id @default(cuid())
                email String

                @@allow('read', true)
                @@deny('delete', true)
            }
        `);

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('Access Policies');
        expect(userDoc).toContain('| read');
        expect(userDoc).toContain('Allow');
        expect(userDoc).toContain('| delete');
        expect(userDoc).toContain('Deny');
    });

    it('access policies section includes evaluation note', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id   String @id @default(cuid())
                @@allow('read', true)
                @@deny('delete', true)
            }
        `);

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('Access Policies');
        expect(userDoc).toContain('denied by default');
        expect(userDoc).toContain('@@deny');
        expect(userDoc).toContain('@@allow');
    });

    it('generates validation rules section', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id    String @id @default(cuid())
                email String @email
                name  String @length(1, 100)
            }
        `);

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('Validation Rules');
        expect(userDoc).toContain('| `email`');
        expect(userDoc).toContain('`@email`');
        expect(userDoc).toContain('| `name`');
        expect(userDoc).toContain('`@length`');
    });

    it('@map field attribute renders in Attributes column', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id   String @id @default(cuid())
                name String @map("user_name")
            }
        `);

        const doc = readDoc(tmpDir, 'models', 'User.md');
        const nameLine = findFieldLine(doc, 'name');
        expect(nameLine).toBeDefined();
        expect(nameLine).toContain('@map');
    });

    it('@updatedAt field attribute renders in Attributes column', async () => {
        const tmpDir = await generateFromSchema(`
            model Post {
                id        String   @id @default(cuid())
                updatedAt DateTime @updatedAt
            }
        `);

        const doc = readDoc(tmpDir, 'models', 'Post.md');
        const updatedAtLine = findFieldLine(doc, 'updatedAt');
        expect(updatedAtLine).toBeDefined();
        expect(updatedAtLine).toContain('`@updatedAt`');
    });

    it('@json field attribute renders in Attributes column on a model', async () => {
        const tmpDir = await generateFromSchema(`
            type Address {
                street String
                city   String
            }
            model User {
                id      String  @id @default(cuid())
                address Address @json
            }
        `);

        const doc = readDoc(tmpDir, 'models', 'User.md');
        const addressLine = findFieldLine(doc, 'address');
        expect(addressLine).toBeDefined();
        expect(addressLine).toContain('`@json`');
    });

    it('auth() function renders in access policy rules', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id    String @id @default(cuid())
                email String
                @@auth
                @@allow('read', true)
                @@allow('update', auth() == this)
                @@deny('delete', auth() == this)
            }
        `);

        const doc = readDoc(tmpDir, 'models', 'User.md');
        expect(doc).toContain('Access Policies');
        expect(doc).toContain('`auth() == this`');
    });

    it('all predefined default-value functions render in Default column', async () => {
        const tmpDir = await generateFromSchema(`
            model Defaults {
                autoId   Int      @id @default(autoincrement())
                uid      String   @default(uuid())
                cid      String   @default(cuid())
                nid      String   @default(nanoid())
                uli      String   @default(ulid())
                created  DateTime @default(now())
                dbVal    String   @default(dbgenerated())
            }
        `);

        const doc = readDoc(tmpDir, 'models', 'Defaults.md');

        const autoIdLine = findFieldLine(doc, 'autoId');
        expect(autoIdLine).toContain('`autoincrement()`');

        const uidLine = findFieldLine(doc, 'uid');
        expect(uidLine).toContain('`uuid()`');

        const cidLine = findFieldLine(doc, 'cid');
        expect(cidLine).toContain('`cuid()`');

        const nidLine = findFieldLine(doc, 'nid');
        expect(nidLine).toContain('`nanoid()`');

        const uliLine = findFieldLine(doc, 'uli');
        expect(uliLine).toContain('`ulid()`');

        const createdLine = findFieldLine(doc, 'created');
        expect(createdLine).toContain('`now()`');

        const dbLine = findFieldLine(doc, 'dbVal');
        expect(dbLine).toContain('`dbgenerated()`');
    });

    it('model with @@map shows mapped table name in metadata', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id String @id @default(cuid())
                @@map("users")
            }
        `);

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('**Table:** `users`');
    });

    it('model with @@schema shows database schema in metadata', async () => {
        const schemaContent = `
            datasource db {
                provider = "postgresql"
                url      = "postgresql://localhost:5432/test"
                schemas  = ["auth", "public"]
            }
            model User {
                id String @id @default(cuid())
                @@schema("auth")
            }
        `;
        const tmpSchemaFile = path.join(os.tmpdir(), `zenstack-schema-${crypto.randomUUID()}.zmodel`);
        fs.writeFileSync(tmpSchemaFile, schemaContent);

        const model = await loadSchemaFromFile(tmpSchemaFile);

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-plugin-'));

        await plugin.generate({
            schemaFile: tmpSchemaFile,
            model,
            defaultOutputPath: tmpDir,
            pluginOptions: { output: tmpDir },
        });

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('**Schema:** `auth`');
    });

    it('field with @ignore shows ignored badge in Type column', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id       String @id @default(cuid())
                internal String @ignore
            }
        `);

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        const internalLine = findFieldLine(userDoc, 'internal');
        expect(internalLine).toBeDefined();
        expect(internalLine).toContain('<kbd>ignored</kbd>');
    });

    it('model with @@auth renders Auth badge on heading', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id String @id @default(cuid())
                email String
                @@auth
            }
        `);

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('<kbd>Auth</kbd>');
        expect(userDoc).toContain('<kbd>Model</kbd>');
    });

    it('model with @@delegate renders Delegate badge on heading', async () => {
        const tmpDir = await generateFromSchema(`
            enum AssetType { IMAGE VIDEO }
            model Asset {
                id   String    @id @default(cuid())
                type AssetType
                @@delegate(type)
            }
            model Image extends Asset {
                url String
            }
        `);

        const assetDoc = readDoc(tmpDir, 'models', 'Asset.md');
        expect(assetDoc).toContain('<kbd>Delegate</kbd>');
        expect(assetDoc).toContain('<kbd>Model</kbd>');
    });

    it('renders all predefined validation attributes in validation rules section', async () => {
        const tmpDir = await generateFromSchema(`
            model Product {
                id          String  @id @default(cuid())
                sku         String  @regex('^[A-Z0-9]+$')
                slug        String  @startsWith('product-')
                suffix      String  @endsWith('-v2')
                tags        String  @contains('sale')
                email       String  @email
                website     String  @url
                name        String  @length(1, 100) @trim @lower
                title       String  @upper
                dateStr     String  @datetime
                price       Float   @gt(0)
                discount    Float   @gte(0)
                maxQty      Int     @lt(1000)
                minQty      Int     @lte(500)
            }
        `);

        const doc = readDoc(tmpDir, 'models', 'Product.md');
        expect(doc).toContain('Validation Rules');

        const validationSection = doc.split('\u2705 Validation Rules')[1]!;
        expect(validationSection).toContain('`@regex`');
        expect(validationSection).toContain('`@startsWith`');
        expect(validationSection).toContain('`@endsWith`');
        expect(validationSection).toContain('`@contains`');
        expect(validationSection).toContain('`@email`');
        expect(validationSection).toContain('`@url`');
        expect(validationSection).toContain('`@length`');
        expect(validationSection).toContain('`@trim`');
        expect(validationSection).toContain('`@lower`');
        expect(validationSection).toContain('`@upper`');
        expect(validationSection).toContain('`@datetime`');
        expect(validationSection).toContain('`@gt`');
        expect(validationSection).toContain('`@gte`');
        expect(validationSection).toContain('`@lt`');
        expect(validationSection).toContain('`@lte`');
    });

    it('@@validate model-level rule renders in validation rules section', async () => {
        const tmpDir = await generateFromSchema(`
            model Event {
                id        String   @id @default(cuid())
                startDate DateTime
                endDate   DateTime
                @@validate(startDate < endDate, "Start must precede end")
            }
        `);

        const doc = readDoc(tmpDir, 'models', 'Event.md');
        expect(doc).toContain('Validation Rules');
        expect(doc).toContain('startDate < endDate');
        expect(doc).toContain('Start must precede end');
    });

    it('@@validate with validation functions renders expression text', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id    String @id @default(cuid())
                email String
                name  String
                @@validate(contains(name, 'test'))
            }
        `);

        const doc = readDoc(tmpDir, 'models', 'User.md');
        expect(doc).toContain('Validation Rules');
        expect(doc).toContain("contains(name, 'test')");
    });

    it('generates indexes section from @@index and @@unique', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id    String @id @default(cuid())
                email String @unique
                name  String

                @@index([name])
                @@unique([email, name])
            }
        `);

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('Indexes');
        expect(userDoc).toContain('Index');
        expect(userDoc).toContain('Unique');
    });

    it('marks computed fields with kbd badge in Type column', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id        String @id @default(cuid())
                firstName String
                lastName  String
                fullName  String @computed
            }
        `);

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        const fullNameLine = findFieldLine(userDoc, 'fullName');
        expect(fullNameLine).toBeDefined();
        expect(fullNameLine).toContain('<kbd>computed</kbd>');
        expect(fullNameLine).toContain('`String`');
        expect(fullNameLine).not.toContain('**Computed**');
    });

    it('renders multiple computed field types with badge and description', async () => {
        const tmpDir = await generateFromSchema(`
            model Project {
                id             String  @id @default(cuid())
                name           String
                /// Total number of tasks in this project.
                taskCount      Int     @computed
                /// Percentage of tasks that are completed.
                completionRate Float   @computed
                /// Whether the project has any overdue tasks.
                isOverdue      Boolean @computed
                /// Full display label combining name and status.
                displayLabel   String  @computed
            }
        `);

        const doc = readDoc(tmpDir, 'models', 'Project.md');
        const lines = doc.split('\n');

        const taskCountLine = lines.find((l) => l.includes('field-taskCount'));
        expect(taskCountLine).toContain('`Int` <kbd>computed</kbd>');
        expect(taskCountLine).toContain('Total number of tasks');

        const completionLine = lines.find((l) => l.includes('field-completionRate'));
        expect(completionLine).toContain('`Float` <kbd>computed</kbd>');
        expect(completionLine).toContain('Percentage of tasks');

        const overdueLine = lines.find((l) => l.includes('field-isOverdue'));
        expect(overdueLine).toContain('`Boolean` <kbd>computed</kbd>');
        expect(overdueLine).toContain('overdue tasks');

        const displayLine = lines.find((l) => l.includes('field-displayLabel'));
        expect(displayLine).toContain('`String` <kbd>computed</kbd>');
        expect(displayLine).toContain('Full display label');

        const nameLine = lines.find((l) => l.includes('field-name'));
        expect(nameLine).not.toContain('<kbd>computed</kbd>');
    });

    it('annotates inherited fields with source model', async () => {
        const tmpDir = await generateFromSchema(`
            model BaseModel {
                id   String @id @default(cuid())
                type String
                @@delegate(type)
            }
            model User extends BaseModel {
                email String
            }
        `);

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('| Source |');

        const idLine = findFieldLine(userDoc, 'id');
        expect(idLine).toBeDefined();
        expect(idLine).toContain('[BaseModel](./BaseModel.md)');

        const emailLine = findFieldLine(userDoc, 'email');
        expect(emailLine).toBeDefined();
        expect(emailLine).not.toContain('[BaseModel]');
    });

    it('renders metadata as inline key-value pairs without empty table headers', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id String @id @default(cuid())

                @@meta('doc:category', 'Identity')
                @@meta('doc:since', '2.0')
                @@meta('doc:deprecated', 'Use Account instead')
            }
        `);

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('**Category:** Identity');
        expect(userDoc).toContain('**Since:** 2.0');
        expect(userDoc).toContain('**Deprecated:** Use Account instead');
        expect(userDoc).toContain('**Defined in:**');
        expect(userDoc).not.toContain('| | |');
    });

    it('generates relationships.md with cross-reference table and Mermaid diagram', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id    String @id @default(cuid())
                posts Post[]
            }
            model Post {
                id       String @id @default(cuid())
                author   User   @relation(fields: [authorId], references: [id])
                authorId String
                tags     Tag[]
            }
            model Tag {
                id    String @id @default(cuid())
                posts Post[]
            }
        `);

        const relDoc = readDoc(tmpDir, 'relationships.md');
        expect(relDoc).toContain('# Relationships');
        expect(relDoc).toContain('erDiagram');
        expect(relDoc).toContain('User');
        expect(relDoc).toContain('Post');
        expect(relDoc).toContain('Tag');
    });

    it('relationships.md links model names to model pages', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id    String @id @default(cuid())
                posts Post[]
            }
            model Post {
                id       String @id @default(cuid())
                author   User   @relation(fields: [authorId], references: [id])
                authorId String
            }
        `);

        const relDoc = readDoc(tmpDir, 'relationships.md');
        expect(relDoc).toContain('[Index](./index.md) / Relationships');
        expect(relDoc).toContain('[User](./models/User.md)');
        expect(relDoc).toContain('[Post](./models/Post.md)');
    });

    it('field @meta doc:example shows example in fields table', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id    String @id @default(cuid())
                email String @meta('doc:example', 'jane@example.com')
            }
        `);

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        const emailLine = findFieldLine(userDoc, 'email');
        expect(emailLine).toContain('jane@example.com');
    });

    it('handles model with no fields gracefully', async () => {
        const tmpDir = await generateFromSchema(`
            model Empty {
                id String @id @default(cuid())
            }
        `);

        const doc = readDoc(tmpDir, 'models', 'Empty.md');
        expect(doc).toContain('# Empty');
        expect(doc).toContain('Fields');
    });

    it('handles self-referential relations', async () => {
        const tmpDir = await generateFromSchema(`
            model Employee {
                id        String    @id @default(cuid())
                managerId String?
                manager   Employee? @relation("ManagerReports", fields: [managerId], references: [id])
                reports   Employee[] @relation("ManagerReports")
            }
        `);

        const doc = readDoc(tmpDir, 'models', 'Employee.md');
        expect(doc).toContain('Relationships');
        expect(doc).toContain('[Employee](./Employee.md)');

        const relDoc = readDoc(tmpDir, 'relationships.md');
        expect(relDoc).toContain('Employee');
    });

    it('model page shows Used in Procedures section', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id String @id @default(cuid())
            }
            procedure getUser(id: String): User
            mutation procedure signUp(name: String): User
            procedure listUsers(): User[]
        `);

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('Used in Procedures');
        expect(userDoc).toContain('[getUser](../procedures/getUser.md)');
        expect(userDoc).toContain('[signUp](../procedures/signUp.md)');
        expect(userDoc).toContain('[listUsers](../procedures/listUsers.md)');
    });

    it('model page detects procedure reference via param type (array and non-array)', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id String @id @default(cuid())
            }
            model Post {
                id String @id @default(cuid())
            }
            procedure findByUser(user: User): Post[]
        `);

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('Used in Procedures');
        expect(userDoc).toContain('[findByUser](../procedures/findByUser.md)');

        const postDoc = readDoc(tmpDir, 'models', 'Post.md');
        expect(postDoc).toContain('Used in Procedures');
        expect(postDoc).toContain('[findByUser](../procedures/findByUser.md)');
    });

    it('model pages include prev/next navigation footer', async () => {
        const tmpDir = await generateFromSchema(`
            model Activity {
                id String @id @default(cuid())
            }
            model Post {
                id String @id @default(cuid())
            }
            model User {
                id String @id @default(cuid())
            }
        `);

        const activityDoc = readDoc(tmpDir, 'models', 'Activity.md');
        expect(activityDoc).toContain('Next: [Post](./Post.md)');
        expect(activityDoc).not.toContain('Previous:');

        const postDoc = readDoc(tmpDir, 'models', 'Post.md');
        expect(postDoc).toContain('Previous: [Activity](./Activity.md)');
        expect(postDoc).toContain('Next: [User](./User.md)');

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('Previous: [Post](./Post.md)');
        expect(userDoc).not.toContain('Next:');
    });

    it('model field rows include anchor IDs', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id    String @id @default(cuid())
                email String @unique
                name  String?
            }
        `);

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('<a id="field-id"></a>');
        expect(userDoc).toContain('<a id="field-email"></a>');
        expect(userDoc).toContain('<a id="field-name"></a>');
    });
});
