import { startLanguageServer } from 'langium';
import { NodeFileSystem } from 'langium/node';
import { createConnection, ProposedFeatures } from 'vscode-languageserver/node';
import { URI } from 'vscode-uri';
import { createZModelServices } from './zmodel-module';
import { eagerLoadAllImports } from '../cli/cli-util';

// Create a connection to the client
const connection = createConnection(ProposedFeatures.all);

// Inject the shared services and language-specific services
const { shared } = createZModelServices({ connection, ...NodeFileSystem });

// Add custom LSP request handlers
connection.onRequest('zenstack/getAllImportedZModelURIs', async (params: { textDocument: { uri: string } }) => {
    try {
        const uri = URI.parse(params.textDocument.uri);
        const document = shared.workspace.LangiumDocuments.getOrCreateDocument(uri);

        // Ensure the document is parsed and built
        if (!document.parseResult) {
            await shared.workspace.DocumentBuilder.build([document]);
        }

        // #region merge imported documents
        const langiumDocuments = shared.workspace.LangiumDocuments;

        // load all imports
        const importedURIs = eagerLoadAllImports(document, langiumDocuments);

        const importedDocuments = importedURIs.map((uri) => langiumDocuments.getOrCreateDocument(uri));

        // build the document together with standard library, plugin modules, and imported documents
        await shared.workspace.DocumentBuilder.build([document, ...importedDocuments], {
            validationChecks: 'all',
        });

        const hasSyntaxErrors = [uri, ...importedURIs].some((uri) => {
            const doc = langiumDocuments.getOrCreateDocument(uri);
            return (
                doc.parseResult.lexerErrors.length > 0 ||
                doc.parseResult.parserErrors.length > 0 ||
                doc.diagnostics?.some((e) => e.severity === 1)
            );
        });

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

// Start the language server with the shared services
startLanguageServer(shared);
