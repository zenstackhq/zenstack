import { STD_LIB_MODULE_NAME } from '@lang/constants';
import { Model } from '@lang/generated/ast';
import { createZModelServices } from '@lang/zmodel-module';
import colors from 'colors';
import fs from 'fs';
import { LangiumServices } from 'langium';
import { NodeFileSystem } from 'langium/node';
import path from 'path';
import { ZenStackGenerator } from '../generator';
import { URI } from 'vscode-uri';
import { GENERATED_CODE_PATH } from '../generator/constants';
import { Context, GeneratorError } from '../generator/types';

/**
 * Loads a zmodel document from a file.
 * @param fileName File name
 * @param services Language services
 * @returns Parsed and validated AST
 */
export async function loadDocument(
    fileName: string,
    services: LangiumServices
): Promise<Model> {
    const extensions = services.LanguageMetaData.fileExtensions;
    if (!extensions.includes(path.extname(fileName))) {
        console.error(
            colors.yellow(`Please choose a file with extension: ${extensions}.`)
        );
        process.exit(1);
    }

    if (!fs.existsSync(fileName)) {
        console.error(colors.red(`File ${fileName} does not exist.`));
        process.exit(1);
    }

    // load standard library
    const stdLib =
        services.shared.workspace.LangiumDocuments.getOrCreateDocument(
            URI.file(
                path.resolve(
                    path.join(__dirname, '../res', STD_LIB_MODULE_NAME)
                )
            )
        );

    // load the document
    const document =
        services.shared.workspace.LangiumDocuments.getOrCreateDocument(
            URI.file(path.resolve(fileName))
        );

    // build the document together with standard library
    await services.shared.workspace.DocumentBuilder.build([stdLib, document], {
        validationChecks: 'all',
    });

    const validationErrors = (document.diagnostics ?? []).filter(
        (e) => e.severity === 1
    );
    if (validationErrors.length > 0) {
        console.error(colors.red('Validation errors:'));
        for (const validationError of validationErrors) {
            console.error(
                colors.red(
                    `line ${validationError.range.start.line + 1}: ${
                        validationError.message
                    } [${document.textDocument.getText(validationError.range)}]`
                )
            );
        }
        process.exit(1);
    }

    return document.parseResult.value as Model;
}

export async function runGenerator(
    options: { schema: string },
    includedGenerators?: string[],
    clearOutput = true
) {
    const services = createZModelServices(NodeFileSystem).ZModel;
    const model = await loadDocument(options.schema, services);

    const context: Context = {
        schema: model,
        outDir: path.dirname(options.schema),
        // TODO: make this configurable
        generatedCodeDir: GENERATED_CODE_PATH,
    };

    try {
        await new ZenStackGenerator().generate(
            context,
            includedGenerators,
            clearOutput
        );
    } catch (err) {
        if (err instanceof GeneratorError) {
            console.error(colors.red(err.message));
            process.exit(1);
        }
    }
}
