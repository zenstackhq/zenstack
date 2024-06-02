/* eslint-disable @typescript-eslint/no-explicit-any */

import deepcopy from 'deepcopy';
import { PRISMA_PROXY_ENHANCER } from '../constants';
import type { ModelMeta } from '../cross';
import type { DbClientContract } from '../types';
import type { InternalEnhancementOptions } from './create-enhancement';
import { createDeferredPromise, createFluentPromise } from './promise';

/**
 * Prisma batch write operation result
 */
export type BatchResult = { count: number };

/**
 * Function for transforming errors.
 */
export type ErrorTransformer = (error: unknown) => unknown;

/**
 * Interface for proxy that intercepts Prisma operations.
 */
export interface PrismaProxyHandler {
    findUnique(args: any): Promise<unknown | null>;

    findUniqueOrThrow(args: any): Promise<unknown>;

    findFirst(args: any): Promise<unknown | null>;

    findFirstOrThrow(args: any): Promise<unknown>;

    findMany(args: any): Promise<unknown[]>;

    create(args: any): Promise<unknown>;

    createMany(args: { data: any; skipDuplicates?: boolean }): Promise<BatchResult>;

    createManyAndReturn(args: { data: any; select: any; include: any; skipDuplicates?: boolean }): Promise<unknown[]>;

    update(args: any): Promise<unknown>;

    updateMany(args: any): Promise<BatchResult>;

    upsert(args: any): Promise<unknown>;

    delete(args: any): Promise<unknown>;

    deleteMany(args: any): Promise<BatchResult>;

    aggregate(args: any): Promise<unknown>;

    groupBy(args: any): Promise<unknown>;

    count(args: any): Promise<unknown | number>;

    subscribe(args: any): Promise<unknown>;
}

/**
 * All Prisma operation names
 */
export type PrismaProxyActions = keyof PrismaProxyHandler;

/**
 * A default implementation of @see PrismaProxyHandler which directly
 * delegates to the wrapped Prisma client. It offers a few overridable
 * methods to allow more easily inject custom logic.
 */
export class DefaultPrismaProxyHandler implements PrismaProxyHandler {
    constructor(
        protected readonly prisma: DbClientContract,
        protected readonly model: string,
        protected readonly options: InternalEnhancementOptions
    ) {}

    protected withFluentCall(method: keyof PrismaProxyHandler, args: any, postProcess = true): Promise<unknown> {
        args = args ? deepcopy(args) : {};
        const promise = createFluentPromise(
            async () => {
                args = await this.preprocessArgs(method, args);
                const r = await this.prisma[this.model][method](args);
                return postProcess ? this.processResultEntity(r) : r;
            },
            args,
            this.options.modelMeta,
            this.model
        );
        return promise;
    }

    protected deferred<TResult = unknown>(method: keyof PrismaProxyHandler, args: any, postProcess = true) {
        return createDeferredPromise<TResult>(async () => {
            args = await this.preprocessArgs(method, args);
            const r = await this.prisma[this.model][method](args);
            return postProcess ? this.processResultEntity(r) : r;
        });
    }

    findUnique(args: any) {
        return this.withFluentCall('findUnique', args);
    }

    findUniqueOrThrow(args: any) {
        return this.withFluentCall('findUniqueOrThrow', args);
    }

    findFirst(args: any) {
        return this.withFluentCall('findFirst', args);
    }

    findFirstOrThrow(args: any) {
        return this.withFluentCall('findFirstOrThrow', args);
    }

    findMany(args: any) {
        return this.deferred<unknown[]>('findMany', args);
    }

    create(args: any): Promise<unknown> {
        return this.deferred('create', args);
    }

    createMany(args: { data: any; skipDuplicates?: boolean }) {
        return this.deferred<{ count: number }>('createMany', args, false);
    }

    createManyAndReturn(args: { data: any; select: any; include: any; skipDuplicates?: boolean }) {
        return this.deferred<unknown[]>('createManyAndReturn', args);
    }

    update(args: any) {
        return this.deferred('update', args);
    }

    updateMany(args: any) {
        return this.deferred<{ count: number }>('updateMany', args, false);
    }

    upsert(args: any) {
        return this.deferred('upsert', args);
    }

    delete(args: any) {
        return this.deferred('delete', args);
    }

    deleteMany(args: any) {
        return this.deferred<{ count: number }>('deleteMany', args, false);
    }

    aggregate(args: any) {
        return this.deferred('aggregate', args, false);
    }

    groupBy(args: any) {
        return this.deferred('groupBy', args, false);
    }

    count(args: any): Promise<unknown> {
        return this.deferred('count', args, false);
    }

    subscribe(args: any) {
        return this.deferred('subscribe', args, false);
    }

    /**
     * Processes result entities before they're returned
     */
    protected async processResultEntity<T>(data: T): Promise<T> {
        return data;
    }

    /**
     * Processes query args before they're passed to Prisma.
     */
    protected async preprocessArgs(method: PrismaProxyActions, args: any) {
        return args;
    }
}

// a marker for filtering error stack trace
const ERROR_MARKER = '__error_marker__';

const customInspect = Symbol.for('nodejs.util.inspect.custom');

/**
 * Makes a Prisma client proxy.
 */
export function makeProxy<T extends PrismaProxyHandler>(
    prisma: any,
    modelMeta: ModelMeta,
    makeHandler: (prisma: object, model: string) => T,
    name = 'unnamed_enhancer',
    errorTransformer?: ErrorTransformer
) {
    const models = Object.keys(modelMeta.models).map((k) => k.toLowerCase());

    const proxy = new Proxy(prisma, {
        get: (target: any, prop: string | symbol, receiver: any) => {
            // enhancer metadata
            if (prop === PRISMA_PROXY_ENHANCER) {
                return name;
            }

            if (prop === '$transaction') {
                // for interactive transactions, we need to proxy the transaction function so that
                // when it runs the callback, it provides a proxy to the Prisma client wrapped with
                // the same handler
                //
                // TODO: batch transaction is not supported yet, how?
                const $transaction = Reflect.get(target, prop, receiver);
                if ($transaction) {
                    return (input: any, ...rest: any[]) => {
                        if (Array.isArray(input)) {
                            throw new Error(
                                'Sequential operations transaction is not supported by ZenStack enhanced Prisma client. Please use interactive transaction instead.'
                            );
                        } else if (typeof input !== 'function') {
                            throw new Error('A function value input is expected');
                        }

                        const txFunc = input;
                        return $transaction.bind(target)((tx: any) => {
                            // create a proxy for the transaction function
                            const txProxy = makeProxy(tx, modelMeta, makeHandler, name + '$tx');

                            // call the transaction function with the proxy
                            return txFunc(txProxy);
                        }, ...rest);
                    };
                } else {
                    return $transaction;
                }
            }

            if (typeof prop !== 'string' || prop.startsWith('$') || !models.includes(prop.toLowerCase())) {
                // skip non-model fields
                return Reflect.get(target, prop, receiver);
            }

            const propVal = Reflect.get(target, prop, receiver);
            if (!propVal || typeof propVal !== 'object') {
                return propVal;
            }

            return createHandlerProxy(makeHandler(target, prop), propVal, prop, errorTransformer);
        },
    });

    proxy[customInspect] = `$zenstack_prisma_${prisma._clientVersion}`;

    return proxy;
}

// A proxy for capturing errors and processing stack trace
function createHandlerProxy<T extends PrismaProxyHandler>(
    handler: T,
    origTarget: any,
    model: string,
    errorTransformer?: ErrorTransformer
): T {
    return new Proxy(handler, {
        get(target, propKey) {
            const prop = target[propKey as keyof T];
            if (typeof prop !== 'function') {
                // the proxy handler doesn't have this method, fall back to the original target
                // this can happen for new methods added by Prisma Client Extensions
                return origTarget[propKey];
            }

            // eslint-disable-next-line @typescript-eslint/ban-types
            const origMethod = prop as Function;
            return function (...args: any[]) {
                // using proxy with async functions results in messed-up error stack trace,
                // create an error to capture the current stack
                const capture = new Error(ERROR_MARKER);

                // the original proxy returned by the PrismaClient proxy
                const promise: Promise<unknown> = origMethod.apply(handler, args);

                // modify the error stack
                const resultPromise = createDeferredPromise(() => {
                    return new Promise((resolve, reject) => {
                        promise.then(
                            (value) => resolve(value),
                            (err) => {
                                if (capture.stack && err instanceof Error) {
                                    // save the original stack and replace it with a clean one
                                    (err as any).internalStack = err.stack;
                                    err.stack = cleanCallStack(capture.stack, model, propKey.toString(), err.message);
                                }

                                if (errorTransformer) {
                                    err = errorTransformer ? errorTransformer(err) : err;
                                }
                                reject(err);
                            }
                        );
                    });
                });

                // carry over extra fields from the original promise
                for (const [k, v] of Object.entries(promise)) {
                    if (!(k in resultPromise)) {
                        (resultPromise as any)[k] = v;
                    }
                }

                return resultPromise;
            };
        },
    });
}

// Filter out @zenstackhq/runtime stack (generated by proxy) from stack trace
function cleanCallStack(stack: string, model: string, method: string, message: string) {
    // message line
    let resultStack = `Error calling enhanced Prisma method \`${model}.${method}\`: ${message}`;

    const lines = stack.split('\n');
    let foundMarker = false;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (!foundMarker) {
            // find marker, then stack trace lines follow
            if (line.includes(ERROR_MARKER)) {
                foundMarker = true;
            }
            continue;
        }

        // skip leading zenstack and anonymous lines
        if (line.includes('@zenstackhq/runtime') || line.includes('Proxy.<anonymous>')) {
            continue;
        }

        // capture remaining lines
        resultStack += lines
            .slice(i)
            .map((l) => '\n' + l)
            .join();
        break;
    }

    return resultStack;
}
