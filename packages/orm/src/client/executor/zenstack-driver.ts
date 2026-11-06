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
 * State shared by all `ZenStackDriver` instances created over the same underlying driver.
 */
export type ZenStackDriverState = {
    driver: Driver;
    adapter: DialectAdapter;
    connectionMutex?: ConnectionMutex;
    initPromise?: Promise<void>;
    initDone: boolean;
    destroyPromise?: Promise<void>;
    // connections whose query methods have been patched for logging
    loggedConnections: WeakSet<DatabaseConnection>;
    // log of the driver instance that most recently acquired each connection
    connectionLogs: WeakMap<DatabaseConnection, Log>;
    txConnections: WeakMap<DatabaseConnection, Array<() => Promise<unknown>>>;
};

/**
 * Copied from kysely's RuntimeDriver
 */
export class ZenStackDriver implements Driver {
    readonly #state: ZenStackDriverState;
    readonly #log: Log;

    constructor(driver: Driver, log: Log, adapter: DialectAdapter, sharedState?: ZenStackDriverState) {
        this.#log = log;
        this.#state = sharedState ?? {
            driver,
            adapter,
            connectionMutex: adapter.supportsMultipleConnections ? undefined : new ConnectionMutex(),
            initDone: false,
            loggedConnections: new WeakSet(),
            connectionLogs: new WeakMap(),
            txConnections: new WeakMap(),
        };
    }

    /**
     * Creates a driver that shares this driver's underlying driver, connections, lifecycle and
     * transaction bookkeeping, but logs with the given log.
     */
    withLog(log: Log): ZenStackDriver {
        return new ZenStackDriver(this.#state.driver, log, this.#state.adapter, this.#state);
    }

    async init(): Promise<void> {
        const state = this.#state;
        if (state.destroyPromise) {
            throw new Error('driver has already been destroyed');
        }

        if (!state.initPromise) {
            state.initPromise = state.driver
                .init()
                .then(() => {
                    state.initDone = true;
                })
                .catch((err) => {
                    state.initPromise = undefined;
                    return Promise.reject(err);
                });
        }

        await state.initPromise;
    }

    async acquireConnection(): Promise<DatabaseConnection> {
        const state = this.#state;
        if (state.destroyPromise) {
            throw new Error('driver has already been destroyed');
        }

        if (!state.initDone) {
            await this.init();
        }

        await state.connectionMutex?.obtainLock();

        try {
            const connection = await state.driver.acquireConnection();
            // Kysely drivers hand out a connection to one holder at a time (until it's released), so the
            // connection's queries are logged with the log of the driver that acquired it. Drivers created
            // with `withLog` share connections but not logs.
            state.connectionLogs.set(connection, this.#log);
            if (needsLogging(this.#log) && !state.loggedConnections.has(connection)) {
                addLogging(connection, state);
                state.loggedConnections.add(connection);
            }
            return connection;
        } catch (error) {
            state.connectionMutex?.releaseLock();
            throw error;
        }
    }

    async releaseConnection(connection: DatabaseConnection): Promise<void> {
        // Forget the holder's log first: a pool (e.g. pg-pool) can hand the connection to a queued
        // acquisition during release, and queries run on it before that acquisition records its own log
        // (such as a dialect's `onReserveConnection` hook) must not be logged with the previous holder's log.
        this.#state.connectionLogs.delete(connection);
        try {
            await this.#state.driver.releaseConnection(connection);
        } finally {
            this.#state.connectionMutex?.releaseLock();
        }
    }

    async beginTransaction(connection: DatabaseConnection, settings: TransactionSettings): Promise<void> {
        const result = await this.#state.driver.beginTransaction(connection, settings);
        this.#state.txConnections.set(connection, []);
        return result;
    }

    async commitTransaction(connection: DatabaseConnection): Promise<void> {
        const txConnections = this.#state.txConnections;
        try {
            const result = await this.#state.driver.commitTransaction(connection);
            const callbacks = txConnections.get(connection);
            // delete from the map immediately to avoid accidental re-triggering
            txConnections.delete(connection);
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
            txConnections.delete(connection);
            throw err;
        }
    }

    async rollbackTransaction(connection: DatabaseConnection): Promise<void> {
        try {
            return await this.#state.driver.rollbackTransaction(connection);
        } finally {
            this.#state.txConnections.delete(connection);
        }
    }

    async destroy(): Promise<void> {
        const state = this.#state;
        if (!state.initPromise) {
            return;
        }

        await state.initPromise;

        if (!state.destroyPromise) {
            state.destroyPromise = state.driver.destroy().catch((err) => {
                state.destroyPromise = undefined;
                return Promise.reject(err);
            });
        }

        await state.destroyPromise;
    }

    isTransactionConnection(connection: DatabaseConnection): boolean {
        return this.#state.txConnections.has(connection);
    }

    registerTransactionCommitCallback(connection: DatabaseConnection, callback: () => Promise<unknown>): void {
        const txConnections = this.#state.txConnections;
        if (!txConnections.has(connection)) {
            return;
        }
        const callbacks = txConnections.get(connection);
        if (callbacks) {
            callbacks.push(callback);
        } else {
            txConnections.set(connection, [callback]);
        }
    }
}

function needsLogging(log: Log | undefined): log is Log {
    return !!log && (log.isLevelEnabled('query') || log.isLevelEnabled('error'));
}

// This function monkey patches the database connection's executeQuery method
// by adding logging code around it. Monkey patching is not pretty, but it's
// the best option in this case. The log is looked up per query, so the connection
// logs with the log of whichever driver currently holds it.
function addLogging(connection: DatabaseConnection, state: ZenStackDriverState): void {
    const executeQuery = connection.executeQuery;
    const streamQuery = connection.streamQuery;

    connection.executeQuery = async (compiledQuery): Promise<QueryResult<any>> => {
        const log = state.connectionLogs.get(connection);
        if (!needsLogging(log)) {
            return executeQuery.call(connection, compiledQuery);
        }

        let caughtError: unknown;
        const startTime = performanceNow();

        try {
            return await executeQuery.call(connection, compiledQuery);
        } catch (error) {
            caughtError = error;
            await logError(log, error, compiledQuery, startTime);
            throw error;
        } finally {
            if (!caughtError) {
                await logQuery(log, compiledQuery, startTime);
            }
        }
    };

    connection.streamQuery = async function* (compiledQuery, chunkSize): AsyncIterableIterator<QueryResult<any>> {
        const log = state.connectionLogs.get(connection);
        if (!needsLogging(log)) {
            yield* streamQuery.call(connection, compiledQuery, chunkSize);
            return;
        }

        let caughtError: unknown;
        const startTime = performanceNow();

        try {
            for await (const result of streamQuery.call(connection, compiledQuery, chunkSize)) {
                yield result;
            }
        } catch (error) {
            caughtError = error;
            await logError(log, error, compiledQuery, startTime);
            throw error;
        } finally {
            if (!caughtError) {
                await logQuery(log, compiledQuery, startTime, true);
            }
        }
    };
}

async function logError(log: Log, error: unknown, compiledQuery: CompiledQuery, startTime: number): Promise<void> {
    await log.error(() => ({
        level: 'error',
        error,
        query: compiledQuery,
        queryDurationMillis: performanceNow() - startTime,
    }));
}

async function logQuery(log: Log, compiledQuery: CompiledQuery, startTime: number, isStream = false): Promise<void> {
    await log.query(() => ({
        level: 'query',
        isStream,
        query: compiledQuery,
        queryDurationMillis: performanceNow() - startTime,
    }));
}

export function performanceNow() {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
        return performance.now();
    } else {
        return Date.now();
    }
}
