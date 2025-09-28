import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import { z } from 'zod';
import { LanguageClient } from 'vscode-languageclient/node';
import { URI } from 'vscode-uri';
import { DocumentationCache } from './documentation-cache';
import { requireAuth } from '../extension';
import { API_URL } from './zenstack-auth-provider';
import telemetry from './vscode-telemetry';

/**
 * ZModelPreview class handles ZModel file preview functionality
 */
export class ZModelPreview implements vscode.Disposable {
    private documentationCache: DocumentationCache;
    private languageClient: LanguageClient;
    private lastGeneratedMarkdown: string | null = null;
    // use a zero-width space in the file name to make it non-colliding with user file
    private readonly previewZModelFileName = `zmodel${'\u200B'}-preview.md`;

    // Schema for validating the request body
    private static DocRequestSchema = z.object({
        models: z.array(
            z.object({
                path: z.string().optional(),
                content: z.string(),
            })
        ),
        environments: z
            .object({
                vscodeAppName: z.string(),
                vscodeVersion: z.string(),
                vscodeAppHost: z.string(),
                osRelease: z.string(),
                osType: z.string(),
            })
            .optional(),
    });

    constructor(context: vscode.ExtensionContext, client: LanguageClient, cache: DocumentationCache) {
        this.documentationCache = cache;
        this.languageClient = client;
        this.initialize(context);
    }

    /**
     * Initialize and register commands
     */
    initialize(context: vscode.ExtensionContext): void {
        this.registerCommands(context);

        context.subscriptions.push(
            vscode.window.tabGroups.onDidChangeTabs(() => {
                const activeTabLabels = vscode.window.tabGroups.all.filter((group) =>
                    group.activeTab?.label?.endsWith(this.previewZModelFileName)
                );
                if (activeTabLabels.length > 0) {
                    vscode.commands.executeCommand('setContext', 'zenstack.isMarkdownPreview', true);
                } else {
                    vscode.commands.executeCommand('setContext', 'zenstack.isMarkdownPreview', false);
                }
            })
        );
    }

    /**
     * Register ZModel preview commands
     */
    private registerCommands(context: vscode.ExtensionContext): void {
        // Register the preview command for zmodel files
        context.subscriptions.push(
            vscode.commands.registerCommand('zenstack.preview-zmodel', async () => {
                await this.previewZModelFile();
            })
        );

        // Register the save documentation command for zmodel files
        context.subscriptions.push(
            vscode.commands.registerCommand('zenstack.save-zmodel-documentation', async () => {
                await this.saveZModelDocumentation();
            })
        );

        // Register cache management commands
        context.subscriptions.push(
            vscode.commands.registerCommand('zenstack.clear-documentation-cache', async () => {
                await this.documentationCache.clearAllCache();
                vscode.window.showInformationMessage('ZenStack documentation cache cleared');
            })
        );
    }

    /**
     * Preview a ZModel file
     */
    async previewZModelFile(): Promise<void> {
        telemetry.track('extension:zmodel-preview');
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

        // Check authentication before proceeding
        const session = await requireAuth();
        if (!session) {
            return;
        }

        try {
            this.checkForMermaidExtensions();
            // Show progress indicator
            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: 'Generating ZModel documentation...',
                    cancellable: false,
                },
                async () => {
                    const markdownContent = await this.generateZModelDocumentation(document);

                    if (markdownContent) {
                        // Store the generated content for potential saving later
                        this.lastGeneratedMarkdown = markdownContent;

                        await this.openMarkdownPreview(markdownContent);
                    }
                }
            );
        } catch (error) {
            console.error('Error previewing ZModel:', error);
            vscode.window.showErrorMessage(
                `Failed to preview ZModel: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    /**
     * Get all imported ZModel URIs using the language server
     */
    private async getAllImportedZModelURIs(document: vscode.TextDocument): Promise<{
        hasSyntaxErrors: boolean;
        importedURIs: URI[];
    }> {
        if (!this.languageClient) {
            throw new Error('Language client not initialized');
        }

        try {
            // Ensure the language server is ready
            await this.languageClient.start();

            // Send the custom request to get all imported ZModel URIs
            const result = await this.languageClient.sendRequest('zenstack/getAllImportedZModelURIs', {
                textDocument: {
                    uri: document.uri.toString(),
                },
            });

            return result as {
                hasSyntaxErrors: boolean;
                importedURIs: URI[];
            };
        } catch (error) {
            console.error('Error getting AST from language server:', error);
            throw error;
        }
    }

    /**
     * Generate documentation for ZModel
     */
    private async generateZModelDocumentation(document: vscode.TextDocument): Promise<string> {
        try {
            const astInfo = await this.getAllImportedZModelURIs(document);

            if (astInfo?.hasSyntaxErrors !== false) {
                vscode.window.showWarningMessage('Please fix the errors in the ZModel first');
                return '';
            }

            const importedURIs = astInfo?.importedURIs;

            // get vscode document from importedURIs
            const importedModels = await Promise.all(
                importedURIs.map(async (uri) => {
                    try {
                        const fileUri = vscode.Uri.file(uri.path);
                        const fileContent = await vscode.workspace.fs.readFile(fileUri);
                        const filePath = fileUri.path;
                        return { content: Buffer.from(fileContent).toString('utf8').trim(), path: filePath };
                    } catch (error) {
                        throw new Error(
                            `Failed to read imported ZModel file at ${uri.path}: ${
                                error instanceof Error ? error.message : String(error)
                            }`
                        );
                    }
                })
            );

            const allModels = [{ content: document.getText().trim(), path: document.uri.path }, ...importedModels];

            const session = await requireAuth();
            if (!session) {
                throw new Error('Authentication required to generate documentation');
            }

            // Prepare request body
            const requestBody: z.infer<typeof ZModelPreview.DocRequestSchema> = {
                models: allModels,
                environments: {
                    vscodeAppName: vscode.env.appName,
                    vscodeVersion: vscode.version,
                    vscodeAppHost: vscode.env.appHost,
                    osRelease: os.release(),
                    osType: os.type(),
                },
            };

            const allModelsContent = allModels.map((m) => m.content);

            // Check cache first
            const cachedResponse = await this.documentationCache.getCachedResponse(allModelsContent);
            if (cachedResponse) {
                return cachedResponse;
            }

            // record the time spent
            const startTime = Date.now();
            const apiResponse = await fetch(`${API_URL}/api/doc`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    authorization: session.accessToken,
                },
                body: JSON.stringify(requestBody),
            });

            console.log(`API request completed in ${Date.now() - startTime} ms`);

            if (!apiResponse.ok) {
                throw new Error(`API request failed: ${apiResponse.status} ${apiResponse.statusText}`);
            }

            const responseText = await apiResponse.text();

            // Cache the response
            await this.documentationCache.setCachedResponse(allModelsContent, responseText);

            return responseText;
        } catch (error) {
            console.error('Error generating documentation:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to generate documentation: ${errorMessage}`);
        }
    }

    /**
     * Open markdown preview
     */
    private async openMarkdownPreview(markdownContent: string): Promise<void> {
        // Create a temporary markdown file with a descriptive name in the system temp folder
        const tempFilePath = path.join(os.tmpdir(), this.previewZModelFileName);
        const tempFile = vscode.Uri.file(tempFilePath);

        try {
            // Write the markdown content to the temp file
            await vscode.workspace.fs.writeFile(tempFile, new TextEncoder().encode(markdownContent));
            // Open the markdown preview side by side
            await vscode.commands.executeCommand('markdown.showPreviewToSide', tempFile);
        } catch (error) {
            console.error('Error creating markdown preview:', error);
            throw new Error(
                `Failed to create markdown preview: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    /**
     * Save ZModel documentation to a user-selected file
     */
    async saveZModelDocumentation(): Promise<void> {
        telemetry.track('extension:zmodel-save');
        // Check if we have cached content first
        if (!this.lastGeneratedMarkdown) {
            vscode.window.showErrorMessage(
                'No documentation content available to save. Please generate the documentation first by running "Preview ZModel Documentation".'
            );
            return;
        }

        // Show save dialog
        let defaultFilePath = `zmodel-doc.md`;

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            const workspacePath = workspaceFolders[0].uri.fsPath;
            // If the workspace folder exists, use it
            defaultFilePath = path.join(workspacePath, defaultFilePath);
        }

        const saveUri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(defaultFilePath),
            filters: {
                Markdown: ['md'],
                'All Files': ['*'],
            },
            saveLabel: 'Save Documentation',
        });

        if (!saveUri) {
            return; // User cancelled
        }

        try {
            // Write the markdown content to the selected file
            await vscode.workspace.fs.writeFile(saveUri, new TextEncoder().encode(this.lastGeneratedMarkdown));
            // Open and close the saved file to refresh the shown markdown preview
            await vscode.commands.executeCommand('vscode.open', saveUri);
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        } catch (error) {
            console.error('Error saving markdown file:', error);
            vscode.window.showErrorMessage(
                `Failed to save documentation: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    /**
     * Check for Mermaid extensions
     */
    private checkForMermaidExtensions(): void {
        const setting = vscode.workspace.getConfiguration('zenstack').get('searchForExtensions');
        if (setting !== false) {
            const extensions = vscode.extensions.all.filter((extension) =>
                ['markdown-mermaid', 'vscode-mermaid-chart', 'vscode-mermaid-preview'].some((name) =>
                    extension.packageJSON.name?.toLowerCase().includes(name.toLowerCase())
                )
            );
            if (extensions.length === 0) {
                const searchAction = 'Search';
                const stopShowing = "Don't show again";
                vscode.window
                    .showInformationMessage(
                        'Search for extensions to view mermaid chart in ZModel preview doc?',
                        searchAction,
                        stopShowing
                    )
                    .then((selectedAction) => {
                        if (selectedAction === searchAction) {
                            vscode.commands.executeCommand('workbench.extensions.search', 'markdown-mermaid');
                        } else if (selectedAction === stopShowing) {
                            vscode.workspace
                                .getConfiguration('zenstack')
                                .update('searchForExtensions', false, vscode.ConfigurationTarget.Global);
                        }
                    });
            }
        }
    }

    /**
     * Dispose of resources
     */
    dispose(): void {
        // Any cleanup if needed
    }
}
