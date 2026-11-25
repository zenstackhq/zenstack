import {
    Cancellation,
    DefaultDocumentBuilder,
    DocumentState,
    interruptAndCheck,
    type BuildOptions,
    type LangiumDocument,
    type LangiumSharedCoreServices,
} from 'langium';
import { isModel } from './ast';
import { resolveImport } from './utils';

export class ZModelDocumentBuilder extends DefaultDocumentBuilder {
    constructor(services: LangiumSharedCoreServices) {
        super(services);

        // override update build options to skip validation when there are
        // errors in the previous stages
        let validationOptions = this.updateBuildOptions.validation;
        const stopFlags = {
            stopAfterLinkingErrors: true,
            stopAfterLexingErrors: true,
            stopAfterParsingErrors: true,
        };
        if (validationOptions === true) {
            validationOptions = stopFlags;
        } else if (typeof validationOptions === 'object') {
            validationOptions = { ...validationOptions, ...stopFlags };
        }

        this.updateBuildOptions = {
            ...this.updateBuildOptions,
            validation: validationOptions,
        };
    }

    protected override async buildDocuments(
        documents: LangiumDocument[],
        options: BuildOptions,
        cancelToken: Cancellation.CancellationToken,
    ): Promise<void> {
        // Discover imports before indexing so dependencies go through all build phases too.
        const toBuild = [...documents];
        const visited = new Set(documents.map((doc) => doc.uri.toString()));
        for (const document of toBuild) {
            await interruptAndCheck(cancelToken);
            if (document.state < DocumentState.Parsed) {
                await this.langiumDocumentFactory.update(document, cancelToken);
            }
            if (
                document.uri.scheme !== 'file' ||
                document.parseResult.lexerErrors.length > 0 ||
                document.parseResult.parserErrors.length > 0
            ) {
                continue;
            }

            const model = document.parseResult.value;
            if (!isModel(model)) {
                continue;
            }
            for (const imp of model.imports) {
                const importedDoc = resolveImport(this.langiumDocuments, imp)?.$document;
                if (importedDoc && !visited.has(importedDoc.uri.toString())) {
                    visited.add(importedDoc.uri.toString());
                    toBuild.push(importedDoc);
                }
            }
        }

        await super.buildDocuments(toBuild, options, cancelToken);
    }
}
