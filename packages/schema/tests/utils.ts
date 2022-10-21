import { createZModelServices } from '../src/language-server/zmodel-module';
import { URI } from 'vscode-uri';
import * as fs from 'fs';
import * as path from 'path';
import { NodeFileSystem } from 'langium/node';
import { Model } from '../src/language-server/generated/ast';
import * as tmp from 'tmp';

export class SchemaLoadingError extends Error {
    constructor(public readonly errors: string[]) {
        super('Schema error');
    }
}

export async function loadModel(content: string, validate = true) {
    const { name: docPath } = tmp.fileSync({ postfix: '.zmodel' });
    fs.writeFileSync(docPath, content);
    const { shared } = createZModelServices(NodeFileSystem);
    const stdLib = shared.workspace.LangiumDocuments.getOrCreateDocument(
        URI.file(path.resolve('src/language-server/stdlib.zmodel'))
    );
    const doc = shared.workspace.LangiumDocuments.getOrCreateDocument(
        URI.file(docPath)
    );
    await shared.workspace.DocumentBuilder.build([stdLib, doc], {
        validationChecks: validate ? 'all' : 'none',
    });

    const validationErrors = (doc.diagnostics ?? []).filter(
        (e) => e.severity === 1
    );
    if (validationErrors.length > 0) {
        for (const validationError of validationErrors) {
            const range = doc.textDocument.getText(validationError.range);
            console.error(
                `line ${validationError.range.start.line + 1}: ${
                    validationError.message
                }${range ? ' [' + range + ']' : ''}`
            );
        }
        throw new SchemaLoadingError(validationErrors.map((e) => e.message));
    }

    const model = (await doc.parseResult.value) as Model;
    return model;
}

export async function loadModelWithError(content: string) {
    try {
        await loadModel(content);
    } catch (err) {
        expect(err).toBeInstanceOf(SchemaLoadingError);
        return (err as SchemaLoadingError).errors;
    }
    throw new Error('No error is thrown');
}
