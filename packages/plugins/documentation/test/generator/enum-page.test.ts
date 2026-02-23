import { beforeAll, describe, expect, it } from 'vitest';
import { generateFromSchema, readDoc } from '../utils';

describe('documentation plugin: enum page', () => {
    it('generates enum page with heading, description, values, source, and declaration', async () => {
        const tmpDir = await generateFromSchema(`
            /// User roles in the system.
            enum Role {
                /// Full access
                ADMIN
                /// Standard access
                USER
                GUEST
            }
            model User {
                id   String @id @default(cuid())
                role Role
            }
        `);

        const enumDoc = readDoc(tmpDir, 'enums', 'Role.md');
        expect(enumDoc).toContain('# Role');
        expect(enumDoc).toContain('User roles in the system.');
        expect(enumDoc).toContain('## 🏷️ Values');
        expect(enumDoc).toContain('| `ADMIN`');
        expect(enumDoc).toContain('Full access');
        expect(enumDoc).toContain('| `USER`');
        expect(enumDoc).toContain('Standard access');
        expect(enumDoc).toContain('| `GUEST`');

        expect(enumDoc).toContain('**Defined in:**');
        expect(enumDoc).toContain('.zmodel');
        expect(enumDoc).toContain('<summary>Declaration');
        expect(enumDoc).toContain('```prisma');
        expect(enumDoc).toContain('enum Role {');

        expect(enumDoc).toContain('zenstack.dev');
    });

    describe('enum with usage by models', () => {
        let tmpDir: string;
        beforeAll(async () => {
            tmpDir = await generateFromSchema(`
                model User {
                    id   String @id @default(cuid())
                    role Role
                }
                model Post {
                    id     String @id @default(cuid())
                    status Role
                }
                enum Role {
                    ADMIN
                    USER
                }
            `);
        });

        it('shows Used By section with model links, class diagram, and field deep-links', () => {
            const roleDoc = readDoc(tmpDir, 'enums', 'Role.md');
            expect(roleDoc).toContain('[Index](../index.md)');
            expect(roleDoc).toContain('## 📍 Used By');
            expect(roleDoc).toContain('[Post](../models/Post.md)');
            expect(roleDoc).toContain('[User](../models/User.md)');

            expect(roleDoc).toContain('```mermaid');
            expect(roleDoc).toContain('classDiagram');
            expect(roleDoc).toContain('enumeration');
            expect(roleDoc).toContain('role');
            expect(roleDoc).toContain('status');

            expect(roleDoc).toContain('../models/Post.md#field-status');
            expect(roleDoc).toContain('../models/User.md#field-role');
        });
    });

    it('omits class diagram when no models use it', async () => {
        const tmpDir = await generateFromSchema(`
            enum Status { ACTIVE INACTIVE }
            model User {
                id String @id @default(cuid())
            }
        `);

        expect(readDoc(tmpDir, 'enums', 'Status.md')).not.toContain('```mermaid');
    });

    it('links to views (not models) when a view references the enum', async () => {
        const tmpDir = await generateFromSchema(`
            enum Status { ACTIVE INACTIVE }
            model Post {
                id     String @id @default(cuid())
                status Status
            }
            view PostSummary {
                id     String
                status Status
            }
        `);

        const enumDoc = readDoc(tmpDir, 'enums', 'Status.md');
        expect(enumDoc).toContain('## 📍 Used By');
        expect(enumDoc).toContain('[PostSummary](../views/PostSummary.md)');
        expect(enumDoc).toContain('../views/PostSummary.md#field-status');
        expect(enumDoc).toContain('[Post](../models/Post.md)');
        expect(enumDoc).not.toContain('[PostSummary](../models/PostSummary.md)');
    });

    it('includes prev/next navigation footer', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id String @id @default(cuid())
            }
            enum Alpha { A B }
            enum Beta { X Y }
            enum Gamma { P Q }
        `);

        expect(readDoc(tmpDir, 'enums', 'Alpha.md')).toContain('Next: [Beta](./Beta.md)');
        const betaDoc = readDoc(tmpDir, 'enums', 'Beta.md');
        expect(betaDoc).toContain('Previous: [Alpha](./Alpha.md)');
        expect(betaDoc).toContain('Next: [Gamma](./Gamma.md)');
    });
});
