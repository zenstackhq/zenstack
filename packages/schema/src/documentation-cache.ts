import * as vscode from 'vscode';

// Cache entry interface
interface CacheEntry {
    data: string;
    timestamp: number;
}

/**
 * DocumentationCache class handles persistent caching of ZModel documentation
 * using VS Code's globalState for cross-session persistence
 */
export class DocumentationCache implements vscode.Disposable {
    private static readonly CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes cache duration
    private static readonly CACHE_PREFIX = 'doc-cache.';
    private static readonly CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour cleanup interval

    private extensionContext: vscode.ExtensionContext;
    private cleanupInterval: NodeJS.Timeout | undefined;

    constructor(context: vscode.ExtensionContext) {
        this.extensionContext = context;
        this.startPeriodicCleanup();
    }

    /**
     * Start periodic cache cleanup (runs every hour)
     */
    private startPeriodicCleanup(): void {
        // Clear any existing interval first
        this.stopPeriodicCleanup();

        this.cleanupInterval = setInterval(async () => {
            await this.clearExpiredCache();
        }, DocumentationCache.CLEANUP_INTERVAL_MS);
    }

    /**
     * Stop periodic cache cleanup
     */
    stopPeriodicCleanup(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = undefined;
        }
    }

    /**
     * Dispose of the cache resources (implements vscode.Disposable)
     */
    dispose(): void {
        this.stopPeriodicCleanup();
    }

    /**
     * Get the cache prefix used for keys
     */
    getCachePrefix(): string {
        return DocumentationCache.CACHE_PREFIX;
    }

    /**
     * Enable cache synchronization across machines via VS Code Settings Sync
     */
    private enableCacheSync(): void {
        const cacheKeys = this.extensionContext.globalState
            .keys()
            .filter((key) => key.startsWith(DocumentationCache.CACHE_PREFIX));
        if (cacheKeys.length > 0) {
            this.extensionContext.globalState.setKeysForSync(cacheKeys);
        }
    }

    /**
     * Generate a cache key from request body with normalized content
     */
    private generateCacheKey(requestBody: { models: string[] }): string {
        // Remove ALL whitespace characters from each model string for cache key generation
        // This ensures identical content with different formatting uses the same cache
        const normalizedModels = requestBody.models.map((model) => model.replace(/\s/g, ''));
        const hash = Buffer.from(JSON.stringify({ models: normalizedModels })).toString('base64');
        return `${DocumentationCache.CACHE_PREFIX}${hash}`;
    }

    /**
     * Check if cache entry is still valid (not expired)
     */
    private isCacheValid(entry: CacheEntry): boolean {
        return Date.now() - entry.timestamp < DocumentationCache.CACHE_DURATION_MS;
    }

    /**
     * Get cached response if available and valid
     */
    async getCachedResponse(requestBody: { models: string[] }): Promise<string | null> {
        const cacheKey = this.generateCacheKey(requestBody);
        const entry = this.extensionContext.globalState.get<CacheEntry>(cacheKey);

        if (entry && this.isCacheValid(entry)) {
            console.log('Using cached documentation response from persistent storage');
            return entry.data;
        }

        // Clean up expired entry if it exists
        if (entry) {
            await this.extensionContext.globalState.update(cacheKey, undefined);
        }

        return null;
    }

    /**
     * Cache a response for future use
     */
    async setCachedResponse(requestBody: { models: string[] }, data: string): Promise<void> {
        const cacheKey = this.generateCacheKey(requestBody);
        const cacheEntry: CacheEntry = {
            data,
            timestamp: Date.now(),
        };

        await this.extensionContext.globalState.update(cacheKey, cacheEntry);

        // Update sync keys to include new cache entry
        this.enableCacheSync();
    }

    /**
     * Clear expired cache entries from persistent storage
     */
    async clearExpiredCache(): Promise<void> {
        const now = Date.now();
        let clearedCount = 0;
        const allKeys = this.extensionContext.globalState.keys();

        for (const key of allKeys) {
            if (key.startsWith(DocumentationCache.CACHE_PREFIX)) {
                const entry = this.extensionContext.globalState.get<CacheEntry>(key);
                if (entry && now - entry.timestamp >= DocumentationCache.CACHE_DURATION_MS) {
                    await this.extensionContext.globalState.update(key, undefined);
                    clearedCount++;
                }
            }
        }

        if (clearedCount > 0) {
            console.log(`Cleared ${clearedCount} expired cache entries from persistent storage`);
        }
    }

    /**
     * Clear all cache entries from persistent storage
     */
    async clearAllCache(): Promise<void> {
        const allKeys = this.extensionContext.globalState.keys();
        let clearedCount = 0;

        for (const key of allKeys) {
            if (key.startsWith(DocumentationCache.CACHE_PREFIX)) {
                await this.extensionContext.globalState.update(key, undefined);
                clearedCount++;
            }
        }

        console.log(`Cleared all cache entries from persistent storage (${clearedCount} items)`);
    }

    /**
     * Get cache statistics for display purposes
     */
    async getCacheStatistics(): Promise<{
        validEntries: number;
        expiredEntries: number;
        totalEntries: number;
        totalSize: number;
        cacheDurationMinutes: number;
        syncEnabled: boolean;
    }> {
        const allKeys = this.extensionContext.globalState.keys();
        const cacheKeys = allKeys.filter((key) => key.startsWith(DocumentationCache.CACHE_PREFIX));
        let validEntries = 0;
        let expiredEntries = 0;
        let totalSize = 0;

        for (const key of cacheKeys) {
            const entry = this.extensionContext.globalState.get<CacheEntry>(key);
            if (entry) {
                const size = JSON.stringify(entry).length;
                totalSize += size;

                if (this.isCacheValid(entry)) {
                    validEntries++;
                } else {
                    expiredEntries++;
                }
            }
        }

        return {
            validEntries,
            expiredEntries,
            totalEntries: cacheKeys.length,
            totalSize,
            cacheDurationMinutes: DocumentationCache.CACHE_DURATION_MS / 1000 / 60,
            syncEnabled: cacheKeys.length > 0,
        };
    }

    /**
     * Show cache statistics in a VS Code information modal
     */
    async showCacheStatistics(): Promise<void> {
        const stats = await this.getCacheStatistics();
        const sizeInKB = (stats.totalSize / 1024).toFixed(2);

        const message = `📊 **ZenStack Documentation Cache Statistics**

**Cache Entries:**
• Valid entries: ${stats.validEntries}
• Expired entries: ${stats.expiredEntries}
• Total entries: ${stats.totalEntries}

**Storage:**
• Total size: ${sizeInKB} KB
• Cache duration: ${stats.cacheDurationMinutes} minutes

**Sync Status:**
• Sync enabled: ${stats.syncEnabled ? 'Yes' : 'No'}`;

        // Show in information modal
        const clearExpired = 'Clear Expired';
        const clearAll = 'Clear All';
        const selection = await vscode.window.showInformationMessage(message, { modal: true }, clearExpired, clearAll);

        if (selection === clearExpired) {
            await this.clearExpiredCache();
            vscode.window.showInformationMessage('Expired cache entries cleared');
        } else if (selection === clearAll) {
            await this.clearAllCache();
            vscode.window.showInformationMessage('All cache entries cleared');
        }
    }
}
