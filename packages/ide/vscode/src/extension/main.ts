import * as path from 'node:path';
import type * as vscode from 'vscode';
import type { LanguageClientOptions, ServerOptions } from 'vscode-languageclient/node.js';
import { LanguageClient, TransportKind } from 'vscode-languageclient/node.js';
import { DocumentationCache } from './documentation-cache';
import { ReleaseNotesManager } from './release-notes-manager';
import telemetry from './vscode-telemetry';
import { ZenStackAuthenticationProvider } from './zenstack-auth-provider';
import { ZModelPreview } from './zmodel-preview';

let client: LanguageClient;

// This function is called when the extension is activated.
export function activate(context: vscode.ExtensionContext): void {
    telemetry.track('extension:activate');

    // Initialize and register the ZenStack authentication provider
    context.subscriptions.push(new ZenStackAuthenticationProvider(context));

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
    const serverModule = context.asAbsolutePath(path.join('dist', 'language-server.cjs'));
    // The debug options for the server
    // --inspect=6009: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging.
    // By setting `process.env.DEBUG_BREAK` to a truthy value, the language server will wait until a debugger is attached.
    const debugOptions = {
        execArgv: [
            '--nolazy',
            `--inspect${process.env['DEBUG_BREAK'] ? '-brk' : ''}=${process.env['DEBUG_SOCKET'] || '6009'}`,
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

    // Options to control the language client
    const clientOptions: LanguageClientOptions = {
        documentSelector: [{ language: 'zmodel-v3' }],
    };

    // Create the language client and start the client.
    const client = new LanguageClient('zmodel-v3', 'ZenStack Model V3', serverOptions, clientOptions);

    // Start the client. This will also launch the server
    client.start();
    return client;
}
