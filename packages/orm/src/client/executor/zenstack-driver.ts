import type {
    CompiledQuery,
    DatabaseConnection,
    DialectAdapter,
    Driver,
    Log,
    QueryResult,
    TransactionSettings,
} from 'kysely';
import { ConnectionMutex } from './connection-mutex';

/**
 * Copied from kysely's RuntimeDriver
 */
export class ZenStackDriver implements Driver {
    readonly #driver: Driver;
    readonly #log: Log;
    readonly #connectionMutex?: ConnectionMutex;

    #initPromise?: Promise<void>;
    #initDone: boolean;
    #destroyPromise?: Promise<void>;
    #connections = new WeakSet<DatabaseConnection>();
    #txConnections = new WeakMap<DatabaseConnection, Array<() => Promise<unknown>>>();

    constructor(driver: Driver, log: Log, adapter: DialectAdapter) {
        this.#initDone = false;
        this.#driver = driver;
        this.#log = log;

        if (!adapter.supportsMultipleConnections) {
            this.#connectionMutex = new ConnectionMutex();
        }
    }

    async init(): Promise<void> {
        if (this.#destroyPromise) {
            throw new Error('driver has already been destroyed');
        }

        if (!this.#initPromise) {
            this.#initPromise = this.#driver
                .init()
                .then(() => {
                    this.#initDone = true;
                })
                .catch((err) => {
                    this.#initPromise = undefined;
                    return Promise.reject(err);
                });
        }

        await this.#initPromise;
    }

    async acquireConnection(): Promise<DatabaseConnection> {
        if (this.#destroyPromise) {
            throw new Error('driver has already been destroyed');
        }

        if (!this.#initDone) {
            await this.init();
        }

        await this.#connectionMutex?.obtainLock();

        try {
            const connection = await this.#driver.acquireConnection();
            if (!this.#connections.has(connection)) {
                if (this.#needsLogging()) {
                    this.#addLogging(connection);
                }

                this.#connections.add(connection);
            }
            return connection;
        } catch (error) {
            this.#connectionMutex?.releaseLock();
            throw error;
        }
    }

    async releaseConnection(connection: DatabaseConnection): Promise<void> {
        try {
            await this.#driver.releaseConnection(connection);
        } finally {
            this.#connectionMutex?.releaseLock();
        }
    }

    async beginTransaction(connection: DatabaseConnection, settings: TransactionSettings): Promise<void> {
        const result = await this.#driver.beginTransaction(connection, settings);
        this.#txConnections.set(connection, []);
        return result;
    }

    async commitTransaction(connection: DatabaseConnection): Promise<void> {
        try {
            const result = await this.#driver.commitTransaction(connection);
            const callbacks = this.#txConnections.get(connection);
            // delete from the map immediately to avoid accidental re-triggering
            this.#txConnections.delete(connection);
            if (callbacks) {
                for (const callback of callbacks) {
                    try {
                        await callback();
                    } catch (err) {
                        // errors in commit callbacks are logged but do not fail the commit
                        console.error(`Error executing transaction commit callback: ${err}`);
                    }
                }
            }
            return result;
        } catch (err) {
            this.#txConnections.delete(connection);
            throw err;
        }
    }

    async rollbackTransaction(connection: DatabaseConnection): Promise<void> {
        try {
            return await this.#driver.rollbackTransaction(connection);
        } finally {
            this.#txConnections.delete(connection);
        }
    }

    async destroy(): Promise<void> {
        if (!this.#initPromise) {
            return;
        }

        await this.#initPromise;

        if (!this.#destroyPromise) {
            this.#destroyPromise = this.#driver.destroy().catch((err) => {
                this.#destroyPromise = undefined;
                return Promise.reject(err);
            });
        }

        await this.#destroyPromise;
    }

    #needsLogging(): boolean {
        return this.#log.isLevelEnabled('query') || this.#log.isLevelEnabled('error');
    }

    // This method monkey patches the database connection's executeQuery method
    // by adding logging code around it. Monkey patching is not pretty, but it's
    // the best option in this case.
    #addLogging(connection: DatabaseConnection): void {
        const executeQuery = connection.executeQuery;
        const streamQuery = connection.streamQuery;
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const dis = this;

        connection.executeQuery = async (compiledQuery): Promise<QueryResult<any>> => {
            let caughtError: unknown;
            const startTime = performanceNow();

            try {
                return await executeQuery.call(connection, compiledQuery);
            } catch (error) {
                caughtError = error;
                await dis.#logError(error, compiledQuery, startTime);
                throw error;
            } finally {
                if (!caughtError) {
                    await dis.#logQuery(compiledQuery, startTime);
                }
            }
        };

        connection.streamQuery = async function* (compiledQuery, chunkSize): AsyncIterableIterator<QueryResult<any>> {
            let caughtError: unknown;
            const startTime = performanceNow();

            try {
                for await (const result of streamQuery.call(connection, compiledQuery, chunkSize)) {
                    yield result;
                }
            } catch (error) {
                caughtError = error;
                await dis.#logError(error, compiledQuery, startTime);
                throw error;
            } finally {
                if (!caughtError) {
                    await dis.#logQuery(compiledQuery, startTime, true);
                }
            }
        };
    }

    async #logError(error: unknown, compiledQuery: CompiledQuery, startTime: number): Promise<void> {
        await this.#log.error(() => ({
            level: 'error',
            error,
            query: compiledQuery,
            queryDurationMillis: this.#calculateDurationMillis(startTime),
        }));
    }

    async #logQuery(compiledQuery: CompiledQuery, startTime: number, isStream = false): Promise<void> {
        await this.#log.query(() => ({
            level: 'query',
            isStream,
            query: compiledQuery,
            queryDurationMillis: this.#calculateDurationMillis(startTime),
        }));
    }

    #calculateDurationMillis(startTime: number): number {
        return performanceNow() - startTime;
    }

    isTransactionConnection(connection: DatabaseConnection): boolean {
        return this.#txConnections.has(connection);
    }

    registerTransactionCommitCallback(connection: DatabaseConnection, callback: () => Promise<unknown>): void {
        if (!this.#txConnections.has(connection)) {
            return;
        }
        const callbacks = this.#txConnections.get(connection);
        if (callbacks) {
            callbacks.push(callback);
        } else {
            this.#txConnections.set(connection, [callback]);
        }
    }
}

export function performanceNow() {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
        return performance.now();
    } else {
        return Date.now();
    }
}
