import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { generateFromSchema } from '../utils';

function readFile(dir: string, filename: string): string {
    return fs.readFileSync(path.join(dir, filename), 'utf-8');
}

describe('documentation plugin: ERD generation', () => {
    it('generates a .mmd file with erDiagram header when generateErd is enabled', async () => {
        const tmpDir = await generateFromSchema(
            `
            model User {
                id    String @id @default(cuid())
                name  String
            }
            `,
            { generateErd: true },
        );

        const mmdPath = path.join(tmpDir, 'schema-erd.mmd');
        expect(fs.existsSync(mmdPath)).toBe(true);

        const mmd = fs.readFileSync(mmdPath, 'utf-8');
        expect(mmd).toContain('erDiagram');
    });

    describe('multi-model schema with relations', () => {
        let mmd: string;

        beforeAll(async () => {
            const tmpDir = await generateFromSchema(
                `
                model User {
                    id       String   @id @default(cuid())
                    email    String   @unique
                    posts    Post[]
                }
                model Post {
                    id       String   @id @default(cuid())
                    title    String
                    author   User     @relation(fields: [authorId], references: [id])
                    authorId String
                }
                `,
                { generateErd: true },
            );
            mmd = readFile(tmpDir, 'schema-erd.mmd');
        });

        it('includes entity blocks for all models with scalar fields', () => {
            expect(mmd).toContain('User {');
            expect(mmd).toContain('Post {');
            expect(mmd).toContain('String email');
            expect(mmd).toContain('String title');
        });

        it('annotates PK, UK, and FK fields correctly', () => {
            expect(mmd).toMatch(/String id PK/);
            expect(mmd).toMatch(/String email UK/);
            expect(mmd).toMatch(/String authorId FK/);
        });

        it('includes relationship connectors with correct cardinality', () => {
            expect(mmd).toContain('User ||--o{ Post');
        });

        it('deduplicates relationship connectors', () => {
            const connectorLines = mmd.split('\n').filter((l) => l.includes('||--o{') || l.includes('}o--||'));
            expect(connectorLines).toHaveLength(1);
        });
    });

    it('does not generate ERD files when generateErd is not set', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id String @id @default(cuid())
            }
        `);

        expect(fs.existsSync(path.join(tmpDir, 'schema-erd.mmd'))).toBe(false);
        expect(fs.existsSync(path.join(tmpDir, 'schema-erd.svg'))).toBe(false);
    });

    it('generates an SVG file when generateErd is enabled and format includes svg', async () => {
        const tmpDir = await generateFromSchema(
            `
            model Task {
                id     String @id @default(cuid())
                title  String
            }
            `,
            { generateErd: true },
        );

        const svgPath = path.join(tmpDir, 'schema-erd.svg');
        expect(fs.existsSync(svgPath)).toBe(true);

        const svg = fs.readFileSync(svgPath, 'utf-8');
        expect(svg).toContain('<svg');
    });

    it('generates only .mmd when erdFormat is mmd', async () => {
        const tmpDir = await generateFromSchema(
            `
            model Item {
                id String @id @default(cuid())
            }
            `,
            { generateErd: true, erdFormat: 'mmd' },
        );

        expect(fs.existsSync(path.join(tmpDir, 'schema-erd.mmd'))).toBe(true);
        expect(fs.existsSync(path.join(tmpDir, 'schema-erd.svg'))).toBe(false);
    });

    it('generates only .svg when erdFormat is svg', async () => {
        const tmpDir = await generateFromSchema(
            `
            model Item {
                id String @id @default(cuid())
            }
            `,
            { generateErd: true, erdFormat: 'svg' },
        );

        expect(fs.existsSync(path.join(tmpDir, 'schema-erd.svg'))).toBe(true);
        expect(fs.existsSync(path.join(tmpDir, 'schema-erd.mmd'))).toBe(false);
    });

    describe('index page integration', () => {
        let index: string;

        beforeAll(async () => {
            const tmpDir = await generateFromSchema(
                `
                model User {
                    id String @id @default(cuid())
                }
                `,
                { generateErd: true },
            );
            index = readFile(tmpDir, 'index.md');
        });

        it('embeds the ERD SVG as a diagram image in the index page', () => {
            expect(index).toContain('![Entity Relationship Diagram](./schema-erd.svg)');
        });

        it('includes an ERD entry in the table of contents navigation', () => {
            expect(index).toContain('[ERD](#erd)');
        });
    });
});
