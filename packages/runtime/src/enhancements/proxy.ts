/* eslint-disable @typescript-eslint/no-explicit-any */

import { DbClientContract } from '../types';
import { ModelMeta } from './types';

/**
 * Prisma batch write operation result
 */
export type BatchResult = { count: number };

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

    createMany(args: any, skipDuplicates?: boolean): Promise<BatchResult>;

    update(args: any): Promise<unknown>;

    updateMany(args: any): Promise<BatchResult>;

    upsert(args: any): Promise<unknown>;

    delete(args: any): Promise<unknown>;

    deleteMany(args: any): Promise<BatchResult>;

    aggregate(args: any): Promise<unknown>;

    groupBy(args: any): Promise<unknown>;

    count(args: any): Promise<unknown | number>;
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
    constructor(protected readonly prisma: DbClientContract, protected readonly model: string) {}

    async findUnique(args: any): Promise<unknown> {
        args = await this.preprocessArgs('findUnique', args);
        const r = await this.prisma[this.model].findUnique(args);
        return this.processResultEntity(r);
    }

    async findUniqueOrThrow(args: any): Promise<unknown> {
        args = await this.preprocessArgs('findUniqueOrThrow', args);
        const r = await this.prisma[this.model].findUniqueOrThrow(args);
        return this.processResultEntity(r);
    }

    async findFirst(args: any): Promise<unknown> {
        args = await this.preprocessArgs('findFirst', args);
        const r = this.prisma[this.model].findFirst(args);
        return this.processResultEntity(r);
    }

    async findFirstOrThrow(args: any): Promise<unknown> {
        args = await this.preprocessArgs('findFirstOrThrow', args);
        const r = await this.prisma[this.model].findFirstOrThrow(args);
        return this.processResultEntity(r);
    }

    async findMany(args: any): Promise<unknown[]> {
        args = await this.preprocessArgs('findMany', args);
        const r = await this.prisma[this.model].findMany(args);
        return this.processResultEntity(r);
    }

    async create(args: any): Promise<unknown> {
        args = await this.preprocessArgs('create', args);
        const r = await this.prisma[this.model].create(args);
        return this.processResultEntity(r);
    }

    async createMany(args: any, skipDuplicates?: boolean | undefined): Promise<{ count: number }> {
        args = await this.preprocessArgs('createMany', args);
        return this.prisma[this.model].createMany(args, skipDuplicates);
    }

    async update(args: any): Promise<unknown> {
        args = await this.preprocessArgs('update', args);
        const r = this.prisma[this.model].update(args);
        return this.processResultEntity(r);
    }

    async updateMany(args: any): Promise<{ count: number }> {
        args = await this.preprocessArgs('updateMany', args);
        return this.prisma[this.model].updateMany(args);
    }

    async upsert(args: any): Promise<unknown> {
        args = await this.preprocessArgs('upsert', args);
        const r = this.prisma[this.model].upsert(args);
        return this.processResultEntity(r);
    }

    async delete(args: any): Promise<unknown> {
        args = await this.preprocessArgs('delete', args);
        const r = this.prisma[this.model].delete(args);
        return this.processResultEntity(r);
    }

    async deleteMany(args: any): Promise<{ count: number }> {
        args = await this.preprocessArgs('deleteMany', args);
        return this.prisma[this.model].deleteMany(args);
    }

    async aggregate(args: any): Promise<unknown> {
        args = await this.preprocessArgs('aggregate', args);
        return this.prisma[this.model].aggregate(args);
    }

    async groupBy(args: any): Promise<unknown> {
        args = await this.preprocessArgs('groupBy', args);
        return this.prisma[this.model].groupBy(args);
    }

    async count(args: any): Promise<unknown> {
        args = await this.preprocessArgs('count', args);
        return this.prisma[this.model].count(args);
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

/**
 * Makes a Prisma client proxy.
 */
export function makeProxy<T extends PrismaProxyHandler>(
    prisma: any,
    modelMeta: ModelMeta,
    makeHandler: (prisma: object, model: string) => T,
    name = 'unnamed_enhancer',
    inTransaction = false
) {
    const models = Object.keys(modelMeta.fields).map((k) => k.toLowerCase());
    const proxy = new Proxy(prisma, {
        get: (target: any, prop: string | symbol, receiver: any) => {
            // enhancer metadata
            if (prop === '__zenstack_enhancer') {
                return name;
            }

            // transaction metadata
            if (prop === '__zenstack_tx') {
                return inTransaction;
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
                            const txProxy = makeProxy(tx, modelMeta, makeHandler, name + '$tx', true);
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
            if (!propVal) {
                return undefined;
            }

            return createHandlerProxy(makeHandler(target, prop));
        },
    });

    return proxy;
}

// A proxy for capturing errors and processing stack trace
function createHandlerProxy<T extends PrismaProxyHandler>(handler: T): T {
    return new Proxy(handler, {
        get(target, propKey) {
            const prop = target[propKey as keyof T];
            if (typeof prop !== 'function') {
                return prop;
            }

            // eslint-disable-next-line @typescript-eslint/ban-types
            const origMethod = prop as Function;
            return async function (...args: any[]) {
                const _err = new Error(ERROR_MARKER);
                try {
                    return await origMethod.apply(handler, args);
                } catch (err) {
                    if (_err.stack && err instanceof Error) {
                        (err as any).internalStack = err.stack;
                        err.stack = cleanCallStack(_err.stack, propKey.toString(), err.message);
                    }
                    throw err;
                }
            };
        },
    });
}

// Filter out @zenstackhq/runtime stack (generated by proxy) from stack trace
function cleanCallStack(stack: string, method: string, message: string) {
    // message line
    let resultStack = `Error calling enhanced Prisma method \`${method}\`: ${message}`;

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
        if (line.includes('@zenstackhq/runtime') || line.includes('<anonymous>')) {
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
