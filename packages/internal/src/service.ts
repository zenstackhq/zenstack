import * as fs from 'fs';
import { EventEmitter } from 'stream';
import { LogLevel, ServiceConfig } from './config';
import { FieldInfo, PolicyOperationKind, QueryContext, Service } from './types';
import colors from 'colors';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EventHandler = (eventType: any, handler: (event: unknown) => void) => void;

export abstract class DefaultService<DbClient extends { $on: EventHandler }>
    implements Service<DbClient>
{
    protected readonly config: ServiceConfig;
    private readonly prisma: DbClient;
    protected readonly logEmitter = new EventEmitter();
    private readonly logSettings = {
        query: { stdout: false, emit: false },
        verbose: { stdout: false, emit: false },
        info: { stdout: false, emit: false },
        warn: { stdout: false, emit: false },
        error: { stdout: false, emit: false },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private guardModule: any;

    constructor() {
        this.config = this.loadConfig();

        // initialize log sink mapping
        if (this.config.log) {
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

        this.prisma.$on('query', (e) => this.logEmitter.emit('query', e));
        this.prisma.$on('info', (e) => this.logEmitter.emit('info', e));
        this.prisma.$on('warn', (e) => this.logEmitter.emit('warn', e));
        this.prisma.$on('error', (e) => this.logEmitter.emit('error', e));
    }

    private handleEvent(eventType: LogLevel, event: unknown): void {
        if (this.logSettings[eventType].stdout) {
            switch (eventType) {
                case 'verbose':
                    console.log(colors.blue(`zenstack:${eventType}`), event);
                    break;
                case 'info':
                    console.log(colors.cyan(`zenstack:${eventType}`), event);
                    break;
                case 'warn':
                    console.warn(colors.yellow(`zenstack:${eventType}`), event);
                    break;
                case 'error':
                    console.error(colors.red(`zenstack:${eventType}`), event);
                    break;
            }
        }
        if (this.logSettings[eventType].emit) {
            this.logEmitter.emit(eventType, event);
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

    verbose(message: string): void {
        this.handleEvent('verbose', message);
    }

    info(message: string): void {
        this.handleEvent('info', message);
    }

    warn(message: string): void {
        this.handleEvent('warn', message);
    }

    error(message: string): void {
        this.handleEvent('error', message);
    }

    protected abstract initializePrisma(): DbClient;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected abstract loadGuardModule(): Promise<any>;
}
