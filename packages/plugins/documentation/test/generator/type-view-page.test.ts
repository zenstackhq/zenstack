import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { generateFromSchema, readDoc } from '../utils';

describe('documentation plugin: type page', () => {
    it('generates type page with heading, description, fields, source, declaration, and anchors', async () => {
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

        expect(typeDoc).toContain('**Defined in:**');
        expect(typeDoc).toContain('.zmodel');
        expect(typeDoc).toContain('<summary>Declaration');
        expect(typeDoc).toContain('```prisma');
        expect(typeDoc).toContain('type Timestamps {');

        expect(typeDoc).toContain('<a id="field-createdAt"></a>');
        expect(typeDoc).toContain('<a id="field-updatedAt"></a>');
    });

    describe('type with mixin consumers', () => {
        let tmpDir: string;
        beforeAll(async () => {
            tmpDir = await generateFromSchema(`
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
        });
        afterAll(() => { if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true }); });

        it('shows Used By section with model links and field deep-links', () => {
            const typeDoc = readDoc(tmpDir, 'types', 'Timestamps.md');
            expect(typeDoc).toContain('## 📍 Used By');
            expect(typeDoc).toContain('[Post](../models/Post.md');
            expect(typeDoc).toContain('[User](../models/User.md');
            expect(typeDoc).not.toContain('[Tag]');
            expect(typeDoc).toContain('../models/Post.md#field-createdAt');
            expect(typeDoc).toContain('../models/User.md#field-createdAt');
        });

        it('includes class diagram showing mixin usage', () => {
            const typeDoc = readDoc(tmpDir, 'types', 'Timestamps.md');
            expect(typeDoc).toContain('```mermaid');
            expect(typeDoc).toContain('classDiagram');
            expect(typeDoc).toContain('mixin');
            expect(typeDoc).toContain('Post');
            expect(typeDoc).toContain('User');
            expect(typeDoc).not.toMatch(/Tag/);
        });
    });

    it('omits class diagram when no models use it', async () => {
        const tmpDir = await generateFromSchema(`
            type Metadata {
                version Int @default(1)
            }
            model User {
                id String @id @default(cuid())
            }
        `);
        expect(readDoc(tmpDir, 'types', 'Metadata.md')).not.toContain('classDiagram');
    });

    it('fields default to declaration order', async () => {
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
});

describe('documentation plugin: view page', () => {
    it('renders view with badge, breadcrumb, fields, declaration, docs link, and anchors', async () => {
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
        expect(viewDoc).toContain('Flattened user info for reporting');

        expect(viewDoc).toContain('## 📋 Fields');
        expect(viewDoc).toContain('field-id');
        expect(viewDoc).toContain('field-email');
        expect(viewDoc).toContain('`Int`');
        expect(viewDoc).toContain('`String`');

        expect(viewDoc).toContain('<summary>Declaration');
        expect(viewDoc).toContain('view UserInfo');
        expect(viewDoc).toContain('https://zenstack.dev/docs/reference/zmodel/view');

        expect(viewDoc).toContain('<a id="field-id"></a>');
        expect(viewDoc).toContain('<a id="field-email"></a>');
    });

    it('Mermaid diagram renders primitive field types correctly', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id    String @id @default(cuid())
            }
            view UserSummary {
                id    Int
                name  String
            }
        `);

        const viewDoc = readDoc(tmpDir, 'views', 'UserSummary.md');
        expect(viewDoc).toContain('```mermaid');
        expect(viewDoc).not.toContain('Unknown');
        expect(viewDoc).toContain('Int id');
        expect(viewDoc).toContain('String name');
    });
});
