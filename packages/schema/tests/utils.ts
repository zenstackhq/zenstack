import { DefaultLangiumDocumentFactory } from 'langium';
import { createZModelServices } from '../src/language-server/zmodel-module';
import { URI } from 'vscode-uri';
import { v4 as uuid } from 'uuid';
import { Model } from '../src/language-server/generated/ast';

export async function parse(content: string) {
    const { shared } = createZModelServices();
    const factory = new DefaultLangiumDocumentFactory(shared);
    const doc = factory.fromString(content, URI.parse(`zmodel://${uuid()}`));
    await shared.workspace.DocumentBuilder.build([doc], {
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
