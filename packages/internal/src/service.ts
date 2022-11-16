import * as fs from 'fs';
import { EventEmitter } from 'stream';
import { ServiceConfig } from './config';
import {
    FieldInfo,
    LogEvent,
    LogLevel,
    PolicyOperationKind,
    QueryContext,
    Service,
} from './types';
import colors from 'colors';
import { validate } from './validation';
import { z } from 'zod';

export abstract class DefaultService<
    DbClient extends {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        $on: (eventType: any, handler: (event: any) => void) => void;
    }
> implements Service<DbClient>
{
    protected config: ServiceConfig;
    private prisma: DbClient;
    protected readonly logEmitter = new EventEmitter();
    private readonly logSettings = {
        query: { stdout: false, emit: false },
        verbose: { stdout: false, emit: false },
        info: { stdout: true, emit: false },
        warn: { stdout: true, emit: false },
        error: { stdout: true, emit: false },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private guardModule: any;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private fieldConstraintModule: any;

    private readonly prismaLogLevels: LogLevel[] = [
        'query',
        'info',
        'warn',
        'error',
    ];

    constructor() {
        this.initialize();
    }

    private initialize() {
        this.config = this.loadConfig();

        // initialize log sink mapping
        if (this.config.log) {
            // reset all levels
            for (const key of Object.keys(this.logSettings)) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (this.logSettings as any)[key] = { stdout: false, emit: false };
            }

            for (const entry of this.config.log) {
                const level = typeof entry === 'string' ? entry : entry.level;
                if (!Object.keys(this.logSettings).includes(level)) {
                    console.error(`Unknown log level "${level}"`);
                    continue;
                }
                if (typeof entry === 'string') {
                    this.logSettings[level].stdout = true;
                } else if (entry.emit === 'stdout') {
                    this.logSettings[level].stdout = true;
                } else {
                    this.logSettings[level].emit = true;
                }
            }
        }

        console.log(
            'Initializing ZenStack service with config:',
            JSON.stringify(this.config)
        );

        this.prisma = this.initializePrisma();

        for (const level of this.prismaLogLevels) {
            if (this.logSettings[level].emit) {
                this.verbose(`Hooking prisma log level ${level}`);
                this.prisma.$on(level, (e) => {
                    this.logEmitter.emit(level, e);
                });
            }
        }
    }

    $on(level: LogLevel, callback: (event: LogEvent) => void): void {
        this.logEmitter.on(level, callback);
    }

    private handleLog(level: LogLevel, message: string): void {
        if (this.logSettings[level].stdout) {
            switch (level) {
                case 'verbose':
                    console.log(colors.blue(`zenstack:${level}`), message);
                    break;
                case 'info':
                    console.log(colors.cyan(`zenstack:${level}`), message);
                    break;
                case 'warn':
                    console.warn(colors.yellow(`zenstack:${level}`), message);
                    break;
                case 'error':
                    console.error(colors.red(`zenstack:${level}`), message);
                    break;
            }
        }
        if (this.logSettings[level].emit) {
            this.logEmitter.emit(level, { timestamp: new Date(), message });
        }
    }

    private loadConfig(): ServiceConfig {
        const configFile = './zenstack.config.json';
        if (fs.existsSync(configFile)) {
            try {
                const config = JSON.parse(
                    fs.readFileSync(configFile).toString('utf-8')
                );
                return config as ServiceConfig;
            } catch (err) {
                console.error('Failed to load zenstack.config.json', err);
            }
        }
        return {};
    }

    get db(): DbClient {
        return this.prisma;
    }

    async resolveField(
        model: string,
        field: string
    ): Promise<FieldInfo | undefined> {
        if (!this.guardModule) {
            this.guardModule = await this.loadGuardModule();
        }
        return this.guardModule._fieldMapping?.[model]?.[field];
    }

    async buildQueryGuard(
        model: string,
        operation: PolicyOperationKind,
        context: QueryContext
    ): Promise<unknown> {
        if (!this.guardModule) {
            this.guardModule = await this.loadGuardModule();
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const provider: (context: QueryContext) => any =
            this.guardModule[model + '_' + operation];
        return provider(context);
    }

    async validateModelPayload(
        model: string,
        mode: 'create' | 'update',
        payload: unknown
    ) {
        if (!this.fieldConstraintModule) {
            this.fieldConstraintModule = await this.loadFieldConstraintModule();
        }
        const validator = this.fieldConstraintModule[
            `${model}_${mode}_validator`
        ] as z.ZodType;
        if (validator) {
            validate(validator, payload);
        }
    }

    verbose(message: string): void {
        this.handleLog('verbose', message);
    }

    info(message: string): void {
        this.handleLog('info', message);
    }

    warn(message: string): void {
        this.handleLog('warn', message);
    }

    error(message: string): void {
        this.handleLog('error', message);
    }

    reinitialize(): void {
        this.initialize();
    }

    protected abstract initializePrisma(): DbClient;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected abstract loadGuardModule(): Promise<any>;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected abstract loadFieldConstraintModule(): Promise<any>;
}
