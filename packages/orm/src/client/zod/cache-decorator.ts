import stableStringify from 'json-stable-stringify';

/**
 * Method decorator that caches the return value based on method name and arguments.
 *
 * Requirements:
 * - Class must have a `getCache(key: string)` method
 * - Class must have a `setCache(key: string, value: any)` method
 */
export function cache() {
    return function (_target: any, propertyKey: string, descriptor: PropertyDescriptor) {
        const originalMethod = descriptor.value;

        descriptor.value = function (
            this: {
                getCache: (key: string) => unknown;
                setCache: (key: string, value: unknown) => void;
            } & Record<string, unknown>,
            ...args: any[]
        ) {
            // Build cache key object
            const cacheKeyObj: Record<string, unknown> = {
                $call: propertyKey,
                $args: args.map((arg) => {
                    if (Array.isArray(arg)) {
                        // sort array arguments for consistent cache keys
                        return [...arg].sort();
                    } else {
                        return arg;
                    }
                }),
            };

            // Generate stable string key
            const cacheKey = stableStringify(cacheKeyObj)!;

            // Check cache
            const cached = this.getCache(cacheKey);
            if (cached !== undefined) {
                return cached;
            }

            // Execute original method
            const result = originalMethod.apply(this, args);

            // Store in cache
            this.setCache(cacheKey, result);

            return result;
        };

        return descriptor;
    };
}
