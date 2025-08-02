import { startLanguageServer } from 'langium';
import { NodeFileSystem } from 'langium/node';
import { createConnection, ProposedFeatures } from 'vscode-languageserver/node';
import { URI } from 'vscode-uri';
import { createZModelServices } from './zmodel-module';

// Create a connection to the client
const connection = createConnection(ProposedFeatures.all);

// Inject the shared services and language-specific services
const { shared } = createZModelServices({ connection, ...NodeFileSystem });

// Helper function to serialize AST nodes for LSP transport
function serializeASTNode(node: unknown, depth = 0, maxDepth = 10): unknown {
    if (depth > maxDepth || node === null || node === undefined) {
        return null;
    }

    if (typeof node !== 'object') {
        return node;
    }

    if (Array.isArray(node)) {
        return node.map((item) => serializeASTNode(item, depth + 1, maxDepth));
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
        } else if (key === '$container' && value && typeof value === 'object') {
            // Serialize container information
            serialized[key] = serializeASTNode(value, depth + 1, maxDepth);
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
            serialized[key] = serializeASTNode(value, depth + 1, maxDepth);
        } else if (value && typeof value === 'object' && !key.startsWith('$')) {
            serialized[key] = serializeASTNode(value, depth + 1, maxDepth);
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

        // Serialize the AST to avoid circular reference issues
        const serializedAST = serializeASTNode(document.parseResult.value);

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
