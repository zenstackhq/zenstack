import * as vscode from 'vscode';
import * as path from 'path';

import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient/node';

const AUTH_PROVIDER_ID = 'github';
const AUTH_SCOPES = ['user:email'];

// Utility to require authentication when needed
export async function requireAuth(): Promise<vscode.AuthenticationSession | undefined> {
    let session: vscode.AuthenticationSession | undefined;
    try {
        session = await vscode.authentication.getSession(AUTH_PROVIDER_ID, AUTH_SCOPES, { createIfNone: false });
    } catch (e) {
        console.error(e);
    }

    if (!session) {
        const signIn = 'Sign in';
        const selection = await vscode.window.showWarningMessage('You must sign in to use this feature.', signIn);
        if (selection === signIn) {
            try {
                session = await vscode.authentication.getSession(AUTH_PROVIDER_ID, AUTH_SCOPES, { createIfNone: true });
                if (session) {
                    vscode.window.showInformationMessage('Sign-in successful! Please retry your action.');
                }
            } catch (e) {
                vscode.window.showErrorMessage('Sign-in failed: ' + String(e));
            }
        }
    }
    return session;
}

// Outline View implemented as a WebviewViewProvider
class SimpleOutlineWebviewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'zmodelSimpleOutline';
    private _view?: vscode.WebviewView;

    constructor(private readonly context: vscode.ExtensionContext) {
        vscode.window.onDidChangeActiveTextEditor(() => {
            this.updateView().catch(console.error);
        });
    }

    resolveWebviewView(webviewView: vscode.WebviewView) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
        };

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'openGitHubAuth':
                        try {
                            const session = await vscode.authentication.getSession(AUTH_PROVIDER_ID, AUTH_SCOPES, {
                                createIfNone: true,
                            });
                            if (session) {
                                vscode.window.showInformationMessage('Sign-in successful! Please retry your action.');
                            }
                        } catch (error) {
                            console.error('Authentication failed:', error);
                            vscode.window.showErrorMessage('GitHub authentication failed. Please try again.');
                        }
                        break;
                }
            },
            undefined,
            this.context.subscriptions
        );

        this.updateView().catch(console.error);
    }

    private async updateView() {
        if (!this._view) return;
        const editor = vscode.window.activeTextEditor;
        let html = '<h3>No file open</h3>';

        if (editor) {
            const fileName = editor.document.fileName;
            const isZModelFile = fileName.endsWith('.zmodel');

            if (isZModelFile) {
                // Check GitHub authentication before proceeding
                const session = await requireAuth();

                if (!session) {
                    html = `
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <style>
                            body { font-family: system-ui, -apple-system, sans-serif; padding: 10px; }
                            .auth-button {
                                background: #0066cc;
                                color: white;
                                padding: 8px 16px;
                                border: none;
                                border-radius: 4px;
                                cursor: pointer;
                                margin-top: 10px;
                            }
                            .auth-button:hover {
                                background: #0052a3;
                            }
                        </style>
                        <script>
                            const vscode = acquireVsCodeApi();
                        </script>
                    </head>
                    <body>
                        <h3>Authentication Required</h3>
                        <p>Please sign in to GitHub to generate documentation.</p>
                        <button class="auth-button" onclick="vscode.postMessage({ command: 'openGitHubAuth' })">Sign In</button>
                    </body>
                    </html>
                    `;
                    this._view.webview.html = html;
                    return;
                }

                html = this.createLoadingHtml(fileName);
                this._view.webview.html = html;

                try {
                    const documentation = await generateZModelDocumentation(editor.document);
                    html = await this.renderMarkdown(documentation);
                } catch (error) {
                    html = this.createErrorHtml(fileName, error);
                }
            } else {
                html = this.createBasicFileHtml(fileName);
            }
        }

        this._view.webview.html = html;
    }

    private async renderMarkdown(markdown: string): Promise<string> {
        // This uses the same engine as VS Code's preview
        return vscode.commands.executeCommand('markdown.api.render', markdown);
    }

    public async showMarkdownPreview() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found.');
            return;
        }

        // Check if it's a zmodel file and generate documentation, otherwise use dummy content
        let markdownContent = this.DummyZModelDocumentation;
        if (editor.document.fileName.endsWith('.zmodel')) {
            try {
                markdownContent = await generateZModelDocumentation(editor.document);
            } catch (error) {
                console.error('Error generating documentation:', error);
                vscode.window.showErrorMessage(
                    `Failed to generate documentation: ${error instanceof Error ? error.message : String(error)}`
                );
                markdownContent = this.DummyZModelDocumentation; // Fallback to dummy content
            }
        }

        // Create a temporary markdown file
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showErrorMessage('No workspace folder found.');
            return;
        }
        const tempFile = vscode.Uri.joinPath(workspaceFolder.uri, 'temp.md');

        // Write your markdown content to the temp file
        await vscode.workspace.fs.writeFile(tempFile, new TextEncoder().encode(markdownContent));

        // Open the markdown preview
        await vscode.commands.executeCommand('markdown.showPreviewToSide', tempFile);
    }

    private createLoadingHtml(fileName: string): string {
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: system-ui, -apple-system, sans-serif; padding: 10px; }
                .loading { color: #666; font-style: italic; }
                .filename { font-family: monospace; background: #f5f5f5; padding: 2px 4px; border-radius: 3px; }
            </style>
        </head>
        <body>
            <h3>Current File</h3>
            <div class="filename">${fileName}</div>
            <div class="loading">🔄 Generating documentation...</div>
        </body>
        </html>`;
    }

    private createDocumentationHtml(fileName: string, documentation: string): string {
        // Convert markdown to basic HTML
        const htmlContent = this.markdownToHtml(documentation);

        return `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: system-ui, -apple-system, sans-serif; padding: 10px; line-height: 1.6; }
                .filename { font-family: monospace; background: #f5f5f5; padding: 2px 4px; border-radius: 3px; }
                .documentation { margin-top: 15px; }
                h1, h2, h3, h4 { color: #333; margin-top: 20px; margin-bottom: 10px; }
                h1 { border-bottom: 2px solid #ddd; padding-bottom: 5px; }
                h2 { border-bottom: 1px solid #eee; padding-bottom: 3px; }
                code { background: #f8f8f8; padding: 2px 4px; border-radius: 3px; font-family: 'Monaco', 'Consolas', monospace; }
                pre { background: #f8f8f8; padding: 10px; border-radius: 5px; overflow-x: auto; }
                pre code { background: none; padding: 0; }
                ul, ol { padding-left: 20px; }
                li { margin: 5px 0; }
            </style>
        </head>
        <body>
            <h3>Current File</h3>
            <div class="filename">${fileName}</div>
            <div class="documentation">${htmlContent}</div>
        </body>
        </html>`;
    }

    private createErrorHtml(fileName: string, error: unknown): string {
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: system-ui, -apple-system, sans-serif; padding: 10px; }
                .filename { font-family: monospace; background: #f5f5f5; padding: 2px 4px; border-radius: 3px; }
                .error { color: #d73a49; background: #ffe6e6; padding: 10px; border-radius: 5px; margin-top: 10px; }
            </style>
        </head>
        <body>
            <h3>Current File</h3>
            <div class="filename">${fileName}</div>
            <div class="error">❌ Error generating documentation: ${error}</div>
        </body>
        </html>`;
    }

    private createBasicFileHtml(fileName: string): string {
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: system-ui, -apple-system, sans-serif; padding: 10px; }
                .filename { font-family: monospace; background: #f5f5f5; padding: 2px 4px; border-radius: 3px; }
            </style>
        </head>
        <body>
            <h3>Current File</h3>
            <div class="filename">${fileName}</div>
        </body>
        </html>`;
    }

    private markdownToHtml(markdown: string): string {
        // Basic markdown to HTML conversion
        return markdown
            .replace(/^### (.*$)/gim, '<h3>$1</h3>')
            .replace(/^## (.*$)/gim, '<h2>$1</h2>')
            .replace(/^# (.*$)/gim, '<h1>$1</h1>')
            .replace(/^\* (.*$)/gim, '<li>$1</li>')
            .replace(/^- (.*$)/gim, '<li>$1</li>')
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/\n\n/g, '</p><p>')
            .replace(/(<li>.*<\/li>)/g, '<ul>$1</ul>')
            .replace(/^(.*)$/gim, '<p>$1</p>')
            .replace(/<p><h[1-6]>/g, '<h')
            .replace(/<\/h[1-6]><\/p>/g, '</h>')
            .replace(/<p><ul>/g, '<ul>')
            .replace(/<\/ul><\/p>/g, '</ul>')
            .replace(/<p><\/p>/g, '');
    }

    private readonly DummyZModelDocumentation = `
# Technical Design Document

> Generated by [\`ZenStack-markdown\`](https://github.com/jiashengguo/zenstack-markdown)

This application is designed to manage collaborative spaces where users can create and manage lists and todos within those spaces. It provides a structured environment for team collaboration, task management, and personal organization within a shared context.

## Functionality

The app allows users to:
- Create and manage personal and shared spaces.
- Invite members to spaces with different roles (USER or ADMIN).
- Create lists within spaces, which can be private or public.
- Add, update, and delete todos within lists.
- Control access to spaces, lists, and todos based on user roles and ownership.

## Models:

- [Space](#Space)
- [SpaceUser](#SpaceUser)
- [User](#User)
- [List](#List)
- [Todo](#Todo)

### Space
\`\`\`mermaid
erDiagram
"Space" {
  String id PK 
  DateTime createdAt  
  DateTime updatedAt  
  String name  
  String slug  
}
"Space" ||--o{ "SpaceUser": members
"Space" ||--o{ "List": lists
\`\`\`
- Only authenticated users can interact with spaces.
- Anyone can create a new space.
- Users can read a space if they are a member of that space.
- Only admins of the space can update or delete the space.
### SpaceUser
\`\`\`mermaid
erDiagram
"SpaceUser" {
  String id PK 
  DateTime createdAt  
  DateTime updatedAt  
  String spaceId FK 
  String userId FK 
  SpaceUserRole role  
}
"SpaceUser" }o--|| "Space": space
"SpaceUser" }o--|| "User": user
\`\`\`
- Only authenticated users can interact with space memberships.
- Admins of the space can create, update, or delete memberships.
- Members can read their own membership details.
### User
\`\`\`mermaid
erDiagram
"User" {
  String id PK 
  DateTime createdAt  
  DateTime updatedAt  
  String email  
  DateTime emailVerified  "?"
  String password  "?"
  String name  "?"
  String image  "?"
}
"User" ||--o{ "SpaceUser": spaces
"User" ||--o{ "List": lists
"User" ||--o{ "Todo": todos
\`\`\`
- Anyone can create a new user account.
- Users can read their own profile or profiles of members in spaces they belong to.
- Users have full control over their own profile.
### List
\`\`\`mermaid
erDiagram
"List" {
  String id PK 
  DateTime createdAt  
  DateTime updatedAt  
  String spaceId FK 
  String ownerId FK 
  String title  
  Boolean private  
}
"List" }o--|| "Space": space
"List" }o--|| "User": owner
"List" ||--o{ "Todo": todos
\`\`\`
- Only authenticated users can interact with lists.
- Lists can be read by the owner or members of the space if the list is not private.
- Only the owner can create a list within a space they are a member of.
- The owner can update the list if they remain the owner after the update.
- Only the owner can delete the list.
### Todo
\`\`\`mermaid
erDiagram
"Todo" {
  String id PK 
  DateTime createdAt  
  DateTime updatedAt  
  String ownerId FK 
  String listId FK 
  String title  
  DateTime completedAt  "?"
}
"Todo" }o--|| "User": owner
"Todo" }o--|| "List": list
\`\`\`
- Only authenticated users can interact with todos.
- Todos can be managed by the list owner or members of the space if the list is not private.
- The owner of the list can perform all operations on todos.
- Updates to todos are restricted to prevent changing ownership.
`;
}

function registerOutlineView(context: vscode.ExtensionContext, simpleOutlineProvider: SimpleOutlineWebviewProvider) {
    context.subscriptions.push(
        vscode.commands.registerCommand('zenstack.open-in-window-from-outline', async () => {
            // Handle the command to open the outline in a new window
            await simpleOutlineProvider.showMarkdownPreview();
        })
    );

    // Register the preview command for zmodel files
    context.subscriptions.push(
        vscode.commands.registerCommand('zenstack.preview-zmodel', async () => {
            await previewZModelFile();
        })
    );
}

async function previewZModelFile(): Promise<void> {
    const editor = vscode.window.activeTextEditor;

    if (!editor) {
        vscode.window.showErrorMessage('No active editor found.');
        return;
    }

    const document = editor.document;
    if (!document.fileName.endsWith('.zmodel')) {
        vscode.window.showErrorMessage('The active file is not a ZModel file.');
        return;
    }

    // Check GitHub authentication before proceeding
    const session = await requireAuth();
    if (!session) {
        vscode.window.showWarningMessage('GitHub authentication required for ZModel preview.');
        return;
    }

    try {
        // Show progress indicator
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Generating ZModel documentation...',
                cancellable: false,
            },
            async () => {
                const markdownContent = await generateZModelDocumentation(document);
                await openMarkdownPreview(markdownContent, document.fileName);
            }
        );
    } catch (error) {
        console.error('Error previewing ZModel:', error);
        vscode.window.showErrorMessage(
            `Failed to preview ZModel: ${error instanceof Error ? error.message : String(error)}`
        );
    }
}

async function generateZModelDocumentation(document: vscode.TextDocument): Promise<string> {
    try {
        // Get available language models, preferring context7 models
        const models = await vscode.lm.selectChatModels({
            vendor: 'copilot',
            family: 'gpt-4o',
        });

        if (models.length === 0) {
            throw new Error(
                'No GitHub Copilot models available. Please ensure you are authenticated with GitHub Copilot.'
            );
        }

        // Find context7 model or use the first available model
        const selectedModel = models.find((model) => model.name.includes('context7')) || models[0];

        const zmodelContent = document.getText();

        // Create a comprehensive prompt for generating documentation
        const prompt = `You are a technical documentation expert specializing in ZenStack zmodel schema files. 

ZenStack extends Prisma with powerful features like access policies, field validation, and automatic API generation. 

Analyze the following zmodel file and generate comprehensive markdown documentation that includes:

## Analysis Requirements:
1. **Schema Overview** - Brief description of the data model's purpose
2. **Model Definitions** - Each model with its purpose, fields, and data types
3. **Relationships** - How models relate to each other (one-to-many, many-to-many, etc.)
4. **Access Policies** - Any @@allow, @@deny rules and their implications
5. **Field Attributes** - Special attributes like @default, @unique, @relation, etc.
6. **Enums** - Any enum definitions and their usage
7. **Data Validation** - Field-level validation rules
8. **Business Logic** - Derived from the schema structure and policies

## Formatting Guidelines:
- Use clear markdown headers (##, ###)
- Include code blocks for schema snippets
- Use bullet points for lists
- Highlight important security/access control implications
- Be concise but comprehensive

ZModel Schema Content:
\`\`\`zmodel
${zmodelContent}
\`\`\`

Generate detailed markdown documentation following the requirements above:`;

        const messages = [vscode.LanguageModelChatMessage.User(prompt)];

        const chatRequest = await selectedModel.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);

        let response = '';
        for await (const fragment of chatRequest.text) {
            response += fragment;
        }

        return response || 'No documentation generated';
    } catch (error) {
        console.error('Error generating documentation:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to generate documentation: ${errorMessage}`);
    }
}

async function openMarkdownPreview(markdownContent: string, originalFileName: string): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('No workspace folder found.');
        return;
    }

    // Create a temporary markdown file with a descriptive name
    const baseName = path.basename(originalFileName, '.zmodel');
    const tempFileName = `${baseName}-preview.md`;
    const tempFile = vscode.Uri.joinPath(workspaceFolder.uri, tempFileName);

    try {
        // Write the markdown content to the temp file
        await vscode.workspace.fs.writeFile(tempFile, new TextEncoder().encode(markdownContent));

        // Open the markdown preview side by side
        await vscode.commands.executeCommand('markdown.showPreviewToSide', tempFile);

        // Optionally clean up the temp file after a delaya
        setTimeout(async () => {
            try {
                await vscode.workspace.fs.delete(tempFile);
            } catch (error) {
                // Ignore cleanup errors
                console.log('Could not clean up temp file:', error);
            }
        }, 5000); // Clean up after 5 seconds
    } catch (error) {
        console.error('Error creating markdown preview:', error);
        throw new Error(`Failed to create markdown preview: ${error instanceof Error ? error.message : String(error)}`);
    }
}

let client: LanguageClient;

// This function is called when the extension is activated.
export function activate(context: vscode.ExtensionContext): void {
    client = startLanguageClient(context);

    // Register the simple outline webview view
    const provider = new SimpleOutlineWebviewProvider(context);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(SimpleOutlineWebviewProvider.viewType, provider)
    );

    registerOutlineView(context, provider);
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
    // Start the client. This will also launch the server
    void client.start();
    return client;
}
