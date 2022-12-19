/* eslint-disable @typescript-eslint/no-explicit-any */
import { EventEmitter } from 'stream';

export class Logger {
    constructor(private readonly prisma: any) {}

    private get emitter() {
        const engine = (this.prisma as any).getEngine();
        return engine ? (engine.logEmitter as EventEmitter) : undefined;
    }

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
