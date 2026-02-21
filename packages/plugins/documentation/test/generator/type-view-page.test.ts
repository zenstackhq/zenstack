import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateFromSchema, readDoc } from '../utils';

describe('documentation plugin: type page', () => {
    it('generates type page with heading, description, and fields table', async () => {
        const tmpDir = await generateFromSchema(`
            /// Common timestamp fields for all models.
            type Timestamps {
                createdAt DateTime @default(now())
                updatedAt DateTime @updatedAt
            }
            model User {
                id String @id @default(cuid())
            }
        `);

        expect(fs.existsSync(path.join(tmpDir, 'types', 'Timestamps.md'))).toBe(true);
        const typeDoc = readDoc(tmpDir, 'types', 'Timestamps.md');
        expect(typeDoc).toContain('# Timestamps');
        expect(typeDoc).toContain('Common timestamp fields');
        expect(typeDoc).toContain('[Index](../index.md)');
        expect(typeDoc).toContain('## 📋 Fields');
        expect(typeDoc).toContain('field-createdAt');
        expect(typeDoc).toContain('field-updatedAt');
    });

    it('type page shows Used By section linking to models that use it', async () => {
        const tmpDir = await generateFromSchema(`
            type Timestamps {
                createdAt DateTime @default(now())
                updatedAt DateTime @updatedAt
            }
            model User with Timestamps {
                id String @id @default(cuid())
            }
            model Post with Timestamps {
                id String @id @default(cuid())
            }
            model Tag {
                id String @id @default(cuid())
            }
        `);

        const typeDoc = readDoc(tmpDir, 'types', 'Timestamps.md');
        expect(typeDoc).toContain('## 🔗 Used By');
        expect(typeDoc).toContain('[Post](../models/Post.md');
        expect(typeDoc).toContain('[User](../models/User.md');
        expect(typeDoc).not.toContain('[Tag]');
    });

    it('type page includes class diagram showing mixin usage', async () => {
        const tmpDir = await generateFromSchema(`
            type Timestamps {
                createdAt DateTime @default(now())
                updatedAt DateTime @updatedAt
            }
            model User with Timestamps {
                id String @id @default(cuid())
            }
            model Post with Timestamps {
                id String @id @default(cuid())
            }
            model Tag {
                id String @id @default(cuid())
            }
        `);

        const typeDoc = readDoc(tmpDir, 'types', 'Timestamps.md');
        expect(typeDoc).toContain('```mermaid');
        expect(typeDoc).toContain('classDiagram');
        expect(typeDoc).toContain('Timestamps');
        expect(typeDoc).toContain('mixin');
        expect(typeDoc).toContain('Post');
        expect(typeDoc).toContain('User');
        expect(typeDoc).not.toMatch(/Tag/);
    });

    it('type page omits class diagram when no models use it', async () => {
        const tmpDir = await generateFromSchema(`
            type Metadata {
                version Int @default(1)
            }
            model User {
                id String @id @default(cuid())
            }
        `);

        const typeDoc = readDoc(tmpDir, 'types', 'Metadata.md');
        expect(typeDoc).not.toContain('```mermaid');
        expect(typeDoc).not.toContain('classDiagram');
    });

    it('type page fields default to declaration order', async () => {
        const tmpDir = await generateFromSchema(`
            type Metadata {
                version Int @default(1)
                createdBy String
                active Boolean
            }
            model User {
                id String @id @default(cuid())
            }
        `);

        const typeDoc = readDoc(tmpDir, 'types', 'Metadata.md');

        const versionIdx = typeDoc.indexOf('field-version');
        const createdByIdx = typeDoc.indexOf('field-createdBy');
        const activeIdx = typeDoc.indexOf('field-active');
        expect(versionIdx).toBeLessThan(createdByIdx);
        expect(createdByIdx).toBeLessThan(activeIdx);
    });

    it('type page shows source file path', async () => {
        const tmpDir = await generateFromSchema(`
            type Timestamps {
                createdAt DateTime @default(now())
            }
            model User {
                id String @id @default(cuid())
            }
        `);

        const typeDoc = readDoc(tmpDir, 'types', 'Timestamps.md');
        expect(typeDoc).toContain('**Defined in:**');
        expect(typeDoc).toContain('.zmodel');
    });

    it('type page includes declaration code block', async () => {
        const tmpDir = await generateFromSchema(`
            /// Shared timestamp fields.
            type Timestamps {
                createdAt DateTime @default(now())
                updatedAt DateTime @updatedAt
            }
            model User {
                id String @id @default(cuid())
            }
        `);

        const typeDoc = readDoc(tmpDir, 'types', 'Timestamps.md');
        expect(typeDoc).toContain('<summary>Declaration');
        expect(typeDoc).toContain('```prisma');
        expect(typeDoc).toContain('type Timestamps {');
        expect(typeDoc).toContain('createdAt DateTime');
    });

    it('type field rows include anchor IDs', async () => {
        const tmpDir = await generateFromSchema(`
            type Timestamps {
                createdAt DateTime @default(now())
                updatedAt DateTime @updatedAt
            }
            model User {
                id String @id @default(cuid())
            }
        `);

        const typeDoc = readDoc(tmpDir, 'types', 'Timestamps.md');
        expect(typeDoc).toContain('<a id="field-createdAt"></a>');
        expect(typeDoc).toContain('<a id="field-updatedAt"></a>');
    });

    it('type Used By deep-links to specific field anchors on model pages', async () => {
        const tmpDir = await generateFromSchema(`
            type Timestamps {
                createdAt DateTime @default(now())
                updatedAt DateTime @updatedAt
            }
            model User with Timestamps {
                id String @id @default(cuid())
            }
            model Post with Timestamps {
                id String @id @default(cuid())
            }
        `);

        const typeDoc = readDoc(tmpDir, 'types', 'Timestamps.md');
        expect(typeDoc).toContain('## 🔗 Used By');
        expect(typeDoc).toContain('../models/Post.md#field-createdAt');
        expect(typeDoc).toContain('../models/User.md#field-createdAt');
    });
});

describe('documentation plugin: view page', () => {
    it('view page renders with View badge, breadcrumb, and fields', async () => {
        const tmpDir = await generateFromSchema(`
            /// Flattened user info for reporting.
            view UserInfo {
                id    Int
                email String
                name  String
            }
            model User {
                id String @id @default(cuid())
            }
        `);

        const viewDoc = readDoc(tmpDir, 'views', 'UserInfo.md');

        expect(viewDoc).toContain('<kbd>View</kbd>');
        expect(viewDoc).not.toContain('<kbd>Model</kbd>');

        expect(viewDoc).toContain('[Views](../index.md#views)');
        expect(viewDoc).not.toContain('[Models]');

        expect(viewDoc).toContain('Flattened user info for reporting');

        expect(viewDoc).toContain('## 📋 Fields');
        expect(viewDoc).toContain('field-id');
        expect(viewDoc).toContain('field-email');
        expect(viewDoc).toContain('field-name');
        expect(viewDoc).toContain('`Int`');
        expect(viewDoc).toContain('`String`');
    });

    it('view page includes declaration block', async () => {
        const tmpDir = await generateFromSchema(`
            view ActiveUsers {
                id    Int
                count Int
            }
            model User {
                id String @id @default(cuid())
            }
        `);

        const viewDoc = readDoc(tmpDir, 'views', 'ActiveUsers.md');
        expect(viewDoc).toContain('<summary>Declaration');
        expect(viewDoc).toContain('view ActiveUsers');
    });

    it('view page includes external ZenStack docs link', async () => {
        const tmpDir = await generateFromSchema(`
            view UserInfo {
                id Int
                name String
            }
        `);

        const viewDoc = readDoc(tmpDir, 'views', 'UserInfo.md');
        expect(viewDoc).toContain('zenstack.dev');
        expect(viewDoc).toContain('view');
    });

    it('view field rows include anchor IDs', async () => {
        const tmpDir = await generateFromSchema(`
            view UserProfile {
                id    String
                email String
            }
        `);

        const viewDoc = readDoc(tmpDir, 'views', 'UserProfile.md');
        expect(viewDoc).toContain('<a id="field-id"></a>');
        expect(viewDoc).toContain('<a id="field-email"></a>');
    });
});
