import { invariant } from '@zenstackhq/common-helpers';
import { URI } from 'langium';
import { NodeFileSystem } from 'langium/node';
import fs from 'node:fs';
import path from 'node:path';
import tmp from 'tmp';
import { describe, expect, it, onTestFinished } from 'vitest';
import { createZModelLanguageServices, loadDocument } from '../src';
import { DataModel, isDataModel, isTypeDef, type Model } from '../src/ast';

describe('Import tests', () => {
    it('merges declarations', async () => {
        const { name } = tmp.dirSync();
        fs.writeFileSync(
            path.join(name, 'a.zmodel'),
            `
datasource db {
  provider = 'sqlite'
  url      = 'file:./dev.db'
}
        
model A {
  id Int @id
  name String
}
        `,
        );
        fs.writeFileSync(
            path.join(name, 'b.zmodel'),
            `
import './a'
model B {
  id Int @id
}
        `,
        );

        const model = await expectLoaded(path.join(name, 'b.zmodel'));
        expect(model.declarations.filter(isDataModel)).toHaveLength(2);
        expect(model.imports).toHaveLength(0);
    });

    it('resolves imported symbols', async () => {
        const { name } = tmp.dirSync();
        fs.writeFileSync(
            path.join(name, 'a.zmodel'),
            `
enum Role {
  Admin
  User
}
  `,
        );
        fs.writeFileSync(
            path.join(name, 'b.zmodel'),
            `
import './a'

datasource db {
  provider = 'sqlite'
  url      = 'file:./dev.db'
}

model User {
  id Int @id
  role Role
}
`,
        );

        const model = await expectLoaded(path.join(name, 'b.zmodel'));
        expect((model.declarations[1] as DataModel).fields[1].type.reference?.ref?.name).toBe('Role');
    });

    it('supports cyclic imports', async () => {
        const { name } = tmp.dirSync();
        fs.writeFileSync(
            path.join(name, 'a.zmodel'),
            `
import './b'

datasource db {
  provider = 'sqlite'
  url      = 'file:./dev.db'
}

model A {
  id Int @id
  b B?
}
        `,
        );
        fs.writeFileSync(
            path.join(name, 'b.zmodel'),
            `
import './a'
model B {
  id Int @id
  a A @relation(fields: [aId], references: [id])
  aId Int @unique
}
`,
        );

        const modelB = await expectLoaded(path.join(name, 'b.zmodel'));
        expect((modelB.declarations[0] as DataModel).fields[1].type.reference?.ref?.name).toBe('A');
        const modelA = await expectLoaded(path.join(name, 'a.zmodel'));
        expect((modelA.declarations[1] as DataModel).fields[1].type.reference?.ref?.name).toBe('B');
    });

    describe('language server imports (#2923)', () => {
        it.each([false, true])('indexes declarations under node_modules (preloaded: %s)', async (preloaded) => {
            const { name, removeCallback } = tmp.dirSync({ unsafeCleanup: true });
            onTestFinished(removeCallback);
            const pluginPath = path.join(name, 'node_modules/policy/plugin.zmodel');
            fs.mkdirSync(path.dirname(pluginPath), { recursive: true });
            fs.copyFileSync(path.resolve(__dirname, '../../plugins/policy/plugin.zmodel'), pluginPath);
            const schemaPath = path.join(name, 'schema.zmodel');
            fs.writeFileSync(
                schemaPath,
                `
import './node_modules/policy/plugin.zmodel'
datasource db {
  provider = 'postgresql'
  url = env('DATABASE_URL')
}
model Post {
  id String @id
  title String
  @@allow('read', true)
}
`,
            );

            const { shared } = createZModelLanguageServices(NodeFileSystem);
            if (preloaded) {
                await shared.workspace.LangiumDocuments.getOrCreateDocument(URI.file(pluginPath));
            }
            shared.workspace.WorkspaceManager.initialBuildOptions = { validation: true };
            await shared.workspace.WorkspaceManager.initializeWorkspace([{ name, uri: URI.file(name).toString() }]);
            const document = shared.workspace.LangiumDocuments.getDocument<Model>(URI.file(schemaPath))!;
            expect(document.diagnostics).toEqual([]);
            const post = document.parseResult.value.declarations.find(isDataModel)!;
            expect(post.attributes[0].decl.ref?.name).toBe('@@allow');

            await shared.workspace.DocumentBuilder.update([document.uri], []);
            expect(document.diagnostics).toEqual([]);
        });

        it('indexes transitive and cyclic imports without exposing transitive declarations', async () => {
            const { name, removeCallback } = tmp.dirSync({ unsafeCleanup: true });
            onTestFinished(removeCallback);
            const packagePath = path.join(name, 'node_modules/shared');
            fs.mkdirSync(packagePath, { recursive: true });
            fs.writeFileSync(
                path.join(packagePath, 'base.zmodel'),
                `
import './role'
type Base {
  id Int @id
  role Role @default(Admin)
}
`,
            );
            fs.writeFileSync(
                path.join(packagePath, 'role.zmodel'),
                `
import './base'
enum Role {
  Admin
  User
}
`,
            );
            const unrelatedUri = URI.file(path.join(packagePath, 'unrelated.zmodel'));
            fs.writeFileSync(unrelatedUri.fsPath, 'enum Unrelated { Value }');
            const schemaPath = path.join(name, 'schema.zmodel');
            const schema = `
import './node_modules/shared/base'
datasource db {
  provider = 'postgresql'
  url = env('DATABASE_URL')
}
model Post with Base {
  title String
}
`;
            fs.writeFileSync(schemaPath, schema);

            const { shared } = createZModelLanguageServices(NodeFileSystem);
            shared.workspace.WorkspaceManager.initialBuildOptions = { validation: true };
            await shared.workspace.WorkspaceManager.initializeWorkspace([{ name, uri: URI.file(name).toString() }]);
            const document = shared.workspace.LangiumDocuments.getDocument(URI.file(schemaPath))!;
            expect(document.diagnostics).toEqual([]);
            const base = shared.workspace.LangiumDocuments.getDocument<Model>(
                URI.file(path.join(packagePath, 'base.zmodel')),
            )!;
            expect(base.diagnostics).toEqual([]);
            const baseModel = base.parseResult.value.declarations.find(isTypeDef)!;
            expect(baseModel.fields[1].type.reference?.ref?.name).toBe('Role');
            expect(shared.workspace.LangiumDocuments.hasDocument(unrelatedUri)).toBe(false);

            fs.writeFileSync(schemaPath, schema.replace('title String', 'role2 Role'));
            await shared.workspace.DocumentBuilder.update([document.uri], []);
            expect(document.diagnostics?.map((d) => d.message)).toContain(
                "Could not resolve reference to TypeDeclaration named 'Role'.",
            );
            fs.writeFileSync(schemaPath, schema);
            await shared.workspace.DocumentBuilder.update([document.uri], []);
            expect(document.diagnostics).toEqual([]);

            const roleUri = URI.file(path.join(packagePath, 'role.zmodel'));
            const roleSchema = fs.readFileSync(roleUri.fsPath, 'utf-8');
            fs.writeFileSync(roleUri.fsPath, roleSchema.replace('enum Role', 'enum OtherRole'));
            await shared.workspace.DocumentBuilder.update([roleUri], []);
            expect(base.diagnostics?.map((d) => d.message)).toContain(
                "Could not resolve reference to TypeDeclaration named 'Role'.",
            );
            fs.writeFileSync(roleUri.fsPath, roleSchema);
            await shared.workspace.DocumentBuilder.update([roleUri], []);
            expect(base.diagnostics).toEqual([]);
            expect(document.diagnostics).toEqual([]);
        });
    });

    async function expectLoaded(file: string) {
        const result = await loadDocument(file);
        if (!result.success) {
            console.error('Errors:', result.errors);
            throw new Error(`Failed to load document from ${file}`);
        }
        invariant(result.success);
        return result.model;
    }
});
