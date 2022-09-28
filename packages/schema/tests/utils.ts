import { DefaultLangiumDocumentFactory } from 'langium';
import { createZModelServices } from '../src/language-server/zmodel-module';
import { URI } from 'vscode-uri';
import * as fs from 'fs';
import * as path from 'path';
import { Model } from '../src/language-server/generated/ast';
import * as tmp from 'tmp';

export async function parse(content: string) {
    const { name: docPath } = tmp.fileSync({ postfix: '.zmodel' });
    fs.writeFileSync(docPath, content);
    const { shared } = createZModelServices();
    const factory = new DefaultLangiumDocumentFactory(shared);
    const stdLib = factory.fromString(
        fs.readFileSync('src/language-server/stdlib.zmodel', {
            encoding: 'utf-8',
        }),
        URI.file(path.resolve('src/language-server/stdlib.zmodel'))
    );
    const doc = factory.fromString(content, URI.file(docPath));
    await shared.workspace.DocumentBuilder.build([stdLib, doc], {
        validationChecks: 'all',
    });

    const validationErrors = (doc.diagnostics ?? []).filter(
        (e) => e.severity === 1
    );
    if (validationErrors.length > 0) {
        for (const validationError of validationErrors) {
            console.error(
                `line ${validationError.range.start.line + 1}: ${
                    validationError.message
                } [${doc.textDocument.getText(validationError.range)}]`
            );
        }
        throw new Error('Validation error');
    }

    const model = (await doc.parseResult.value) as Model;
    return model;
}
