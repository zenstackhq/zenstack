/**
 * This mutex is used to ensure that only one operation at a time can
 * acquire a connection from the driver. This is necessary when the
 * driver only has a single connection, like SQLite and PGlite.
 *
 * @see {@link https://github.com/kysely-org/kysely/blob/478ec67b2de2568f5590a015d3e120644e81bd87/src/driver/connection-mutex.ts|Kysely Source}
 */
export class ConnectionMutex {
    #promise?: Promise<void>;
    #resolve?: () => void;

    async obtainLock(): Promise<void> {
        while (this.#promise) {
            await this.#promise;
        }

        this.#promise = new Promise((resolve) => {
            this.#resolve = resolve;
        });
    }

    releaseLock(): void {
        const resolve = this.#resolve;

        this.#promise = undefined;
        this.#resolve = undefined;

        resolve?.();
    }
}
