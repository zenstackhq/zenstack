import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateFromSchema, readDoc } from '../utils';

describe('documentation plugin: procedure page', () => {
    it('procedure page includes external ZenStack docs link', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id String @id @default(cuid())
            }
            procedure getUser(id: String): User
        `);

        const procDoc = readDoc(tmpDir, 'procedures', 'getUser.md');
        expect(procDoc).toContain('zenstack.dev');
        expect(procDoc).toContain('procedure');
    });

    it('generates procedure page with heading, badge, and parameters table', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id String @id @default(cuid())
            }
            /// Register a new user.
            mutation procedure signUp(email: String, name: String, role: String?): User
        `);

        expect(fs.existsSync(path.join(tmpDir, 'procedures', 'signUp.md'))).toBe(true);
        const procDoc = readDoc(tmpDir, 'procedures', 'signUp.md');
        expect(procDoc).toContain('# signUp');
        expect(procDoc).toContain('<kbd>Mutation</kbd>');
        expect(procDoc).toContain('Register a new user.');
        expect(procDoc).toContain('[Index](../index.md)');

        expect(procDoc).toContain('Parameters');
        expect(procDoc).toContain('| `email`');
        expect(procDoc).toContain('| `name`');
        expect(procDoc).toContain('| `role`');
        const roleLine = procDoc.split('\n').find((l: string) => l.includes('| `role`'));
        expect(roleLine).toContain('No');

        expect(procDoc).toContain('Returns');
        expect(procDoc).toContain('User');
    });

    it('generates query procedure page with query badge', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id String @id @default(cuid())
            }
            procedure getUser(id: String): User
        `);

        const procDoc = readDoc(tmpDir, 'procedures', 'getUser.md');
        expect(procDoc).toContain('# getUser');
        expect(procDoc).toContain('<kbd>Query</kbd>');
        expect(procDoc).not.toContain('<kbd>Mutation</kbd>');
    });

    it('procedure page handles Void return type', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id String @id @default(cuid())
            }
            mutation procedure deleteUser(id: String): Void
        `);

        const procDoc = readDoc(tmpDir, 'procedures', 'deleteUser.md');
        expect(procDoc).toContain('Returns');
        expect(procDoc).toContain('`Void`');
    });

    it('procedure page handles array return type', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id String @id @default(cuid())
            }
            procedure listUsers(): User[]
        `);

        const procDoc = readDoc(tmpDir, 'procedures', 'listUsers.md');
        expect(procDoc).toContain('Returns');
        expect(procDoc).toContain('User');
        expect(procDoc).toContain('[]');
    });

    it('procedure page handles no parameters', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id String @id @default(cuid())
            }
            procedure listUsers(): User[]
        `);

        const procDoc = readDoc(tmpDir, 'procedures', 'listUsers.md');
        expect(procDoc).not.toContain('Parameters');
    });

    it('procedure page includes flowchart showing data flow', async () => {
        const tmpDir = await generateFromSchema(`
            enum Role { ADMIN USER }
            model User {
                id String @id @default(cuid())
            }
            mutation procedure signUp(email: String, name: String, role: Role?): User
        `);

        const procDoc = readDoc(tmpDir, 'procedures', 'signUp.md');
        expect(procDoc).toContain('```mermaid');
        expect(procDoc).toContain('flowchart LR');
        expect(procDoc).toContain('email');
        expect(procDoc).toContain('name');
        expect(procDoc).toContain('role');
        expect(procDoc).toContain('signUp');
        expect(procDoc).toContain('User');
    });

    it('procedure flowchart works with no params and Void return', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id String @id @default(cuid())
            }
            mutation procedure clearCache(): Void
        `);

        const procDoc = readDoc(tmpDir, 'procedures', 'clearCache.md');
        expect(procDoc).toContain('```mermaid');
        expect(procDoc).toContain('flowchart LR');
        expect(procDoc).toContain('clearCache');
        expect(procDoc).toContain('Void');
    });

    it('procedure return type links to model page', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id String @id @default(cuid())
            }
            procedure getUser(id: String): User
        `);

        const procDoc = readDoc(tmpDir, 'procedures', 'getUser.md');
        expect(procDoc).toContain('[User](../models/User.md)');
    });

    it('procedure return type links to type page', async () => {
        const tmpDir = await generateFromSchema(`
            type Stats {
                total Int
            }
            model User {
                id String @id @default(cuid())
            }
            procedure getStats(): Stats
        `);

        const procDoc = readDoc(tmpDir, 'procedures', 'getStats.md');
        expect(procDoc).toContain('[Stats](../types/Stats.md)');
    });

    it('procedure param type links to enum page', async () => {
        const tmpDir = await generateFromSchema(`
            enum Role { ADMIN USER }
            model User {
                id String @id @default(cuid())
            }
            mutation procedure setRole(userId: String, role: Role): User
        `);

        const procDoc = readDoc(tmpDir, 'procedures', 'setRole.md');
        const roleLine = procDoc.split('\n').find((l: string) => l.includes('| `role`'));
        expect(roleLine).toBeDefined();
        expect(roleLine).toContain('[Role](../enums/Role.md)');
    });

    it('procedure page includes collapsible declaration block', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id String @id @default(cuid())
            }
            /// Sign up a new user.
            mutation procedure signUp(email: String, name: String): User
        `);

        const procDoc = readDoc(tmpDir, 'procedures', 'signUp.md');
        expect(procDoc).toContain('<details>');
        expect(procDoc).toContain('<summary>Declaration');
        expect(procDoc).toContain('```prisma');
        expect(procDoc).toContain('mutation procedure signUp');
        expect(procDoc).toContain('</details>');
    });

    it('procedure page shows Defined In before Parameters, not between params and returns', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id String @id @default(cuid())
            }
            procedure getUser(id: String): User
        `);

        const procDoc = readDoc(tmpDir, 'procedures', 'getUser.md');
        expect(procDoc).toContain('**Defined in:**');
        expect(procDoc).toContain('.zmodel');
        const definedIdx = procDoc.indexOf('**Defined in:**');
        const paramsIdx = procDoc.indexOf('Parameters');
        const returnsIdx = procDoc.indexOf('Returns');
        if (paramsIdx !== -1) {
            expect(definedIdx).toBeLessThan(paramsIdx);
        }
        expect(definedIdx).toBeLessThan(returnsIdx);
    });
});
