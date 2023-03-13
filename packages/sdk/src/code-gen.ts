import prettier from 'prettier';
import { Project, SourceFile } from 'ts-morph';

const formatOptions = {
    trailingComma: 'all',
    tabWidth: 4,
    printWidth: 120,
    bracketSpacing: true,
    semi: true,
    singleQuote: true,
    useTabs: false,
    parser: 'typescript',
} as const;

async function formatFile(sourceFile: SourceFile) {
    try {
        const content = sourceFile.getFullText();
        const formatted = prettier.format(content, formatOptions);
        sourceFile.replaceWithText(formatted);
        await sourceFile.save();
    } catch {
        /* empty */
    }
}

/**
 * Emit a TS project to JS files.
 */
export async function emitProject(project: Project, format = true) {
    if (format) {
        await Promise.all(
            project.getSourceFiles().map(async (sf) => {
                await formatFile(sf);
            })
        );
    }
    await project.emit();
}
