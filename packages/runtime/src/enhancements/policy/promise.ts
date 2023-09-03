/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Creates a promise that only executes when it's awaited or .then() is called.
 * @see https://github.com/prisma/prisma/blob/main/packages/client/src/runtime/core/request/createPrismaPromise.ts
 */
export function createDeferredPromise<T>(callback: () => Promise<T>): Promise<T> {
    let promise: Promise<T> | undefined;
    const cb = () => {
        try {
            return (promise ??= valueToPromise(callback()));
        } catch (err) {
            // deal with synchronous errors
            return Promise.reject<T>(err);
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
