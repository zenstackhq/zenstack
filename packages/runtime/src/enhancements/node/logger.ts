/* eslint-disable @typescript-eslint/no-explicit-any */

import { EventEmitter } from 'stream';

/**
 * A logger that uses an existing Prisma client to emit.
 */
export class Logger {
    private emitter: EventEmitter | undefined;
    private eventNames: Array<string | symbol> = [];

    constructor(private readonly prisma: any) {
        const engine = (this.prisma as any)._engine;
        this.emitter = engine ? (engine.logEmitter as EventEmitter) : undefined;
        if (this.emitter) {
            if (typeof this.emitter.eventNames === 'function') {
                // Node.js
                this.eventNames = this.emitter.eventNames();
            } else if ('events' in this.emitter && this.emitter.events && typeof this.emitter.events === 'object') {
                // edge runtime
                this.eventNames = Object.keys((this.emitter as any).events);
            } else {
                this.eventNames = [];
            }
        }
    }

    /**
     * Checks if a log level is enabled.
     */
    public enabled(level: 'info' | 'warn' | 'error') {
        return !!this.eventNames.includes(level);
    }

    /**
     * Generates a message with the given level.
     */
    public log(level: 'info' | 'warn' | 'error', message: string) {
        this.emitter?.emit(level, {
            timestamp: new Date(),
            message,
            target: 'zenstack',
        });
    }

    /**
     * Generates a log message with info level.
     */
    public info(message: string) {
        this.log('info', message);
    }

    /**
     * Generates a log message with warn level.
     */
    public warn(message: string) {
        this.log('warn', message);
    }

    /**
     * Generates a log message with error level.
     */
    public error(message: string) {
        this.log('error', message);
    }
}
