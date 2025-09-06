import * as vscode from 'vscode';

/**
 * ReleaseNotesManager class handles release notes functionality
 */
export class ReleaseNotesManager implements vscode.Disposable {
    private static readonly RELEASE_NOTES_VERSION_KEY = 'release-notes-shown';

    private extensionContext: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.extensionContext = context;
        this.initialize();
    }

    /**
     * Initialize and register commands, show release notes if first time
     */
    initialize(): void {
        this.registerCommands(this.extensionContext);
        this.showReleaseNotesIfFirstTime();
    }

    /**
     * Register release notes commands
     */
    private registerCommands(context: vscode.ExtensionContext): void {
        // Register the release notes command
        context.subscriptions.push(
            vscode.commands.registerCommand('zenstack.show-release-notes', async () => {
                await this.showReleaseNotes();
            })
        );

        // Register the reset release notes command
        context.subscriptions.push(
            vscode.commands.registerCommand('zenstack.reset-release-notes', async () => {
                await this.resetReleaseNotesFlag();
            })
        );
    }

    /**
     * Show release notes on first activation of this version
     */
    async showReleaseNotesIfFirstTime(): Promise<void> {
        const currentVersion = this.extensionContext.extension.packageJSON.version;
        const lastShownVersion = this.extensionContext.globalState.get(ReleaseNotesManager.RELEASE_NOTES_VERSION_KEY);

        // Show release notes if this is the first time activating this version
        if (lastShownVersion !== currentVersion) {
            await this.showReleaseNotes();
            // Update the stored version to prevent showing again
            await this.extensionContext.globalState.update(
                ReleaseNotesManager.RELEASE_NOTES_VERSION_KEY,
                currentVersion
            );
            // Add this key to sync keys for cross-machine synchronization
            this.extensionContext.globalState.setKeysForSync([ReleaseNotesManager.RELEASE_NOTES_VERSION_KEY]);
        }
    }

    /**
     * Show release notes (can be called manually)
     */
    async showReleaseNotes(): Promise<void> {
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
            const releaseNotesPath = vscode.Uri.joinPath(this.extensionContext.extensionUri, 'release-notes.html');
            let htmlContent: string;

            try {
                const htmlBytes = await vscode.workspace.fs.readFile(releaseNotesPath);
                htmlContent = Buffer.from(htmlBytes).toString('utf8');
            } catch (error) {
                console.warn('Could not load release notes file, using fallback content:', error);
                htmlContent = this.getFallbackReleaseNotesContent();
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

    /**
     * Reset the release notes flag to allow showing again
     */
    async resetReleaseNotesFlag(): Promise<void> {
        try {
            await this.extensionContext.globalState.update(ReleaseNotesManager.RELEASE_NOTES_VERSION_KEY, undefined);
            vscode.window.showInformationMessage(
                'Release notes flag has been reset. The release notes will be shown again on next extension activation.'
            );
            console.log('Release notes version key has been cleared from global state');
        } catch (error) {
            console.error('Error resetting release notes flag:', error);
            vscode.window.showErrorMessage('Failed to reset release notes flag');
        }
    }

    /**
     * Fallback content if the HTML file can't be loaded
     */
    private getFallbackReleaseNotesContent(): string {
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

    /**
     * Dispose of resources
     */
    dispose(): void {
        // Any cleanup if needed
    }
}
