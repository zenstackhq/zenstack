import { Model } from '@zenstackhq/sdk/ast';
import * as fs from 'fs';
import { NodeFileSystem } from 'langium/node';
import * as path from 'path';
import * as tmp from 'tmp';
import { URI } from 'vscode-uri';
import { createZModelServices } from '../src/language-server/zmodel-module';
import { mergeBaseModel } from '../src/utils/ast-utils';

export class SchemaLoadingError extends Error {
    constructor(public readonly errors: string[]) {
        super('Schema error:\n' + errors.join('\n'));
    }
}

export async function loadModel(content: string, validate = true, verbose = true) {
    const { name: docPath } = tmp.fileSync({ postfix: '.zmodel' });
    fs.writeFileSync(docPath, content);
    const { shared } = createZModelServices(NodeFileSystem);
    const stdLib = shared.workspace.LangiumDocuments.getOrCreateDocument(
        URI.file(path.resolve(__dirname, '../../schema/src/res/stdlib.zmodel'))
    );
    const doc = shared.workspace.LangiumDocuments.getOrCreateDocument(URI.file(docPath));

    if (doc.parseResult.lexerErrors.length > 0) {
        throw new SchemaLoadingError(doc.parseResult.lexerErrors.map((e) => e.message));
    }

    if (doc.parseResult.parserErrors.length > 0) {
        throw new SchemaLoadingError(doc.parseResult.parserErrors.map((e) => e.message));
    }

    await shared.workspace.DocumentBuilder.build([stdLib, doc], {
        validationChecks: validate ? 'all' : 'none',
    });

    const validationErrors = (doc.diagnostics ?? []).filter((e) => e.severity === 1);
    if (validationErrors.length > 0) {
        for (const validationError of validationErrors) {
            if (verbose) {
                const range = doc.textDocument.getText(validationError.range);
                console.error(
                    `line ${validationError.range.start.line + 1}: ${validationError.message}${
                        range ? ' [' + range + ']' : ''
                    }`
                );
            }
        }
        throw new SchemaLoadingError(validationErrors.map((e) => e.message));
    }

    const model = (await doc.parseResult.value) as Model;

    mergeBaseModel(model);

    return model;
}

export async function loadModelWithError(content: string, verbose = false) {
    try {
        await loadModel(content, true, verbose);
    } catch (err) {
        if (!(err instanceof SchemaLoadingError)) {
            throw err;
        }
        return (err as SchemaLoadingError).errors;
    }
    throw new Error('No error is thrown');
}
