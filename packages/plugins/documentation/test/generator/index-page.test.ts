import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateFromSchema, readDoc } from '../utils';

describe('documentation plugin: index page', () => {
    it('produces an index.md file', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id String @id @default(cuid())
            }
        `);

        expect(fs.existsSync(path.join(tmpDir, 'index.md'))).toBe(true);
    });

    it('index page shows summary line with artifact counts', async () => {
        const tmpDir = await generateFromSchema(`
            enum Role { ADMIN MEMBER }
            type Timestamps {
                createdAt DateTime @default(now())
            }
            model User {
                id String @id @default(cuid())
            }
            model Post {
                id String @id @default(cuid())
            }
        `);

        const indexContent = readDoc(tmpDir, 'index.md');
        expect(indexContent).toContain('2 models');
        expect(indexContent).toContain('1 enum');
        expect(indexContent).toContain('1 type');
    });

    it('index page lists views in a separate section from models', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id String @id @default(cuid())
            }
            view UserInfo {
                id    Int
                email String
                name  String
            }
            view ActiveUsers {
                id    Int
                count Int
            }
        `);

        const indexContent = readDoc(tmpDir, 'index.md');
        expect(indexContent).toContain('Views');
        expect(indexContent).toContain('[ActiveUsers](./views/ActiveUsers.md)');
        expect(indexContent).toContain('[UserInfo](./views/UserInfo.md)');
        expect(indexContent).toContain('2 views');
        expect(fs.existsSync(path.join(tmpDir, 'views', 'UserInfo.md'))).toBe(true);
        expect(fs.existsSync(path.join(tmpDir, 'views', 'ActiveUsers.md'))).toBe(true);
    });

    it('index page lists models alpha-sorted with links', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id String @id @default(cuid())
            }
            model Post {
                id String @id @default(cuid())
            }
        `);

        const indexContent = readDoc(tmpDir, 'index.md');
        expect(indexContent).toContain('# Schema Documentation');
        expect(indexContent).toContain('[Post](./models/Post.md)');
        expect(indexContent).toContain('[User](./models/User.md)');
        const postIdx = indexContent.indexOf('[Post]');
        const userIdx = indexContent.indexOf('[User]');
        expect(postIdx).toBeLessThan(userIdx);
    });

    it('index page lists enums alpha-sorted with links', async () => {
        const tmpDir = await generateFromSchema(`
            enum Role {
                ADMIN
                USER
            }
        `);

        const indexContent = readDoc(tmpDir, 'index.md');
        expect(indexContent).toContain('Enums');
        expect(indexContent).toContain('[Role](./enums/Role.md)');
    });

    it('index page lists types alpha-sorted with links', async () => {
        const tmpDir = await generateFromSchema(`
            type Timestamps {
                createdAt DateTime @default(now())
                updatedAt DateTime @updatedAt
            }
            type Metadata {
                version Int @default(1)
            }
            model User {
                id String @id @default(cuid())
            }
        `);

        const indexContent = readDoc(tmpDir, 'index.md');
        expect(indexContent).toContain('Types');
        expect(indexContent).toContain('[Metadata](./types/Metadata.md)');
        expect(indexContent).toContain('[Timestamps](./types/Timestamps.md)');
        const metaIdx = indexContent.indexOf('[Metadata]');
        const tsIdx = indexContent.indexOf('[Timestamps]');
        expect(metaIdx).toBeLessThan(tsIdx);
    });

    it('index page has horizontal TOC with links to present sections', async () => {
        const tmpDir = await generateFromSchema(`
            enum Role { ADMIN USER }
            type Timestamps {
                createdAt DateTime @default(now())
            }
            model User {
                id   String @id @default(cuid())
                role Role
                posts Post[]
            }
            model Post {
                id       String @id @default(cuid())
                author   User   @relation(fields: [authorId], references: [id])
                authorId String
            }
            procedure getUser(id: String): User
        `);

        const indexContent = readDoc(tmpDir, 'index.md');
        expect(indexContent).toContain('[Models](#models)');
        expect(indexContent).toContain('[Enums](#enums)');
        expect(indexContent).toContain('[Types](#types)');
        expect(indexContent).toContain('[Procedures](#procedures)');

        const tocLine = indexContent.split('\n').find((l) => l.includes('[Models](#models)'));
        expect(tocLine).toBeDefined();
        expect(tocLine).toContain('[Enums](#enums)');
    });

    it('index page includes introductory context paragraph', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id String @id @default(cuid())
            }
        `, {}, '/app/project/schema.zmodel');

        const indexContent = readDoc(tmpDir, 'index.md');
        expect(indexContent).toContain('ZModel');
        expect(indexContent).toContain('zenstack.dev');
    });

    it('uses custom title from plugin options', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id String @id @default(cuid())
            }
        `, { title: 'My API' });

        const indexContent = readDoc(tmpDir, 'index.md');
        expect(indexContent).toContain('# My API');
        expect(indexContent).not.toContain('# Schema Documentation');
    });

    it('groups models by category when groupBy = category', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id String @id @default(cuid())
                @@meta('doc:category', 'Identity')
            }
            model Post {
                id String @id @default(cuid())
                @@meta('doc:category', 'Content')
            }
            model Uncategorized {
                id String @id @default(cuid())
            }
        `, { groupBy: 'category' });

        expect(fs.existsSync(path.join(tmpDir, 'models', 'Identity', 'User.md'))).toBe(true);
        expect(fs.existsSync(path.join(tmpDir, 'models', 'Content', 'Post.md'))).toBe(true);
        expect(fs.existsSync(path.join(tmpDir, 'models', 'Uncategorized.md'))).toBe(true);
    });

    it('index page links to relationships.md', async () => {
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

        const indexContent = readDoc(tmpDir, 'index.md');
        expect(indexContent).toContain('[Relationships](./relationships.md)');
    });

    it('groupBy=category produces correct index links', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id String @id @default(cuid())
                @@meta('doc:category', 'Identity')
            }
            model Post {
                id String @id @default(cuid())
                @@meta('doc:category', 'Content')
            }
            model Uncategorized {
                id String @id @default(cuid())
            }
        `, { groupBy: 'category' });

        const indexContent = readDoc(tmpDir, 'index.md');
        expect(indexContent).toContain('[User](./models/Identity/User.md)');
        expect(indexContent).toContain('[Post](./models/Content/Post.md)');
        expect(indexContent).toContain('[Uncategorized](./models/Uncategorized.md)');
    });

    it('deprecated model with description uses consistent em dash formatting', async () => {
        const tmpDir = await generateFromSchema(`
            /// Old user model.
            model OldUser {
                id String @id @default(cuid())
                @@meta('doc:deprecated', 'Use UserV2 instead')
            }
            model UserV2 {
                id String @id @default(cuid())
            }
        `);

        const indexContent = readDoc(tmpDir, 'index.md');
        expect(indexContent).toContain('~~[OldUser]');
        expect(indexContent).toContain('*Deprecated: Use UserV2 instead*');
        expect(indexContent).toContain('— Old user model');
        expect(indexContent).not.toMatch(/\*Deprecated: Use UserV2 instead\* Old user/);
    });

    it('index page lists procedures with query/mutation distinction', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id String @id @default(cuid())
            }
            procedure getUser(id: String): User
            mutation procedure signUp(name: String): User
        `);

        const indexContent = readDoc(tmpDir, 'index.md');
        expect(indexContent).toContain('Procedures');
        expect(indexContent).toContain('[getUser](./procedures/getUser.md)');
        expect(indexContent).toContain('[signUp](./procedures/signUp.md)');
        expect(indexContent).toContain('query');
        expect(indexContent).toContain('mutation');
    });

    it('index page summary includes procedure count', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id String @id @default(cuid())
            }
            procedure getUser(id: String): User
            mutation procedure signUp(name: String): User
        `);

        const indexContent = readDoc(tmpDir, 'index.md');
        expect(indexContent).toContain('2 procedures');
    });

    it('index page shows entity descriptions inline', async () => {
        const tmpDir = await generateFromSchema(`
            /// A registered user in the platform.
            model User {
                id String @id @default(cuid())
            }
            /// Tracks system events.
            model Activity {
                id String @id @default(cuid())
            }
            /// Roles available in the system.
            enum Role {
                ADMIN
                USER
            }
            /// Common timestamp fields.
            type Timestamps {
                createdAt DateTime @default(now())
            }
        `);

        const indexContent = readDoc(tmpDir, 'index.md');
        expect(indexContent).toContain('[Activity](./models/Activity.md)');
        expect(indexContent).toContain('Tracks system events');
        expect(indexContent).toContain('[User](./models/User.md)');
        expect(indexContent).toContain('A registered user in the platform');
        expect(indexContent).toContain('Roles available in the system');
        expect(indexContent).toContain('Common timestamp fields');
    });

    it('index page handles entities without descriptions', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id String @id @default(cuid())
            }
            /// Has a description.
            model Post {
                id String @id @default(cuid())
            }
        `);

        const indexContent = readDoc(tmpDir, 'index.md');
        expect(indexContent).toContain('[Post](./models/Post.md)');
        expect(indexContent).toContain('Has a description');
        expect(indexContent).toContain('[User](./models/User.md)');
    });

    it('index page includes generation stats section', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id String @id @default(cuid())
                posts Post[]
            }
            model Post {
                id       String @id @default(cuid())
                author   User   @relation(fields: [authorId], references: [id])
                authorId String
            }
        `);

        const indexContent = readDoc(tmpDir, 'index.md');
        expect(indexContent).toContain('Generation Stats');
        expect(indexContent).toContain('Files');
        expect(indexContent).toContain('Duration');
        expect(indexContent).toMatch(/\d+(\.\d+)?\s*ms/);
    });

    it('filesGenerated count includes SKILL.md when generateSkill is enabled', async () => {
        const withoutSkill = await generateFromSchema(`
            model User {
                id String @id @default(cuid())
            }
        `);
        const withSkill = await generateFromSchema(`
            model User {
                id String @id @default(cuid())
            }
        `, { generateSkill: true });

        const indexWithout = readDoc(withoutSkill, 'index.md');
        const indexWith = readDoc(withSkill, 'index.md');

        const countWithout = indexWithout.match(/\*\*Files\*\* \| (\d+)/);
        const countWith = indexWith.match(/\*\*Files\*\* \| (\d+)/);

        expect(countWithout).not.toBeNull();
        expect(countWith).not.toBeNull();
        expect(Number(countWith![1])).toBe(Number(countWithout![1]) + 1);
    });
});
