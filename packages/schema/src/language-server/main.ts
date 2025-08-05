import { startLanguageServer } from 'langium';
import { NodeFileSystem } from 'langium/node';
import { createConnection, ProposedFeatures } from 'vscode-languageserver/node';
import { URI } from 'vscode-uri';
import { createZModelServices } from './zmodel-module';
import { eagerLoadAllImports } from '../cli/cli-util';
import { isDataModel, Model } from '@zenstackhq/language/ast';

// Create a connection to the client
const connection = createConnection(ProposedFeatures.all);

// Inject the shared services and language-specific services
const { shared } = createZModelServices({ connection, ...NodeFileSystem });

// Helper function to serialize AST nodes for LSP transport
function serializeASTNode(node: unknown, depth = 0, maxDepth = 15, isInContainer = false): unknown {
    if (depth > maxDepth || node === null || node === undefined) {
        return null;
    }

    if (typeof node !== 'object') {
        return node;
    }

    if (Array.isArray(node)) {
        return node.map((item) => serializeASTNode(item, depth + 1, maxDepth, isInContainer));
    }

    const serialized: Record<string, unknown> = {};

    // Copy primitive properties and $type
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        // Skip circular references and internal properties (preserve $container)
        if (key.startsWith('$document') || key === '$cstNode') {
            continue;
        }

        if (
            key === '$type' ||
            key === 'name' ||
            typeof value === 'string' ||
            typeof value === 'number' ||
            typeof value === 'boolean'
        ) {
            serialized[key] = value;
        } else if (!isInContainer && key === '$container' && value && isDataModel(value)) {
            // Serialize container information
            serialized[key] = serializeASTNode(value, depth + 1, maxDepth, true);
        } else if (key === '$resolvedType' && value && typeof value === 'object') {
            // Serialize type information if available
            const resolvedType = value as Record<string, unknown>;
            serialized[key] = {
                decl:
                    typeof resolvedType.decl === 'string'
                        ? resolvedType.decl
                        : (resolvedType.decl as Record<string, unknown>)?.name ||
                          (resolvedType.decl as Record<string, unknown>)?.$type,
                array: resolvedType.array,
                nullable: resolvedType.nullable,
            };
        } else if (Array.isArray(value)) {
            serialized[key] = serializeASTNode(value, depth + 1, maxDepth, isInContainer);
        } else if (value && typeof value === 'object' && !key.startsWith('$')) {
            serialized[key] = serializeASTNode(value, depth + 1, maxDepth, isInContainer);
        }
    }

    return serialized;
}

// Add custom LSP request handlers
connection.onRequest('zenstack/getAST', async (params: { textDocument: { uri: string } }) => {
    try {
        console.log('Received request to get AST for:', params.textDocument.uri);
        const uri = URI.parse(params.textDocument.uri);
        const document = shared.workspace.LangiumDocuments.getOrCreateDocument(uri);

        // Ensure the document is parsed and built
        if (
            !document.parseResult ||
            document.parseResult.lexerErrors.length > 0 ||
            document.parseResult.parserErrors.length > 0
        ) {
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

        const declarations = [document, ...importedDocuments]
            .map((doc) => doc.parseResult.value as Model)
            .flatMap((model) => model.declarations);

        const model: Model = { declarations, imports: [], $type: 'Model' };
        //#endregion

        // Serialize the AST to avoid circular reference issues
        const serializedAST = serializeASTNode(model);

        // Serialize errors as well
        const serializedErrors = [
            ...(document.parseResult.lexerErrors || []).map((err) => ({
                message: err.message,
                offset: err.offset,
                length: err.length,
                line: err.line,
                column: err.column,
            })),
            ...(document.parseResult.parserErrors || []).map((err) => ({
                message: err.message,
                // Add other relevant properties as needed
            })),
        ];

        return {
            ast: serializedAST,
            importedURIs,
            errors: serializedErrors,
            diagnostics: (document.diagnostics || []).map((diag) => ({
                message: diag.message,
                severity: diag.severity,
                range: diag.range,
            })),
        };
    } catch (error) {
        console.error('Error getting AST:', error);
        return {
            ast: null,
            errors: [`Failed to get AST: ${error instanceof Error ? error.message : String(error)}`],
            diagnostics: [],
        };
    }
});

// Start the language server with the shared services
startLanguageServer(shared);
