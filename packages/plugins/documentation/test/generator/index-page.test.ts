import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { generateFromSchema, readDoc } from '../utils';

describe('documentation plugin: index page', () => {
    describe('index page structure', () => {
        let tmpDir: string;
        beforeAll(async () => {
            tmpDir = await generateFromSchema(`
                /// A registered user in the platform.
                model User {
                    id    String @id @default(cuid())
                    role  Role
                    posts Post[]
                }
                /// Has a description.
                model Post {
                    id       String @id @default(cuid())
                    author   User   @relation(fields: [authorId], references: [id])
                    authorId String
                }
                /// Roles available in the system.
                enum Role {
                    ADMIN
                    USER
                }
                /// Common timestamp fields.
                type Timestamps {
                    createdAt DateTime @default(now())
                    updatedAt DateTime @updatedAt
                }
                type Metadata {
                    version Int @default(1)
                }
                procedure getUser(id: String): User
                mutation procedure signUp(name: String): User
            `);
        });

        it('produces index.md with summary counts, TOC, and introductory context', () => {
            const indexContent = readDoc(tmpDir, 'index.md');
            expect(fs.existsSync(path.join(tmpDir, 'index.md'))).toBe(true);
            expect(indexContent).toContain('# Schema Documentation');
            expect(indexContent).toContain('2 models');
            expect(indexContent).toContain('1 enum');
            expect(indexContent).toContain('2 types');
            expect(indexContent).toContain('2 procedures');
            expect(indexContent).toContain('ZModel');
            expect(indexContent).toContain('zenstack.dev');

            expect(indexContent).toContain('[Models](#models)');
            expect(indexContent).toContain('[Enums](#enums)');
            expect(indexContent).toContain('[Types](#types)');
            expect(indexContent).toContain('[Procedures](#procedures)');
            const tocLine = indexContent.split('\n').find((l) => l.includes('[Models](#models)'));
            expect(tocLine).toContain('[Enums](#enums)');
        });

        it('lists entities alpha-sorted with links and inline descriptions', () => {
            const indexContent = readDoc(tmpDir, 'index.md');

            expect(indexContent).toContain('[Post](./models/Post.md)');
            expect(indexContent).toContain('[User](./models/User.md)');
            const postIdx = indexContent.indexOf('[Post]');
            const userIdx = indexContent.indexOf('[User]');
            expect(postIdx).toBeLessThan(userIdx);

            expect(indexContent).toContain('A registered user in the platform');
            expect(indexContent).toContain('Has a description');
            expect(indexContent).toContain('Roles available in the system');
            expect(indexContent).toContain('Common timestamp fields');

            expect(indexContent).toContain('[Role](./enums/Role.md)');
            expect(indexContent).toContain('[Metadata](./types/Metadata.md)');
            expect(indexContent).toContain('[Timestamps](./types/Timestamps.md)');
            const metaIdx = indexContent.indexOf('[Metadata]');
            const tsIdx = indexContent.indexOf('[Timestamps]');
            expect(metaIdx).toBeLessThan(tsIdx);
        });

        it('lists procedures with query/mutation distinction and links to relationships', () => {
            const indexContent = readDoc(tmpDir, 'index.md');
            expect(indexContent).toContain('[getUser](./procedures/getUser.md)');
            expect(indexContent).toContain('[signUp](./procedures/signUp.md)');
            expect(indexContent).toContain('query');
            expect(indexContent).toContain('mutation');
            expect(indexContent).toContain('[Relationships](./relationships.md)');
        });

        it('includes generation stats section', () => {
            const indexContent = readDoc(tmpDir, 'index.md');
            expect(indexContent).toContain('Generation Stats');
            expect(indexContent).toContain('Files');
            expect(indexContent).toContain('Duration');
            expect(indexContent).toMatch(/\d+(\.\d+)?\s*ms/);
        });
    });

    it('lists views in a separate section from models', async () => {
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

        const countWithout = readDoc(withoutSkill, 'index.md').match(/\*\*Files\*\* \| (\d+)/);
        const countWith = readDoc(withSkill, 'index.md').match(/\*\*Files\*\* \| (\d+)/);
        expect(countWithout).not.toBeNull();
        expect(countWith).not.toBeNull();
        expect(Number(countWith![1])).toBe(Number(countWithout![1]) + 1);
    });
});
