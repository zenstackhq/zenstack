import * as vscode from 'vscode';
import * as path from 'path';

import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient/node';
import { AUTH_PROVIDER_ID, ZenStackAuthenticationProvider } from './zenstack-auth-provider';
import { DocumentationCache } from './documentation-cache';
import { ZModelPreview } from './zmodel-preview';
import { ReleaseNotesManager } from './release-notes-manager';

// Global variables
let client: LanguageClient;

// Utility to require authentication when needed
export async function requireAuth(): Promise<vscode.AuthenticationSession | undefined> {
    let session: vscode.AuthenticationSession | undefined;

    session = await vscode.authentication.getSession(AUTH_PROVIDER_ID, [], { createIfNone: false });

    if (!session) {
        const signIn = 'Sign in';
        const selection = await vscode.window.showWarningMessage('Please sign in to use this feature', signIn);
        if (selection === signIn) {
            try {
                session = await vscode.authentication.getSession(AUTH_PROVIDER_ID, [], { createIfNone: true });
                if (session) {
                    vscode.window.showInformationMessage('ZenStack sign in successful!');
                }
            } catch (e) {
                vscode.window.showErrorMessage('ZenStack sign in failed: ' + String(e));
            }
        }
    }
    return session;
}

// This function is called when the extension is activated.
export function activate(context: vscode.ExtensionContext): void {
    // Initialize and register the ZenStack authentication provider
    context.subscriptions.push(new ZenStackAuthenticationProvider(context));

    // Start language client
    client = startLanguageClient(context);

    const documentationCache = new DocumentationCache(context);
    context.subscriptions.push(documentationCache);
    context.subscriptions.push(new ZModelPreview(context, client, documentationCache));
    context.subscriptions.push(new ReleaseNotesManager(context));
}

// This function is called when the extension is deactivated.
export function deactivate(): Thenable<void> | undefined {
    if (client) {
        return client.stop();
    }
    return undefined;
}

function startLanguageClient(context: vscode.ExtensionContext): LanguageClient {
    const serverModule = context.asAbsolutePath(path.join('dist', 'language-server', 'main'));
    // The debug options for the server
    // --inspect=6009: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging.
    // By setting `process.env.DEBUG_BREAK` to a truthy value, the language server will wait until a debugger is attached.
    const debugOptions = {
        execArgv: [
            '--nolazy',
            `--inspect${process.env.DEBUG_BREAK ? '-brk' : ''}=${process.env.DEBUG_SOCKET || '6009'}`,
        ],
    };

    // If the extension is launched in debug mode then the debug server options are used
    // Otherwise the run options are used
    const serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: {
            module: serverModule,
            transport: TransportKind.ipc,
            options: debugOptions,
        },
    };

    const fileSystemWatcher = vscode.workspace.createFileSystemWatcher('**/*.zmodel');
    context.subscriptions.push(fileSystemWatcher);

    // Options to control the language client
    const clientOptions: LanguageClientOptions = {
        documentSelector: [{ scheme: 'file', language: 'zmodel' }],
        synchronize: {
            // Notify the server about file changes to files contained in the workspace
            fileEvents: fileSystemWatcher,
        },
    };

    // Create the language client and start the client.
    const client = new LanguageClient('zmodel', 'ZenStack Model', serverOptions, clientOptions);

    // Log when client is ready (use start() promise)
    client
        .start()
        .then(() => {
            console.log('ZModel language server is ready and custom AST endpoint available');
        })
        .catch((error: unknown) => {
            console.error('Language server failed to start:', error);
        });

    return client;
}
