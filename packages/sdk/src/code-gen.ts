import { CompilerOptions, DiagnosticCategory, ModuleKind, Project, ScriptTarget } from 'ts-morph';
import { PluginError } from './types';

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
    const errors = project.getPreEmitDiagnostics().filter((d) => d.getCategory() === DiagnosticCategory.Error);
    if (errors.length > 0) {
        console.error('Error compiling generated code:');
        console.error(project.formatDiagnosticsWithColorAndContext(errors.slice(0, 10)));
        await project.save();
        throw new PluginError('', `Error compiling generated code`);
    }

    const result = await project.emit();

    const emitErrors = result.getDiagnostics().filter((d) => d.getCategory() === DiagnosticCategory.Error);
    if (emitErrors.length > 0) {
        console.error('Some generated code is not emitted:');
        console.error(project.formatDiagnosticsWithColorAndContext(emitErrors.slice(0, 10)));
        await project.save();
        throw new PluginError('', `Error emitting generated code`);
    }
}
