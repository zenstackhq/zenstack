import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createProject, runCli } from './utils';

const model = `
model User {
    id String @id @default(cuid())
    name String
    posts Post[]
}

model Post {
    id String @id @default(cuid())
    title String
    author User @relation(fields: [authorId], references: [id])
    authorId String
}
`;

/**
 * Overwrites the project's tsconfig.json with the given compiler options
 * (merged over a sensible default that includes the generated files).
 */
function writeTsConfig(workDir: string, compilerOptions: Record<string, unknown>) {
    fs.writeFileSync(
        path.join(workDir, 'tsconfig.json'),
        JSON.stringify(
            {
                compilerOptions: {
                    target: 'ESNext',
                    esModuleInterop: true,
                    skipLibCheck: true,
                    strict: true,
                    noEmit: true,
                    types: ['node'],
                    ...compilerOptions,
                },
                include: ['**/*.ts'],
            },
            null,
            4,
        ),
    );
}

function readGenerated(workDir: string, file: string) {
    return fs.readFileSync(path.join(workDir, 'zenstack', file), 'utf8');
}

function typeCheck(workDir: string) {
    // throws (non-zero exit) if type checking fails
    execSync('npx tsc --noEmit', { cwd: workDir, stdio: 'pipe' });
}

describe('Import file extension generation', () => {
    it('omits the extension and compiles under bundler resolution', async () => {
        const { workDir } = await createProject(model);
        // createTestProject already writes a bundler tsconfig, but set it explicitly here
        writeTsConfig(workDir, { module: 'ESNext', moduleResolution: 'Bundler' });

        runCli('generate', workDir);

        // relative imports between generated files carry no extension
        for (const file of ['models.ts', 'input.ts']) {
            const content = readGenerated(workDir, file);
            expect(content).toContain(`from "./schema"`);
            expect(content).not.toContain(`./schema.js`);
        }

        // and the project type-checks
        expect(() => typeCheck(workDir)).not.toThrow();
    });

    it('auto-adds ".js" and compiles under nodenext resolution', async () => {
        const { workDir } = await createProject(model);
        writeTsConfig(workDir, { module: 'NodeNext', moduleResolution: 'NodeNext' });

        runCli('generate', workDir);

        // node16/nodenext requires explicit extensions; they must be present
        for (const file of ['models.ts', 'input.ts']) {
            const content = readGenerated(workDir, file);
            expect(content).toContain(`from "./schema.js"`);
        }

        // the real proof: nodenext would fail to resolve "./schema" without the extension
        expect(() => typeCheck(workDir)).not.toThrow();
    });

    it('fails to compile under nodenext if the extension is suppressed', async () => {
        // negative control proving the auto-detected extension is load-bearing
        const modelWithoutExtension = `
plugin typescript {
    provider = "@core/typescript"
    importWithFileExtension = ""
}

${model}`;
        const { workDir } = await createProject(modelWithoutExtension);
        writeTsConfig(workDir, { module: 'NodeNext', moduleResolution: 'NodeNext' });

        runCli('generate', workDir);

        const content = readGenerated(workDir, 'input.ts');
        expect(content).toContain(`from "./schema"`);
        expect(content).not.toContain(`./schema.js`);

        // missing extension is a hard error under nodenext
        expect(() => typeCheck(workDir)).toThrow();
    });

    it('honors an explicit importWithFileExtension over auto-detection', async () => {
        const modelWithExtension = `
plugin typescript {
    provider = "@core/typescript"
    importWithFileExtension = "js"
}

${model}`;
        const { workDir } = await createProject(modelWithExtension);
        // bundler resolution would auto-detect "no extension"; the explicit option wins
        writeTsConfig(workDir, { module: 'ESNext', moduleResolution: 'Bundler' });

        runCli('generate', workDir);

        const content = readGenerated(workDir, 'input.ts');
        expect(content).toContain(`from "./schema.js"`);

        // bundler resolution also accepts the explicit extension
        expect(() => typeCheck(workDir)).not.toThrow();
    });
});
