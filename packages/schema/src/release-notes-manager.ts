import * as vscode from 'vscode';

/**
 * ReleaseNotesManager class handles release notes functionality
 */
export class ReleaseNotesManager implements vscode.Disposable {
    private extensionContext: vscode.ExtensionContext;
    private releaseNoteVersionKey: string;

    constructor(context: vscode.ExtensionContext) {
        this.extensionContext = context;
        this.releaseNoteVersionKey = `release-notes-shown:${this.extensionContext.extension.packageJSON.version}`;
        this.initialize();
    }

    /**
     * Initialize and register commands, show release notes if first time
     */
    initialize(): void {
        this.showReleaseNotesIfFirstTime();
    }

    /**
     * Show release notes on first activation of this version
     */
    async showReleaseNotesIfFirstTime(): Promise<void> {
        // Show release notes if this is the first time activating this version
        if (!this.extensionContext.globalState.get(this.releaseNoteVersionKey)) {
            await this.showReleaseNotes();
            // Update the stored version to prevent showing again
            await this.extensionContext.globalState.update(this.releaseNoteVersionKey, true);
            // Add this key to sync keys for cross-machine synchronization
            this.extensionContext.globalState.setKeysForSync([this.releaseNoteVersionKey]);
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
            const releaseNotesPath = vscode.Uri.joinPath(this.extensionContext.extensionUri, 'src/release-notes.html');

            const htmlBytes = await vscode.workspace.fs.readFile(releaseNotesPath);
            const htmlContent = Buffer.from(htmlBytes).toString('utf8');

            panel.webview.html = htmlContent;

            // Optional: Close the panel when user clicks outside or after some time
            panel.onDidDispose(() => {
                // Panel disposed
            });
        } catch (error) {
            console.error('Error showing release notes:', error);
        }
    }

    /**
     * Dispose of resources
     */
    dispose(): void {
        // Any cleanup if needed
    }
}
