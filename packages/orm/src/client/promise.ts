import type { SchemaDef } from '@zenstackhq/schema';
import type { ClientContract } from './contract';

/**
 * A promise that only executes when it's awaited or .then() is called.
 */
export type ZenStackPromise<Schema extends SchemaDef, T> = Promise<T> & {
    /**
     * @private
     * Callable to get a plain promise.
     */
    cb: (txClient?: ClientContract<Schema>) => Promise<T>;
};

/**
 * Creates a promise that only executes when it's awaited or .then() is called.
 * @see https://github.com/prisma/prisma/blob/main/packages/client/src/runtime/core/request/createPrismaPromise.ts
 */
export function createZenStackPromise(
    callback: (txClient?: ClientContract<any>) => Promise<unknown>,
): ZenStackPromise<any, unknown> {
    let promise: Promise<unknown> | undefined;
    const cb = (txClient?: ClientContract<any>) => {
        try {
            return (promise ??= valueToPromise(callback(txClient)));
        } catch (err) {
            // deal with synchronous errors
            return Promise.reject<unknown>(err);
        }
    };

    return {
        then(onFulfilled, onRejected) {
            return cb().then(onFulfilled, onRejected);
        },
        catch(onRejected) {
            return cb().catch(onRejected);
        },
        finally(onFinally) {
            return cb().finally(onFinally);
        },
        cb,
        [Symbol.toStringTag]: 'ZenStackPromise',
    };
}

function valueToPromise(thing: any): Promise<any> {
    if (typeof thing === 'object' && typeof thing?.then === 'function') {
        return thing;
    } else {
        return Promise.resolve(thing);
    }
}
