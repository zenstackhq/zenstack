import { transformFile } from '@swc/core';
import fs from 'fs';
import path from 'path';
import { CompilerOptions, ModuleKind, Project, ScriptTarget } from 'ts-morph';

/**
 * Creates a TS code generation project
 */
export function createProject(options?: CompilerOptions) {
    return new Project({
        compilerOptions: {
            target: ScriptTarget.ES2016,
            module: ModuleKind.CommonJS,
            esModuleInterop: true,
            declaration: true,
            strict: true,
            skipLibCheck: true,
            noEmitOnError: true,
            ...options,
        },
    });
}

/**
 * Persists a TS project to disk.
 */
export async function saveProject(project: Project) {
    project.getSourceFiles().forEach((sf) => sf.formatText());
    await project.save();
}

/**
 * Emit a TS project to JS files.
 */
export async function emitProject(project: Project) {
    await project.save();

    await Promise.all(
        project
            .getSourceFiles()
            .map((sf) => sf.getFilePath())
            .filter((file) => !file.endsWith('.d.ts'))
            .map(async (file) => {
                const output = await transformFile(file, {
                    jsc: {
                        parser: {
                            syntax: 'typescript',
                            tsx: false,
                        },
                        target: 'es2020',
                    },
                    module: {
                        type: 'commonjs',
                    },
                });
                fs.writeFileSync(path.join(path.dirname(file), path.basename(file, '.ts') + '.js'), output.code);
            })
    );
}
