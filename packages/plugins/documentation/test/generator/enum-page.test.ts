import { describe, expect, it } from 'vitest';
import { generateFromSchema, readDoc } from '../utils';

describe('documentation plugin: enum page', () => {
    it('enum page shows source file path', async () => {
        const tmpDir = await generateFromSchema(`
            enum Role {
                ADMIN
                MEMBER
            }
            model User {
                id   String @id @default(cuid())
                role Role
            }
        `);

        const enumDoc = readDoc(tmpDir, 'enums', 'Role.md');
        expect(enumDoc).toContain('**Defined in:**');
        expect(enumDoc).toContain('.zmodel');
    });

    it('enum page includes declaration code block', async () => {
        const tmpDir = await generateFromSchema(`
            /// User roles in the system.
            enum Role {
                ADMIN
                MEMBER
            }
            model User {
                id   String @id @default(cuid())
                role Role
            }
        `);

        const enumDoc = readDoc(tmpDir, 'enums', 'Role.md');
        expect(enumDoc).toContain('<summary>Declaration');
        expect(enumDoc).toContain('```prisma');
        expect(enumDoc).toContain('enum Role {');
        expect(enumDoc).toContain('ADMIN');
    });

    it('enum page includes external ZenStack docs link', async () => {
        const tmpDir = await generateFromSchema(`
            enum Role { ADMIN USER }
            model User {
                id String @id @default(cuid())
                role Role
            }
        `);

        const roleDoc = readDoc(tmpDir, 'enums', 'Role.md');
        expect(roleDoc).toContain('zenstack.dev');
        expect(roleDoc).toContain('enum');
    });

    it('generates enum page with heading, description, and values', async () => {
        const tmpDir = await generateFromSchema(`
            /// User roles in the system.
            enum Role {
                /// Full access
                ADMIN
                /// Standard access
                USER
                GUEST
            }
        `);

        const enumDoc = readDoc(tmpDir, 'enums', 'Role.md');
        expect(enumDoc).toContain('# Role');
        expect(enumDoc).toContain('User roles in the system.');
        expect(enumDoc).toContain('## \u{1F4CB} Values');
        expect(enumDoc).toContain('| `ADMIN`');
        expect(enumDoc).toContain('Full access');
        expect(enumDoc).toContain('| `USER`');
        expect(enumDoc).toContain('Standard access');
        expect(enumDoc).toContain('| `GUEST`');
    });

    it('enum pages link back to index and show used-by models', async () => {
        const tmpDir = await generateFromSchema(`
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

        const roleDoc = readDoc(tmpDir, 'enums', 'Role.md');
        expect(roleDoc).toContain('[Index](../index.md)');
        expect(roleDoc).toContain('## \u{1F517} Used By');
        expect(roleDoc).toContain('[Post](../models/Post.md)');
        expect(roleDoc).toContain('[User](../models/User.md)');
    });

    it('enum page includes class diagram showing usage by models', async () => {
        const tmpDir = await generateFromSchema(`
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

        const roleDoc = readDoc(tmpDir, 'enums', 'Role.md');
        expect(roleDoc).toContain('```mermaid');
        expect(roleDoc).toContain('classDiagram');
        expect(roleDoc).toContain('enumeration');
        expect(roleDoc).toContain('ADMIN');
        expect(roleDoc).toContain('USER');
        expect(roleDoc).toContain('Post');
        expect(roleDoc).toContain('User');
        expect(roleDoc).toContain('role');
        expect(roleDoc).toContain('status');
    });

    it('enum page omits class diagram when no models use it', async () => {
        const tmpDir = await generateFromSchema(`
            enum Status { ACTIVE INACTIVE }
            model User {
                id String @id @default(cuid())
            }
        `);

        const statusDoc = readDoc(tmpDir, 'enums', 'Status.md');
        expect(statusDoc).not.toContain('```mermaid');
    });

    it('enum pages include prev/next navigation footer', async () => {
        const tmpDir = await generateFromSchema(`
            model User {
                id String @id @default(cuid())
            }
            enum Alpha { A B }
            enum Beta { X Y }
            enum Gamma { P Q }
        `);

        const alphaDoc = readDoc(tmpDir, 'enums', 'Alpha.md');
        expect(alphaDoc).toContain('Next: [Beta](./Beta.md)');

        const betaDoc = readDoc(tmpDir, 'enums', 'Beta.md');
        expect(betaDoc).toContain('Previous: [Alpha](./Alpha.md)');
        expect(betaDoc).toContain('Next: [Gamma](./Gamma.md)');
    });

    it('enum Used By deep-links to specific field anchors on model pages', async () => {
        const tmpDir = await generateFromSchema(`
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

        const roleDoc = readDoc(tmpDir, 'enums', 'Role.md');
        expect(roleDoc).toContain('## \u{1F517} Used By');
        expect(roleDoc).toContain('../models/Post.md#field-status');
        expect(roleDoc).toContain('../models/User.md#field-role');
    });
});
