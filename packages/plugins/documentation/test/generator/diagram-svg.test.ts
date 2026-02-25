import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateFromSchema, readDoc } from '../utils';

describe('documentation plugin: per-page SVG diagrams', () => {
    it('model page references companion SVG file when diagramFormat is svg', async () => {
        const tmpDir = await generateFromSchema(
            `
            model User {
                id    String @id @default(cuid())
                name  String
                posts Post[]
            }
            model Post {
                id       String @id @default(cuid())
                title    String
                author   User   @relation(fields: [authorId], references: [id])
                authorId String
            }
            `,
            { diagramFormat: 'svg' },
        );

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).not.toContain('```mermaid');
        expect(userDoc).toContain('![diagram](./User-diagram.svg)');

        const svgPath = path.join(tmpDir, 'models', 'User-diagram.svg');
        expect(fs.existsSync(svgPath)).toBe(true);
        expect(fs.readFileSync(svgPath, 'utf-8')).toContain('<svg');
    });

    it('model page has SVG image and collapsible mermaid when diagramFormat is both', async () => {
        const tmpDir = await generateFromSchema(
            `
            model User {
                id    String @id @default(cuid())
                name  String
                posts Post[]
            }
            model Post {
                id       String @id @default(cuid())
                title    String
                author   User   @relation(fields: [authorId], references: [id])
                authorId String
            }
            `,
            { diagramFormat: 'both' },
        );

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('![diagram](./User-diagram.svg)');
        expect(userDoc).toContain('```mermaid');
        expect(userDoc).toContain('<details>');
        expect(userDoc).toContain('Mermaid source');

        expect(fs.existsSync(path.join(tmpDir, 'models', 'User-diagram.svg'))).toBe(true);
    });

    it('default behavior preserves inline mermaid with no SVG files', async () => {
        const tmpDir = await generateFromSchema(
            `
            model User {
                id    String @id @default(cuid())
                name  String
                posts Post[]
            }
            model Post {
                id       String @id @default(cuid())
                title    String
                author   User   @relation(fields: [authorId], references: [id])
                authorId String
            }
            `,
        );

        const userDoc = readDoc(tmpDir, 'models', 'User.md');
        expect(userDoc).toContain('```mermaid');
        expect(userDoc).not.toContain('![diagram]');
        expect(fs.existsSync(path.join(tmpDir, 'models', 'User-diagram.svg'))).toBe(false);
    });

    it('enum page gets companion SVG when diagramFormat is svg', async () => {
        const tmpDir = await generateFromSchema(
            `
            model User {
                id   String @id @default(cuid())
                role Role
            }
            enum Role { ADMIN USER }
            `,
            { diagramFormat: 'svg' },
        );

        const enumDoc = readDoc(tmpDir, 'enums', 'Role.md');
        expect(enumDoc).not.toContain('```mermaid');
        expect(enumDoc).toContain('![diagram](./Role-diagram.svg)');
        expect(fs.existsSync(path.join(tmpDir, 'enums', 'Role-diagram.svg'))).toBe(true);
    });

    it('procedure page gets companion SVG when diagramFormat is svg', async () => {
        const tmpDir = await generateFromSchema(
            `
            model User {
                id   String @id @default(cuid())
                name String
            }
            procedure getUser(id: String): User
            `,
            { diagramFormat: 'svg' },
        );

        const procDoc = readDoc(tmpDir, 'procedures', 'getUser.md');
        expect(procDoc).not.toContain('```mermaid');
        expect(procDoc).toContain('![diagram](./getUser-diagram.svg)');
        expect(fs.existsSync(path.join(tmpDir, 'procedures', 'getUser-diagram.svg'))).toBe(true);
    });

    it('relationships page gets companion SVG when diagramFormat is svg', async () => {
        const tmpDir = await generateFromSchema(
            `
            model User {
                id    String @id @default(cuid())
                posts Post[]
            }
            model Post {
                id       String @id @default(cuid())
                author   User   @relation(fields: [authorId], references: [id])
                authorId String
            }
            `,
            { diagramFormat: 'svg' },
        );

        const relDoc = readDoc(tmpDir, 'relationships.md');
        expect(relDoc).not.toContain('```mermaid');
        expect(relDoc).toContain('![diagram](./relationships-diagram.svg)');
        expect(fs.existsSync(path.join(tmpDir, 'relationships-diagram.svg'))).toBe(true);
    });

    it('erdTheme applies to companion SVG files', async () => {
        const tmpDir = await generateFromSchema(
            `
            model User {
                id    String @id @default(cuid())
                posts Post[]
            }
            model Post {
                id       String @id @default(cuid())
                author   User   @relation(fields: [authorId], references: [id])
                authorId String
            }
            `,
            { diagramFormat: 'svg', erdTheme: 'dracula' },
        );

        const svgPath = path.join(tmpDir, 'models', 'User-diagram.svg');
        expect(fs.existsSync(svgPath)).toBe(true);
        expect(fs.readFileSync(svgPath, 'utf-8')).toContain('<svg');
    });

    it('view page gets companion SVG when diagramFormat is svg', async () => {
        const tmpDir = await generateFromSchema(
            `
            model User {
                id   String @id @default(cuid())
                name String
            }
            view UserProfile {
                name String
            }
            `,
            { diagramFormat: 'svg' },
        );

        const viewDoc = readDoc(tmpDir, 'views', 'UserProfile.md');
        expect(viewDoc).not.toContain('```mermaid');
        expect(viewDoc).toContain('![diagram](./UserProfile-diagram.svg)');
        expect(fs.existsSync(path.join(tmpDir, 'views', 'UserProfile-diagram.svg'))).toBe(true);
    });
});
