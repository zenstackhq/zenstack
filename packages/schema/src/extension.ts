import * as vscode from 'vscode';
import * as path from 'path';
import { z } from 'zod';

import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient/node';
import { DataModel, isDataModel, isEnum, Model } from '@zenstackhq/sdk/ast';
import MermaidGenerator from './mermaid-generator';
import { URI } from 'vscode-uri';

const AUTH_PROVIDER_ID = 'github';
const AUTH_SCOPES = ['user:email'];

// Define the structured response schema using Zod
export const ZModelDocumentationSchema = z.object({
    overview: z.object({
        description: z.string().describe("Brief description of the data model's purpose and what the application does"),
        functionality: z.array(z.string()).describe('Key functionality and features the application provides to users'),
    }),
    models: z
        .array(
            z.object({
                name: z.string().describe('The name of the data model'),
                description: z.string().describe('What this model represents and its purpose'),
                access_control_policies: z
                    .array(z.string())
                    .describe('Access control rules like @@allow, @@deny with explanations'),
            })
        )
        .describe('All data models found in the schema'),
    enums: z
        .array(
            z.object({
                name: z.string(),
                description: z.string(),
            })
        )
        .optional()
        .describe('Enum definitions if any'),
    business_logic: z.array(z.string()).describe('Key business rules and validation logic derived from the schema'),
    security_considerations: z
        .array(z.string())
        .describe('Important security implications from access policies and validation rules'),
});

export type ZModelDocumentation = z.infer<typeof ZModelDocumentationSchema>;

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

    // If session is available, fetch the user email from GitHub API using the access token
    if (session) {
        try {
            const email = await getGitHubUserEmail(session);
            if (email) {
                console.log('GitHub user email:', email);
            } else {
                console.log('Could not retrieve GitHub user email.');
            }
        } catch (e) {
            console.error('Failed to fetch GitHub user email:', e);
        }
    }

    return session;
}

// Fetch the user's primary email from GitHub using the session's access token
async function getGitHubUserEmail(session: vscode.AuthenticationSession): Promise<string | undefined> {
    const apiUrl = 'https://api.github.com/user/emails';
    try {
        const response = await fetch(apiUrl, {
            headers: {
                Authorization: `token ${session.accessToken}`,
                Accept: 'application/vnd.github.v3+json',
                'User-Agent': 'zenstack-vscode-extension',
            },
        });
        if (!response.ok) {
            throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
        }
        const emails: { email: string; primary: boolean; verified: boolean }[] = await response.json();
        // Find the primary, verified email
        const primary = emails.find((e) => e.primary && e.verified);
        if (primary) {
            return primary.email;
        }
        // Fallback: return the first verified email
        const verified = emails.find((e) => e.verified);
        return verified ? verified.email : undefined;
    } catch (e) {
        console.error('Error fetching GitHub user email:', e);
        return undefined;
    }
}

// Outline View implemented as a WebviewViewProvider
class SimpleOutlineWebviewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'zmodelSimpleOutline';
    private _view?: vscode.WebviewView;

    constructor(private readonly context: vscode.ExtensionContext) {
        vscode.window.onDidChangeActiveTextEditor(() => {
            //this.updateView().catch(console.error);
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
                    html = `error generating documentation: ${error instanceof Error ? error.message : String(error)}`;
                }
            } else {
                html = `${fileName}`;
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

    // Register the release notes command
    context.subscriptions.push(
        vscode.commands.registerCommand('zenstack.show-release-notes', async () => {
            await showReleaseNotes(context);
        })
    );

    // Register the reset release notes command
    context.subscriptions.push(
        vscode.commands.registerCommand('zenstack.reset-release-notes', async () => {
            await resetReleaseNotesFlag(context);
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

// Add this function to communicate with the language server
async function getParsedAST(document: vscode.TextDocument): Promise<{
    ast: Model;
    importedURIs: URI[];
    errors: string[];
    diagnostics: unknown[];
} | null> {
    if (!client) {
        throw new Error('Language client not initialized');
    }

    try {
        // Ensure the language server is ready
        await client.start();

        // Send the custom request to get AST
        const result = await client.sendRequest('zenstack/getAST', {
            textDocument: {
                uri: document.uri.toString(),
            },
        });

        return result as {
            ast: Model;
            importedURIs: URI[];
            errors: string[];
            diagnostics: unknown[];
        };
    } catch (error) {
        console.error('Error getting AST from language server:', error);
        throw error;
    }
}

async function generateZModelDocumentation(document: vscode.TextDocument): Promise<string> {
    try {
        // Get available language models, preferring context7 models
        const models = await vscode.lm.selectChatModels({
            vendor: 'copilot',
        });

        if (models.length === 0) {
            throw new Error(
                'No GitHub Copilot models available. Please ensure you are authenticated with GitHub Copilot.'
            );
        }

        const selectedModel = models[0];

        console.log('Using model:', selectedModel.name);

        // Get parsed AST from language server
        let astInfo = null;
        try {
            astInfo = await getParsedAST(document);
            console.log('AST obtained from language server:', astInfo);
        } catch (error) {
            console.warn('Could not get AST from language server:', error);
        }

        const importedURIs = astInfo?.importedURIs || [];

        // get vscode document from importedURIs
        const importedTexts = await Promise.all(
            importedURIs.map(async (uri) => {
                try {
                    const fileUri = vscode.Uri.file(uri.path);
                    const fileContent = await vscode.workspace.fs.readFile(fileUri);
                    return Buffer.from(fileContent).toString('utf8');
                } catch (error) {
                    console.warn(`Could not read file for URI ${uri}:`, error);
                    return null;
                }
            })
        );

        const zmodelContent = [document.getText(), ...importedTexts.filter((text) => text !== null)].join('\n\n');

        console.log('ZModel content generated:', zmodelContent);

        // Create enhanced prompt requesting structured JSON output
        const prompt = `You are a technical documentation expert specializing in ZenStack zmodel schema files. 

ZenStack extends Prisma with powerful features like access policies, field validation, and automatic API generation.

Analyze the following zmodel file and return a structured JSON response that follows this exact schema:

\`\`\`json
{
  "overview": {
    "description": "Brief description of the data model's purpose and what the application does",
    "functionality": ["Key functionality and features the application provides to users"]
  },
  "models": [
    {
      "name": "ModelName",
      "description": "What this model represents and its purpose",
      "access_control_policies": ["@@allow rule explanations", "@@deny rule explanations"]
    }
  ],
  "enums": [
    {
      "name": "EnumName",
      "description": "What this enum represents"
    }
  ],
  "business_logic": ["Key business rule 1", "Key business rule 2"],
  "security_considerations": ["Security implication 1", "Security implication 2"]
}
\`\`\`

ZModel Schema Content:
\`\`\`zmodel
${zmodelContent}
\`\`\`

IMPORTANT: 
- Return ONLY valid JSON,no markdown formatting or code blocks.
- Explain access control policies in plain English. 
- If model 'extends' from base model, also include the base model's policies. Don't say it is inherited, treat it the same as the ones defined in the model.
- Be thorough but concise in descriptions.
`;

        const messages = [vscode.LanguageModelChatMessage.User(prompt)];

        // record the time spent
        const startTime = Date.now();

        const chatRequest = await selectedModel.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);

        let endTime = Date.now();
        console.log(`Chat request completed in ${endTime - startTime} ms`);

        let response = '';
        for await (const fragment of chatRequest.text) {
            response += fragment;
        }

        endTime = Date.now();

        console.log(`Response completed in ${endTime - startTime} ms`);

        // Parse and validate the JSON response
        try {
            const jsonResponse = JSON.parse(response);
            const validatedData = ZModelDocumentationSchema.parse(jsonResponse);

            // Convert the validated structured data back to markdown
            return convertStructuredDataToMarkdown(validatedData, astInfo!.ast);
        } catch (parseError) {
            console.warn('Failed to parse JSON response, falling back to raw response:', parseError);

            // If JSON parsing fails, return the raw response as fallback
            return response || 'No documentation generated';
        }
    } catch (error) {
        console.error('Error generating documentation:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(`Failed to generate documentation: ${errorMessage}`);
    }
}

// Convert structured data to markdown format
function convertStructuredDataToMarkdown(data: ZModelDocumentation, model: Model): string {
    const mermaidGenerator = new MermaidGenerator(model);

    const functionality = data.overview.functionality.map((item) => `- ${item}`).join('\n');

    const emums = model.declarations.filter((x) => isEnum(x));

    const enumChapter = emums.map((enumDef) => {
        const aiGeneratedEnum = data.enums?.find((e) => e.name === enumDef.name);
        return [
            `### ${enumDef.name}`,
            aiGeneratedEnum?.description || '',
            enumDef.fields.map((f) => `- ${f.name}`).join('\n'),
            '\n',
        ].join('\n');
    });

    const dataModels = model.declarations.filter((x) => isDataModel(x) && !x.isAbstract) as DataModel[];

    const modelChapter = dataModels
        .map((model) => {
            const aiGeneratedModel = data.models.find((m) => m.name === model.name);

            return [
                `### ${model.name}`,
                aiGeneratedModel?.description,
                mermaidGenerator.generate(model),
                aiGeneratedModel?.access_control_policies.map((policy) => `- ${policy}`)?.join('\n'),
            ].join('\n');
        })
        .join('\n');

    const businessLogicChapter = data.business_logic.map((rule) => `- ${rule}`).join('\n');

    const securityConsiderationsChapter = data.security_considerations
        .map((consideration) => `- ${consideration}`)
        .join('\n');

    const content = [
        `# Technical Design Document`,
        `## Overview`,
        data.overview.description,
        `## Functionality`,
        functionality,
        enumChapter.length > 0 ? `## Enums` : '',
        enumChapter,
        `## Models`,
        dataModels.map((model) => `- [${model.name}](#${model.name})`).join('\n'),
        modelChapter,
        `## Business Logic`,
        businessLogicChapter,
        `## Security Considerations`,
        securityConsiderationsChapter,
    ].join('\n\n');

    return content;
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

// Show release notes on first activation of this version
async function showReleaseNotesIfFirstTime(context: vscode.ExtensionContext): Promise<void> {
    const RELEASE_NOTES_VERSION_KEY = 'zenstack.releaseNotesShown';
    const currentVersion = context.extension.packageJSON.version;
    const lastShownVersion = context.globalState.get(RELEASE_NOTES_VERSION_KEY);

    // Show release notes if this is the first time activating this version
    if (lastShownVersion !== currentVersion) {
        await showReleaseNotes(context);
        // Update the stored version to prevent showing again
        await context.globalState.update(RELEASE_NOTES_VERSION_KEY, currentVersion);
    }
}

// Show release notes (can be called manually)
async function showReleaseNotes(context: vscode.ExtensionContext): Promise<void> {
    try {
        // Create and show the release notes webview
        const panel = vscode.window.createWebviewPanel(
            'zenstackReleaseNotes',
            'ZenStack - New Feature Announcement!',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
            }
        );

        // Read the release notes HTML file
        const releaseNotesPath = vscode.Uri.joinPath(context.extensionUri, 'release-notes.html');
        let htmlContent: string;

        try {
            const htmlBytes = await vscode.workspace.fs.readFile(releaseNotesPath);
            htmlContent = Buffer.from(htmlBytes).toString('utf8');
        } catch (error) {
            console.warn('Could not load release notes file, using fallback content:', error);
            htmlContent = getFallbackReleaseNotesContent();
        }

        panel.webview.html = htmlContent;

        // Optional: Close the panel when user clicks outside or after some time
        panel.onDidDispose(() => {
            // Panel disposed
        });
    } catch (error) {
        console.error('Error showing release notes:', error);
        vscode.window.showErrorMessage('Could not show release notes');
    }
}

// Reset the release notes flag to allow showing again
async function resetReleaseNotesFlag(context: vscode.ExtensionContext): Promise<void> {
    const RELEASE_NOTES_VERSION_KEY = 'zenstack.releaseNotesShown';

    try {
        await context.globalState.update(RELEASE_NOTES_VERSION_KEY, undefined);
        vscode.window.showInformationMessage(
            'Release notes flag has been reset. The release notes will be shown again on next extension activation.'
        );
        console.log('Release notes version key has been cleared from global state');
    } catch (error) {
        console.error('Error resetting release notes flag:', error);
        vscode.window.showErrorMessage('Failed to reset release notes flag');
    }
}

// Fallback content if the HTML file can't be loaded
function getFallbackReleaseNotesContent(): string {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { 
                font-family: system-ui, -apple-system, sans-serif; 
                padding: 20px; 
                max-width: 800px; 
                margin: 0 auto; 
                background-color: var(--vscode-editor-background);
                color: var(--vscode-editor-foreground);
            }
            .header { 
                background-color: var(--vscode-button-background); 
                color: var(--vscode-button-foreground); 
                padding: 20px; 
                border-radius: 8px; 
                text-align: center; 
                margin-bottom: 20px; 
            }
            .feature { 
                background-color: var(--vscode-textBlockQuote-background); 
                border: 1px solid var(--vscode-textBlockQuote-border);
                padding: 15px; 
                border-radius: 6px; 
                margin: 15px 0; 
                border-left: 4px solid var(--vscode-button-background); 
            }
            .steps { 
                background-color: var(--vscode-textCodeBlock-background); 
                padding: 15px; 
                border-radius: 6px; 
                margin: 15px 0; 
            }
            a {
                color: var(--vscode-textLink-foreground);
                text-decoration: none;
            }
            a:hover {
                text-decoration: underline;
                color: var(--vscode-textLink-activeForeground);
            }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>🎉 New Feature: ZModel Documentation Preview!</h1>
            <p>Generate beautiful documentation directly from your ZModel schema files</p>
        </div>
        
        <div class="feature">
            <h3>📖 What's New</h3>
            <p>You can now preview comprehensive documentation for your ZModel schema files, just like you would preview a markdown file!</p>
        </div>
        
        <div class="steps">
            <h3>🚀 How to Use</h3>
            <ol>
                <li>Open any .zmodel file</li>
                <li>Click the preview button (👁️) in the editor toolbar</li>
                <li>Sign in with GitHub (one-time setup)</li>
                <li>Enjoy your AI-generated documentation!</li>
            </ol>
        </div>
        
        <div class="feature">
            <h3>✨ Features</h3>
            <ul>
                <li>Comprehensive model documentation</li>
                <li>Beautiful ER diagrams with Mermaid</li>
                <li>Access control policy explanations</li>
                <li>Business logic analysis</li>
                <li>Security considerations</li>
            </ul>
        </div>
        
        <p style="text-align: center; color: var(--vscode-descriptionForeground); margin-top: 30px;">
            Happy coding with ZenStack! 🚀<br>
            <a href="https://zenstack.dev">Learn more about ZenStack</a>
        </p>
    </body>
    </html>
    `;
}

// This function is called when the extension is activated.
export function activate(context: vscode.ExtensionContext): void {
    client = startLanguageClient(context);

    // Register the simple outline webview view
    const provider = new SimpleOutlineWebviewProvider(context);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(SimpleOutlineWebviewProvider.viewType, provider)
    );

    registerOutlineView(context, provider);

    // Show release notes on first activation
    showReleaseNotesIfFirstTime(context);
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
