import { beforeAll, describe, expect, it } from 'vitest';
import { generateFromSchema, readDoc } from '../utils';

describe('documentation plugin: procedure page', () => {
    describe('procedure pages', () => {
        let tmpDir: string;
        beforeAll(async () => {
            tmpDir = await generateFromSchema(`
                model User {
                    id String @id @default(cuid())
                }
                enum Role { ADMIN USER }
                type Stats {
                    total Int
                }
                /// Register a new user.
                mutation procedure signUp(email: String, name: String, role: Role?): User
                procedure getUser(id: String): User
                mutation procedure deleteUser(id: String): Void
                procedure listUsers(): User[]
                mutation procedure clearCache(): Void
                procedure getStats(): Stats
                mutation procedure setRole(userId: String, role: Role): User
            `);
        });

        it('renders mutation page with heading, badge, description, params, returns, declaration, and flowchart', () => {
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

            expect(procDoc).toContain('<details>');
            expect(procDoc).toContain('<summary>Declaration');
            expect(procDoc).toContain('```prisma');
            expect(procDoc).toContain('mutation procedure signUp');
            expect(procDoc).toContain('</details>');

            expect(procDoc).toContain('```mermaid');
            expect(procDoc).toContain('flowchart LR');
            expect(procDoc).toContain('signUp');
        });

        it('renders query page with query badge', () => {
            const procDoc = readDoc(tmpDir, 'procedures', 'getUser.md');
            expect(procDoc).toContain('# getUser');
            expect(procDoc).toContain('<kbd>Query</kbd>');
            expect(procDoc).not.toContain('<kbd>Mutation</kbd>');
        });

        it('handles Void and array return types and no-params procedures', () => {
            const deleteDoc = readDoc(tmpDir, 'procedures', 'deleteUser.md');
            expect(deleteDoc).toContain('`Void`');

            const listDoc = readDoc(tmpDir, 'procedures', 'listUsers.md');
            expect(listDoc).toContain('User');
            expect(listDoc).not.toContain('Parameters');

            const cacheDoc = readDoc(tmpDir, 'procedures', 'clearCache.md');
            expect(cacheDoc).toContain('```mermaid');
            expect(cacheDoc).toContain('flowchart LR');
            expect(cacheDoc).toContain('Void');
        });

        it('wraps scalar return types with modifiers in backticks as a single unit', async () => {
            const dir = await generateFromSchema(`
                model User {
                    id String @id @default(cuid())
                }
                procedure listTags(): String[]
            `);
            const procDoc = readDoc(dir, 'procedures', 'listTags.md');
            expect(procDoc).toContain('`String[]`');
            expect(procDoc).not.toContain('`String`[]');
        });

        it('links return types and param types to model, type, and enum pages', () => {
            expect(readDoc(tmpDir, 'procedures', 'getUser.md')).toContain('[User](../models/User.md)');
            expect(readDoc(tmpDir, 'procedures', 'getStats.md')).toContain('[Stats](../types/Stats.md)');

            const setRoleDoc = readDoc(tmpDir, 'procedures', 'setRole.md');
            const roleLine = setRoleDoc.split('\n').find((l: string) => l.includes('| `role`'));
            expect(roleLine).toContain('[Role](../enums/Role.md)');
        });

        it('shows Defined In before Parameters and includes external docs link', () => {
            const procDoc = readDoc(tmpDir, 'procedures', 'getUser.md');
            expect(procDoc).toContain('**Defined in:**');
            expect(procDoc).toContain('.zmodel');
            expect(procDoc).toContain('zenstack.dev');

            const definedIdx = procDoc.indexOf('**Defined in:**');
            const paramsIdx = procDoc.indexOf('Parameters');
            const returnsIdx = procDoc.indexOf('Returns');
            if (paramsIdx !== -1) {
                expect(definedIdx).toBeLessThan(paramsIdx);
            }
            expect(definedIdx).toBeLessThan(returnsIdx);
        });
    });
});
