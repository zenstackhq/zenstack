import { Model } from '@zenstackhq/sdk/ast';
import * as fs from 'fs';
import { NodeFileSystem } from 'langium/node';
import * as path from 'path';
import * as tmp from 'tmp';
import { URI } from 'vscode-uri';
import { createZModelServices } from '../src/language-server/zmodel-module';
import { mergeBaseModel } from '../src/utils/ast-utils';

tmp.setGracefulCleanup();

type Errorish = Error | { message: string; stack?: string } | string;

export class SchemaLoadingError<Errors extends Errorish[] = Errorish[]> extends Error {
    cause: Errors;
    constructor(public readonly errors: Errors) {
        const stack = errors.find(
            (e): e is typeof e & { stack: string } => typeof e === 'object' && 'stack' in e
        )?.stack;
        const message = errors.map((e) => (typeof e === 'string' ? e : e.message)).join('\n');

        super(`Schema error:\n${message}`);

        if (stack) {
            const shiftedStack = stack.split('\n').slice(1).join('\n');
            this.stack = shiftedStack;
        }
        this.cause = errors;
    }
}

export async function loadModel(content: string, validate = true, verbose = true, mergeBase = true) {
    const { name: docPath } = tmp.fileSync({ postfix: '.zmodel' });
    fs.writeFileSync(docPath, content);
    const { shared } = createZModelServices(NodeFileSystem);
    const stdLib = shared.workspace.LangiumDocuments.getOrCreateDocument(
        URI.file(path.resolve(__dirname, '../../schema/src/res/stdlib.zmodel'))
    );
    const doc = shared.workspace.LangiumDocuments.getOrCreateDocument(URI.file(docPath));

    if (doc.parseResult.lexerErrors.length > 0) {
        throw new SchemaLoadingError(doc.parseResult.lexerErrors);
    }

    if (doc.parseResult.parserErrors.length > 0) {
        throw new SchemaLoadingError(doc.parseResult.parserErrors);
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
        throw new SchemaLoadingError(validationErrors);
    }

    const model = (await doc.parseResult.value) as Model;

    if (mergeBase) {
        mergeBaseModel(model);
    }

    return model;
}

export async function loadModelWithError(content: string, verbose = false) {
    try {
        await loadModel(content, true, verbose);
    } catch (err) {
        if (!(err instanceof SchemaLoadingError)) {
            throw err;
        }
        return (err as SchemaLoadingError).message;
    }
    throw new Error('No error is thrown');
}

export async function safelyLoadModel(content: string, validate = true, verbose = false) {
    const [result] = await Promise.allSettled([loadModel(content, validate, verbose)]);

    return result;
}

export const errorLike = (msg: string) => ({
    reason: {
        message: expect.stringContaining(msg),
    },
});
