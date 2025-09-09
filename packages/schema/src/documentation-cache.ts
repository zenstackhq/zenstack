import * as vscode from 'vscode';
import crypto from 'crypto';

// Cache entry interface
interface CacheEntry {
    data: string;
    timestamp: number;
    extensionVersion: string;
}

/**
 * DocumentationCache class handles persistent caching of ZModel documentation
 * using VS Code's globalState for cross-session persistence
 */
export class DocumentationCache implements vscode.Disposable {
    private static readonly CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes cache duration
    private static readonly CACHE_PREFIX = 'doc-cache.';

    private extensionContext: vscode.ExtensionContext;
    private extensionVersion: string;

    constructor(context: vscode.ExtensionContext) {
        this.extensionContext = context;
        this.extensionVersion = context.extension.packageJSON.version as string;
        // clear expired cache entries on initialization
        this.clearExpiredCache();
    }

    /**
     * Dispose of the cache resources (implements vscode.Disposable)
     */
    dispose(): void {}

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
        const hash = crypto
            .createHash('sha512')
            .update(JSON.stringify({ models: normalizedModels }))
            .digest('hex');
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
            extensionVersion: this.extensionVersion,
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
                if (
                    entry?.extensionVersion !== this.extensionVersion ||
                    now - entry.timestamp >= DocumentationCache.CACHE_DURATION_MS
                ) {
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
}
