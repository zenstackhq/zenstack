import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { findFieldLine, generateFromSchema, loadSchemaFromFile, readDoc } from '../utils';
import plugin from '../../src/index';

describe('documentation plugin: model page', () => {
    describe('basic model with id only', () => {
        let userDoc: string;
        beforeAll(async () => {
            const tmpDir = await generateFromSchema(`
                model User {
                    id String @id @default(cuid())
                }
            `);
            userDoc = readDoc(tmpDir, 'models', 'User.md');
        });

        it('renders heading with emoji, source path, declaration summary, and external docs link', () => {
            const headingLine = userDoc.split('\n').find((l) => l.startsWith('# '));
            expect(headingLine).toContain('🗃️');

            expect(userDoc).toContain('**Defined in:**');
            expect(userDoc).toContain('.zmodel');

            const summaryLine = userDoc.split('\n').find((l) => l.includes('<summary>'));
            expect(summaryLine).toContain('Declaration');
            expect(summaryLine).toContain('.zmodel');

            expect(userDoc).toContain('zenstack.dev');
            expect(userDoc).toContain('/zmodel/model');
        });

        it('handles model with only an id field gracefully', () => {
            expect(userDoc).toContain('# 🗃️');
            expect(userDoc).toContain('Fields');
        });
    });

    it('renders heading, description, and declaration with comment stripping', async () => {
        const tmpDir = await generateFromSchema(`
            /// Represents a registered user.
            /// Has many posts.
            model User {
                id    String @id @default(cuid())
                /// The user's email address.
                email String
            }
        `);

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('# 🗃️ User');
        expect(userDoc).toContain('Represents a registered user.');
        expect(userDoc).toContain('Has many posts.');

        expect(userDoc).toContain('<details>');
        expect(userDoc).toContain('<summary>Declaration');
        expect(userDoc).toContain('```prisma');
        expect(userDoc).toContain('model User {');
        expect(userDoc).toContain('</details>');

        const declarationStart = userDoc.indexOf('```prisma');
        const declarationEnd = userDoc.indexOf('```', declarationStart + 10);
        const declaration = userDoc.slice(declarationStart, declarationEnd);
        expect(declaration).not.toContain('///');
        expect(declaration).toContain('email String');
    });

    it('renders metadata with horizontal rule before declaration', async () => {
        const tmpDir = await generateFromSchema(`
            /// A registered user.
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

        const categoryIdx = userDoc.indexOf('**Category:**');
        const detailsIdx = userDoc.indexOf('<details>');
        const hrIdx = userDoc.indexOf('---', categoryIdx);
        expect(hrIdx).toBeGreaterThan(categoryIdx);
        expect(hrIdx).toBeLessThan(detailsIdx);
    });

    describe('model with full features', () => {
        let userDoc: string;
        beforeAll(async () => {
            const tmpDir = await generateFromSchema(`
                type Timestamps {
                    createdAt DateTime @default(now())
                }
                model User with Timestamps {
                    id    String @id @default(cuid())
                    email String @unique @email
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
            userDoc = readDoc(tmpDir, 'models', 'User.md');
        });

        it('includes table of contents with On this page label', () => {
            expect(userDoc).toContain('[Fields](#fields)');
            expect(userDoc).toContain('[Relationships](#relationships)');
            expect(userDoc).toContain('[Access Policies](#access-policies)');
            expect(userDoc).toContain('[Indexes](#indexes)');
            expect(userDoc).toContain('[Validation Rules](#validation-rules)');

            const tocLine = userDoc.split('\n').find((l: string) => l.includes('[Fields](#fields)') && l.includes(' · '));
            expect(tocLine).toBeDefined();
            expect(tocLine).toMatch(/^>\s*\*\*On this page:\*\*/);
            expect(userDoc).not.toContain('- [Fields](#fields)');
        });

        it('section headings include contextual descriptions', () => {
            const lines = userDoc.split('\n');
            expect(lines[lines.indexOf('## 🧩 Mixins') + 2]).toMatch(/> .*reusable field groups/i);
            expect(lines[lines.indexOf('## 📋 Fields') + 2]).toMatch(/> .*fields defined/i);
            expect(lines[lines.indexOf('## 🔗 Relationships') + 2]).toMatch(/> .*relationships to other/i);
            expect(lines[lines.indexOf('## 🔐 Access Policies') + 2]).toMatch(/> .*access control rules/i);
            expect(lines[lines.indexOf('## 📇 Indexes') + 2]).toMatch(/> .*database indexes/i);
        });
    });

    it('renders scalar field types as backtick-wrapped', async () => {
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

    it('renders fields in declaration order with em-dashes, anchors, and required flags', async () => {
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

        expect(findFieldLine(userDoc, 'email')).toContain('No');
        expect(findFieldLine(userDoc, 'id')).toContain('Yes');

        const idLine = findFieldLine(userDoc, 'id');
        expect(idLine).toMatch(/\| — \|$/);

        expect(userDoc).toContain('<a id="field-id"></a>');
        expect(userDoc).toContain('<a id="field-email"></a>');
        expect(userDoc).toContain('<a id="field-name"></a>');
    });

    it('sorts fields alphabetically when fieldOrder=alphabetical', async () => {
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

    it('shows Mixins section and links mixin fields in Source column', async () => {
        const tmpDir = await generateFromSchema(`
            type Timestamps {
                /// Record creation time.
                createdAt DateTime @default(now())
                updatedAt DateTime @updatedAt
            }
            type Metadata {
                version Int @default(1)
            }
            model User with Timestamps, Metadata {
                id    String @id @default(cuid())
                /// User email address.
                email String
            }
        `);

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('Mixins');
        expect(userDoc).toContain('[Timestamps](../types/Timestamps.md)');
        expect(userDoc).toContain('[Metadata](../types/Metadata.md)');
        expect(userDoc).toContain('| Source |');

        const createdAtLine = findFieldLine(userDoc, 'createdAt');
        expect(createdAtLine).toContain('[Timestamps](../types/Timestamps.md)');
        expect(createdAtLine).toContain('Record creation time.');

        const emailLine = findFieldLine(userDoc, 'email');
        expect(emailLine).toContain('User email address.');
        expect(emailLine).not.toContain('[Timestamps]');
    });

    it('renders field attributes (@map, @updatedAt, @json) in Attributes column', async () => {
        const tmpDir = await generateFromSchema(`
            type Address {
                street String
                city   String
            }
            model User {
                id        String   @id @default(cuid())
                name      String   @map("user_name")
                updatedAt DateTime @updatedAt
                address   Address  @json
            }
        `);

        const doc = readDoc(tmpDir, 'models', 'User.md');
        expect(findFieldLine(doc, 'name')).toContain('@map');
        expect(findFieldLine(doc, 'updatedAt')).toContain('`@updatedAt`');
        expect(findFieldLine(doc, 'address')).toContain('`@json`');
    });

    it('shows @ignore badge in Type column', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id       String @id @default(cuid())
                internal String @ignore
            }
        `);

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(findFieldLine(userDoc, 'internal')).toContain('<kbd>ignored</kbd>');
    });

    it('marks computed fields with badge and description', async () => {
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
            }
        `);

        const doc = readDoc(tmpDir, 'models', 'Project.md');
        const lines = doc.split('\n');

        expect(lines.find((l) => l.includes('field-taskCount'))).toContain('`Int` <kbd>computed</kbd>');
        expect(lines.find((l) => l.includes('field-taskCount'))).toContain('Total number of tasks');
        expect(lines.find((l) => l.includes('field-completionRate'))).toContain('`Float` <kbd>computed</kbd>');
        expect(lines.find((l) => l.includes('field-isOverdue'))).toContain('`Boolean` <kbd>computed</kbd>');
        expect(lines.find((l) => l.includes('field-name'))).not.toContain('<kbd>computed</kbd>');
    });

    it('renders @meta doc:example in fields table', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id    String @id @default(cuid())
                email String @meta('doc:example', 'jane@example.com')
            }
        `);

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(findFieldLine(userDoc, 'email')).toContain('jane@example.com');
    });

    it('renders all predefined default-value functions in Default column', async () => {
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
        expect(findFieldLine(doc, 'autoId')).toContain('`autoincrement()`');
        expect(findFieldLine(doc, 'uid')).toContain('`uuid()`');
        expect(findFieldLine(doc, 'cid')).toContain('`cuid()`');
        expect(findFieldLine(doc, 'nid')).toContain('`nanoid()`');
        expect(findFieldLine(doc, 'uli')).toContain('`ulid()`');
        expect(findFieldLine(doc, 'created')).toContain('`now()`');
        expect(findFieldLine(doc, 'dbVal')).toContain('`dbgenerated()`');
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
        expect(findFieldLine(userDoc, 'id')).toContain('[BaseModel](./BaseModel.md)');
        expect(findFieldLine(userDoc, 'email')).not.toContain('[BaseModel]');
    });

    describe('relationships', () => {
        let tmpDir: string;
        let userDoc: string;
        let postDoc: string;
        beforeAll(async () => {
            tmpDir = await generateFromSchema(`
                model User {
                    id    String @id @default(cuid())
                    email String @unique
                    posts Post[]
                }
                model Post {
                    id       String @id @default(cuid())
                    title    String
                    author   User   @relation(fields: [authorId], references: [id])
                    authorId String
                }
            `);
            userDoc = readDoc(tmpDir, 'models', 'User.md');
            postDoc = readDoc(tmpDir, 'models', 'Post.md');
        });

        it('renders relationships table and ER diagram with related entity fields', () => {
            expect(userDoc).not.toContain('## 📊 Entity Diagram');

            expect(userDoc).toContain('Relationships');
            expect(userDoc).toContain('| `posts`');
            expect(userDoc).toContain('One→Many');
            expect(userDoc).toContain('```mermaid');
            expect(userDoc).toContain('erDiagram');

            const relSection = userDoc.indexOf('## 🔗 Relationships');
            const diagramStart = userDoc.indexOf('erDiagram', relSection);
            const diagramEnd = userDoc.indexOf('```', diagramStart);
            const diagram = userDoc.slice(diagramStart, diagramEnd);
            expect(diagram).toContain('User {');
            expect(diagram).toContain('Post {');
            expect(diagram).toContain('String id');
            expect(diagram).toContain('String title');
        });

        it('renders Post page with relationship and @relation attribute', () => {
            expect(postDoc).toContain('Relationships');
            expect(postDoc).toContain('| `author`');
            expect(postDoc).toContain('Many→One');

            const authorLine = postDoc.split('\n').find((l) => l.includes('field-author') && l.includes('@relation'));
            expect(authorLine).toBeDefined();
            expect(authorLine).toContain('fields: [authorId]');
            expect(authorLine).not.toContain('fields: fields:');
        });
    });

    it('ER diagram caps related entity fields at 10', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id    String @id @default(cuid())
                posts Post[]
            }
            model Post {
                id       String @id @default(cuid())
                f1       String
                f2       String
                f3       String
                f4       String
                f5       String
                f6       String
                f7       String
                f8       String
                f9       String
                f10      String
                f11      String
                author   User   @relation(fields: [authorId], references: [id])
                authorId String
            }
        `);

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        const diagramStart = userDoc.indexOf('erDiagram');
        const diagramEnd = userDoc.indexOf('```', diagramStart);
        const diagram = userDoc.slice(diagramStart, diagramEnd);

        expect(diagram).toContain('Post {');
        expect(diagram).toContain('String f9');
        expect(diagram).not.toContain('String f11');
        expect(diagram).toContain('%% … and 3 more fields');
    });

    it('ER diagram does not include transitive (depth 2+) relationships', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id      String @id @default(cuid())
                posts   Post[]
                profile Profile?
            }
            model Post {
                id       String @id @default(cuid())
                author   User   @relation(fields: [authorId], references: [id])
                authorId String
            }
            model Profile {
                id     String @id @default(cuid())
                bio    String?
                user   User   @relation(fields: [userId], references: [id])
                userId String @unique
            }
        `);

        const postDoc = readDoc(tmpDir, 'models', 'Post.md');
        const diagramStart = postDoc.indexOf('erDiagram');
        const diagramEnd = postDoc.indexOf('```', diagramStart);
        const diagram = postDoc.slice(diagramStart, diagramEnd);
        expect(diagram).toContain('User');
        expect(diagram).not.toContain('Profile');
    });

    it('renders access policies with allow/deny rules, evaluation note, and [!IMPORTANT] alert', async () => {
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
        expect(userDoc).toContain('denied by default');
        expect(userDoc).toContain('@@deny');
        expect(userDoc).toContain('@@allow');
        expect(userDoc).toContain('> [!IMPORTANT]');
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
        expect(doc).toContain('`auth() == this`');
    });

    it('renders validation rules from field-level and model-level attributes', async () => {
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

    it('renders all predefined validation attributes', async () => {
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
        const validationSection = doc.split('✅ Validation Rules')[1]!;
        for (const attr of ['@regex', '@startsWith', '@endsWith', '@contains', '@email', '@url', '@length', '@trim', '@lower', '@upper', '@datetime', '@gt', '@gte', '@lt', '@lte']) {
            expect(validationSection).toContain(`\`${attr}\``);
        }
    });

    it('@@validate model-level rules render with expression text', async () => {
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

    it('model with @@map shows mapped table name in metadata', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id String @id @default(cuid())
                @@map("users")
            }
        `);
        expect(readDoc(tmpDir, 'models', 'User.md')).toContain('**Table:** `users`');
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
        await plugin.generate({ schemaFile: tmpSchemaFile, model, defaultOutputPath: tmpDir, pluginOptions: { output: tmpDir } });
        expect(readDoc(tmpDir, 'models', 'User.md')).toContain('**Schema:** `auth`');
    });

    it('renders @@auth and @@delegate badges on heading', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id String @id @default(cuid())
                email String
                @@auth
            }
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

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('<kbd>Auth</kbd>');
        expect(userDoc).toContain('<kbd>Model</kbd>');

        const assetDoc = readDoc(tmpDir, 'models', 'Asset.md');
        expect(assetDoc).toContain('<kbd>Delegate</kbd>');
        expect(assetDoc).toContain('<kbd>Model</kbd>');
    });

    it('shows Used in Procedures section and detects param type references', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id String @id @default(cuid())
            }
            model Post {
                id String @id @default(cuid())
            }
            procedure getUser(id: String): User
            mutation procedure signUp(name: String): User
            procedure listUsers(): User[]
            procedure findByUser(user: User): Post[]
        `);

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('Used in Procedures');
        expect(userDoc).toContain('[getUser](../procedures/getUser.md)');
        expect(userDoc).toContain('[signUp](../procedures/signUp.md)');
        expect(userDoc).toContain('[listUsers](../procedures/listUsers.md)');
        expect(userDoc).toContain('[findByUser](../procedures/findByUser.md)');

        const postDoc = readDoc(tmpDir, 'models', 'Post.md');
        expect(postDoc).toContain('[findByUser](../procedures/findByUser.md)');
    });

    it('includes prev/next navigation footer', async () => {
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
        expect(readDoc(tmpDir, 'relationships.md')).toContain('Employee');
    });

    describe('relationships.md', () => {
        let tmpDir: string;
        beforeAll(async () => {
            tmpDir = await generateFromSchema(`
                model User {
                    id         String @id @default(cuid())
                    posts      Post[] @relation("author")
                    pinnedPost Post?  @relation("pinned")
                    profile    Profile?
                }
                model Post {
                    id          String @id @default(cuid())
                    author      User   @relation("author", fields: [authorId], references: [id])
                    authorId    String
                    pinnedBy    User?  @relation("pinned", fields: [pinnedById], references: [id])
                    pinnedById  String? @unique
                    tags        Tag[]
                }
                model Tag {
                    id    String @id @default(cuid())
                    posts Post[]
                }
                model Profile {
                    id     String @id @default(cuid())
                    user   User   @relation(fields: [userId], references: [id])
                    userId String @unique
                }
            `);
        });

        it('renders cross-reference table, Mermaid diagram, and model page links', () => {
            const relDoc = readDoc(tmpDir, 'relationships.md');
            expect(relDoc).toContain('# Relationships');
            expect(relDoc).toContain('erDiagram');
            expect(relDoc).toContain('[Index](./index.md) / Relationships');
            expect(relDoc).toContain('[User](./models/User.md)');
            expect(relDoc).toContain('[Post](./models/Post.md)');
            expect(relDoc).toContain('[Tag](./models/Tag.md)');
        });

        it('uses correct Mermaid cardinality notation', () => {
            const relDoc = readDoc(tmpDir, 'relationships.md');
            expect(relDoc).toContain('||--o{');
            expect(relDoc).toContain('}o--||');
        });

        it('preserves multiple relationships between same model pair', () => {
            const relDoc = readDoc(tmpDir, 'relationships.md');
            const mermaidSection = relDoc.split('```mermaid')[1] ?? '';
            const postUserLines = mermaidSection.split('\n').filter((l) => l.includes('Post') && l.includes('User'));
            expect(postUserLines.length).toBeGreaterThanOrEqual(2);
        });
    });
});
