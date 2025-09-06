import * as vscode from 'vscode';
import * as path from 'path';

import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient/node';
import { ClerkAuthenticationProvider } from './clerk-auth-provider';
import { DocumentationCache } from './documentation-cache';
import { ZModelPreview } from './zmodel-preview';
import { ReleaseNotesManager } from './release-notes-manager';

const AUTH_PROVIDER_ID = 'ZenStack';
const AUTH_SCOPES = ['user:email'];

// Global variables
let client: LanguageClient;
let clerkAuthProvider: ClerkAuthenticationProvider | undefined;
let documentationCache: DocumentationCache;
let zmodelPreview: ZModelPreview;
let releaseNotesManager: ReleaseNotesManager;

// Utility to require authentication when needed
export async function requireAuth(): Promise<vscode.AuthenticationSession | undefined> {
    let session: vscode.AuthenticationSession | undefined;

    session = await vscode.authentication.getSession(AUTH_PROVIDER_ID, AUTH_SCOPES, { createIfNone: false });

    if (!session) {
        const signIn = 'Sign in';
        const selection = await vscode.window.showWarningMessage('You must sign in to use this feature.', signIn);
        if (selection === signIn) {
            try {
                session = await vscode.authentication.getSession(AUTH_PROVIDER_ID, AUTH_SCOPES, { createIfNone: true });
                if (session) {
                    vscode.window.showInformationMessage('Sign-in successful!');
                }
            } catch (e) {
                vscode.window.showErrorMessage('Sign-in failed: ' + String(e));
            }
        }
    }

    // If session is available, fetch the user email from Clerk API using the access token
    if (session) {
        try {
            const email = await getClerkUserEmail(session);
            if (email) {
                console.log('Clerk user email:', email);
            } else {
                console.log('Could not retrieve Clerk user email.');
            }
        } catch (e) {
            console.error('Failed to fetch Clerk user email:', e);
        }
    }

    return session;
}

// Fetch the user's primary email from Clerk using the session's access token
async function getClerkUserEmail(session: vscode.AuthenticationSession): Promise<string | undefined> {
    // Get the Clerk provider instance to fetch user email
    const authProviders = await vscode.authentication.getAccounts(AUTH_PROVIDER_ID);
    for (const provider of authProviders) {
        if (provider.id === session.account.id) {
            // If we have a Clerk provider instance, use it to get the email
            const clerkProvider = getClerkProvider();
            if (clerkProvider) {
                return await clerkProvider.getUserEmail(session);
            }
        }
    }

    // Fallback: try to extract email from account label if it looks like an email
    const accountLabel = session.account.label;
    if (accountLabel && accountLabel.includes('@')) {
        return accountLabel;
    }

    return undefined;
}

// Get the Clerk authentication provider instance
function getClerkProvider(): ClerkAuthenticationProvider | undefined {
    return clerkAuthProvider;
}

// This function is called when the extension is activated.
export function activate(context: vscode.ExtensionContext): void {
    // Initialize and register the Clerk authentication provider
    const clerkFrontendApi = getClerkConfiguration().frontendApi;

    clerkAuthProvider = new ClerkAuthenticationProvider(context, clerkFrontendApi);

    const authProviderDisposable = vscode.authentication.registerAuthenticationProvider(
        AUTH_PROVIDER_ID,
        'ZenStack',
        clerkAuthProvider
    );

    context.subscriptions.push(authProviderDisposable);

    // Register URI handler for authentication callback
    const uriHandler = vscode.window.registerUriHandler({
        handleUri: async (uri: vscode.Uri) => {
            if (uri.path === '/auth-callback' && clerkAuthProvider) {
                await clerkAuthProvider.handleAuthCallback(uri);
            }
        },
    });

    context.subscriptions.push(uriHandler);

    // Start language client
    client = startLanguageClient(context);

    // Initialize the documentation cache
    documentationCache = new DocumentationCache(context);
    // Add cache to subscriptions for automatic disposal
    context.subscriptions.push(documentationCache);

    // Initialize ZModel preview and release notes managers
    zmodelPreview = new ZModelPreview(context, client, documentationCache);
    releaseNotesManager = new ReleaseNotesManager(context);

    // Add managers to subscriptions for automatic disposal
    context.subscriptions.push(zmodelPreview);
    context.subscriptions.push(releaseNotesManager);
}

// Get Clerk configuration from VS Code settings
function getClerkConfiguration(): { publishableKey?: string; frontendApi?: string } {
    const config = vscode.workspace.getConfiguration('clerk');
    return {
        publishableKey: config.get<string>('publishableKey'),
        frontendApi: config.get<string>('frontendApi'),
    };
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
