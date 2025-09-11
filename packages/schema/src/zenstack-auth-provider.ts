import * as vscode from 'vscode';

interface JWTClaims {
    jti?: string;
    sub?: string;
    email?: string;
    exp?: number;
    [key: string]: unknown;
}

export const AUTH_PROVIDER_ID = 'ZenStack';
export const AUTH_URL = 'https://accounts.zenstack.dev';
export const API_URL = 'https://api.zenstack.dev';

export class ZenStackAuthenticationProvider implements vscode.AuthenticationProvider, vscode.Disposable {
    private _onDidChangeSessions =
        new vscode.EventEmitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>();
    public readonly onDidChangeSessions = this._onDidChangeSessions.event;

    private _sessions: vscode.AuthenticationSession[] = [];
    private _context: vscode.ExtensionContext;
    private _disposable: vscode.Disposable;
    private pendingAuth?: {
        resolve: (session: vscode.AuthenticationSession) => void;
        reject: (error: Error) => void;
        scopes: readonly string[];
    };

    constructor(context: vscode.ExtensionContext) {
        this._context = context;

        this._disposable = vscode.Disposable.from(
            vscode.authentication.registerAuthenticationProvider(AUTH_PROVIDER_ID, 'ZenStack', this),
            vscode.window.registerUriHandler({
                handleUri: async (uri: vscode.Uri) => {
                    if (uri.path === '/auth-callback') {
                        await this.handleAuthCallback(uri);
                    }
                },
            })
        );
    }

    async getSessions(_scopes?: readonly string[]): Promise<vscode.AuthenticationSession[]> {
        // Check if we have stored sessions in VS Code's secret storage
        const storedSessions = await this.getStoredSessions();
        this._sessions = storedSessions;
        return this._sessions;
    }

    async createSession(scopes: readonly string[]): Promise<vscode.AuthenticationSession> {
        // Create a login flow
        const session = await this.performLogin(scopes);
        if (session) {
            this._sessions.push(session);
            await this.storeSession(session);
            this._onDidChangeSessions.fire({
                added: [session],
                removed: [],
                changed: [],
            });
        }
        return session;
    }

    async removeSession(sessionId: string): Promise<void> {
        const sessionIndex = this._sessions.findIndex((s) => s.id === sessionId);
        if (sessionIndex > -1) {
            const session = this._sessions[sessionIndex];
            this._sessions.splice(sessionIndex, 1);
            await this.removeStoredSession(sessionId);
            this._onDidChangeSessions.fire({
                added: [],
                removed: [session],
                changed: [],
            });
        }
    }

    private async performLogin(scopes: readonly string[]): Promise<vscode.AuthenticationSession> {
        // Create the authentication promise
        return vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Signing in to ZenStack',
                cancellable: true,
            },
            async (progress, token) => {
                return new Promise<vscode.AuthenticationSession>((resolve, reject) => {
                    // Handle cancellation
                    token.onCancellationRequested(() => {
                        if (this.pendingAuth) {
                            delete this.pendingAuth;
                        }
                        reject(new Error('User Cancelled'));
                    });

                    const isCursor = vscode.env.appName == 'Cursor';

                    let signInUrl = vscode.Uri.parse(new URL('/sign-in', AUTH_URL).toString());

                    if (isCursor) {
                        signInUrl = signInUrl.with({
                            query: `redirect_url=${API_URL}/oauth/oauth_callback?vscodeapp=cursor`,
                        });
                    }

                    console.log('ZenStack sign-in URL:', signInUrl.toString());
                    // Store the state and resolve function for later use
                    this.pendingAuth = { resolve, reject, scopes };

                    // Open the ZenStack sign-in page in the user's default browser
                    vscode.env.openExternal(signInUrl).then(
                        () => {
                            console.log('Opened ZenStack sign-in page in browser');
                            progress.report({ message: 'Waiting for return from browser...' });
                        },
                        (error) => {
                            if (this.pendingAuth) {
                                delete this.pendingAuth;
                            }
                            reject(new Error(`Failed to open sign-in page: ${error}`));
                        }
                    );

                    setTimeout(() => {
                        if (this.pendingAuth) {
                            delete this.pendingAuth;
                        }
                        reject(new Error('Timeout'));
                    }, 60000);
                });
            }
        );
    }
    private generateState(): string {
        return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    }

    // Handle authentication callback from ZenStack
    public async handleAuthCallback(callbackUri: vscode.Uri): Promise<void> {
        const query = new URLSearchParams(callbackUri.query);
        const accessToken = query.get('access_token');
        if (!this.pendingAuth) {
            console.warn('No pending authentication found');
            return;
        }
        if (!accessToken) {
            this.pendingAuth.reject(new Error('No access token received'));
            delete this.pendingAuth;
            return;
        }
        try {
            // Create session from the access token
            const session = await this.createSessionFromAccessToken(accessToken);
            this.pendingAuth.resolve(session);
            delete this.pendingAuth;
        } catch (error) {
            if (this.pendingAuth) {
                this.pendingAuth.reject(error instanceof Error ? error : new Error(String(error)));
                delete this.pendingAuth;
            }
        }
    }

    private async createSessionFromAccessToken(accessToken: string): Promise<vscode.AuthenticationSession> {
        try {
            // Decode JWT to get claims
            const claims = this.parseJWTClaims(accessToken);
            return {
                id: claims.jti || Math.random().toString(36),
                accessToken: accessToken,
                account: {
                    id: claims.sub || 'unknown',
                    label: claims.email || 'unknown@zenstack.dev',
                },
                scopes: [],
            };
        } catch (error) {
            throw new Error(`Failed to create session from access token: ${error}`);
        }
    }

    private parseJWTClaims(token: string): JWTClaims {
        try {
            // JWT tokens have 3 parts separated by dots: header.payload.signature
            const parts = token.split('.');
            if (parts.length !== 3) {
                throw new Error('Invalid JWT format');
            }

            // Decode the payload (second part)
            const payload = parts[1];
            // Add padding if needed for base64 decoding
            const paddedPayload = payload + '='.repeat((4 - (payload.length % 4)) % 4);
            const decoded = atob(paddedPayload);

            return JSON.parse(decoded);
        } catch (error) {
            throw new Error(`Failed to parse JWT claims: ${error}`);
        }
    }

    private async getStoredSessions(): Promise<vscode.AuthenticationSession[]> {
        try {
            const stored = await this._context.secrets.get('zenstack-auth-sessions');
            return stored ? JSON.parse(stored) : [];
        } catch (error) {
            console.error('Error retrieving stored sessions:', error);
            return [];
        }
    }

    private async storeSession(session: vscode.AuthenticationSession): Promise<void> {
        try {
            const sessions = await this.getStoredSessions();
            sessions.push(session);
            await this._context.secrets.store('zenstack-auth-sessions', JSON.stringify(sessions));
        } catch (error) {
            console.error('Error storing session:', error);
        }
    }

    private async removeStoredSession(sessionId: string): Promise<void> {
        try {
            const sessions = await this.getStoredSessions();
            const filteredSessions = sessions.filter((s) => s.id !== sessionId);
            await this._context.secrets.store('zenstack-auth-sessions', JSON.stringify(filteredSessions));
        } catch (error) {
            console.error('Error removing stored session:', error);
        }
    }

    /**
     * Dispose the registered services
     */
    public async dispose() {
        this._disposable.dispose();
    }
}
