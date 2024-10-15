/* eslint-disable @typescript-eslint/no-explicit-any */

import { getModelInfo, type ModelMeta } from '../../cross';

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

/**
 * Create a deferred promise with fluent API call stub installed.
 *
 * @param callback The callback to execute when the promise is awaited.
 * @param parentArgs The parent promise's query args.
 * @param modelMeta The model metadata.
 * @param model The model name.
 */
export function createFluentPromise(
    callback: () => Promise<any>,
    parentArgs: any,
    modelMeta: ModelMeta,
    model: string
): Promise<any> {
    const promise: any = createDeferredPromise(callback);

    const modelInfo = getModelInfo(modelMeta, model);
    if (!modelInfo) {
        return promise;
    }

    // install fluent call stub for model fields
    Object.values(modelInfo.fields)
        .filter((field) => field.isDataModel)
        .forEach((field) => {
            // e.g., `posts` in `db.user.findUnique(...).posts()`
            promise[field.name] = (fluentArgs: any) => {
                if (field.isArray) {
                    // an array relation terminates fluent call chain
                    return createDeferredPromise(async () => {
                        setFluentSelect(parentArgs, field.name, fluentArgs ?? true);
                        const parentResult: any = await promise;
                        return parentResult?.[field.name] ?? null;
                    });
                } else {
                    fluentArgs = { ...fluentArgs };
                    // create a chained subsequent fluent call promise
                    return createFluentPromise(
                        async () => {
                            setFluentSelect(parentArgs, field.name, fluentArgs);
                            const parentResult: any = await promise;
                            return parentResult?.[field.name] ?? null;
                        },
                        fluentArgs,
                        modelMeta,
                        field.type
                    );
                }
            };
        });

    return promise;
}

function setFluentSelect(args: any, fluentFieldName: any, fluentArgs: any) {
    delete args.include;
    args.select = { [fluentFieldName]: fluentArgs };
}
