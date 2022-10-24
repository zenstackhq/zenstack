import { NodeFileSystem } from 'langium/node';
import path from 'path';
import { URI } from 'vscode-uri';
import { createZModelServices } from '../../src/language-server/zmodel-module';
import { SchemaLoadingError } from '../utils';

describe('Stdlib Tests', () => {
    it('stdlib', async () => {
        const { shared } = createZModelServices(NodeFileSystem);
        const stdLib = shared.workspace.LangiumDocuments.getOrCreateDocument(
            URI.file(path.resolve('src/res/stdlib.zmodel'))
        );
        await shared.workspace.DocumentBuilder.build([stdLib], {
            validationChecks: 'all',
        });

        const validationErrors = (stdLib.diagnostics ?? []).filter(
            (e) => e.severity === 1
        );
        if (validationErrors.length > 0) {
            for (const validationError of validationErrors) {
                const range = stdLib.textDocument.getText(
                    validationError.range
                );
                console.error(
                    `line ${validationError.range.start.line + 1}: ${
                        validationError.message
                    }${range ? ' [' + range + ']' : ''}`
                );
            }
            throw new SchemaLoadingError(
                validationErrors.map((e) => e.message)
            );
        }
    });
});
