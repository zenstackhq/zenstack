import { createZModelLanguageServices } from '@zenstackhq/language';
import type { Model } from '@zenstackhq/language/ast';
import { getDocument, resolveImport } from '@zenstackhq/language/utils';
import { URI, type LangiumDocument, type LangiumDocuments } from 'langium';
import { startLanguageServer } from 'langium/lsp';
import { NodeFileSystem } from 'langium/node';
import { createConnection, ProposedFeatures } from 'vscode-languageserver/node.js';

// Create a connection to the client
const connection = createConnection(ProposedFeatures.all);

// Inject the shared services and language-specific services
const { shared } = createZModelLanguageServices(
    {
        connection,
        ...NodeFileSystem,
    },
    true,
);

// Add custom LSP request handlers
connection.onRequest('zenstack/getAllImportedZModelURIs', async (params: { textDocument: { uri: string } }) => {
    try {
        const uri = URI.parse(params.textDocument.uri);
        const document = await shared.workspace.LangiumDocuments.getOrCreateDocument(uri);

        // Ensure the document is parsed and built
        if (!document.parseResult) {
            await shared.workspace.DocumentBuilder.build([document]);
        }

        const langiumDocuments = shared.workspace.LangiumDocuments;

        // load all imports
        const importedURIs = eagerLoadAllImports(document, langiumDocuments);

        const importedDocuments = await Promise.all(
            importedURIs.map((uri) => langiumDocuments.getOrCreateDocument(uri)),
        );

        // build the document together with standard library, plugin modules, and imported documents
        await shared.workspace.DocumentBuilder.build([document, ...importedDocuments], {
            validation: true,
        });

        let hasSyntaxErrors = false;
        for (const doc of [document, ...importedDocuments]) {
            if (
                doc.parseResult.lexerErrors.length > 0 ||
                doc.parseResult.parserErrors.length > 0 ||
                doc.diagnostics?.some((e) => e.severity === 1)
            ) {
                hasSyntaxErrors = true;
                break;
            }
        }

        return {
            hasSyntaxErrors,
            importedURIs,
        };
    } catch (error) {
        console.error('Error getting imported ZModel file:', error);
        return {
            hasSyntaxErrors: true,
            importedURIs: [],
        };
    }
});

function eagerLoadAllImports(document: LangiumDocument, documents: LangiumDocuments, uris: Set<string> = new Set()) {
    const uriString = document.uri.toString();
    if (!uris.has(uriString)) {
        uris.add(uriString);
        const model = document.parseResult.value as Model;

        for (const imp of model.imports) {
            const importedModel = resolveImport(documents, imp);
            if (importedModel) {
                const importedDoc = getDocument(importedModel);
                eagerLoadAllImports(importedDoc, documents, uris);
            }
        }
    }

    return Array.from(uris)
        .filter((x) => uriString != x)
        .map((e) => URI.parse(e));
}

// Start the language server with the shared services
startLanguageServer(shared);
