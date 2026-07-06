import { type Mixpanel } from 'mixpanel';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import * as os from 'os';
import { isInCi } from './utils/is-ci';
import { isInContainer } from './utils/is-container';
import isDocker from './utils/is-docker';
import { isWsl } from './utils/is-wsl';
import { getMachineId } from './utils/machine-id-utils';
import { getVersion } from './utils/version-utils';

/**
 * Telemetry events
 */
export type TelemetryEvents =
    | 'cli:start'
    | 'cli:complete'
    | 'cli:error'
    | 'cli:command:start'
    | 'cli:command:complete'
    | 'cli:command:error'
    | 'cli:plugin:start'
    | 'cli:plugin:complete'
    | 'cli:plugin:error';

/**
 * Utility class for sending telemetry
 */
export class Telemetry {
    private readonly mixpanel: Mixpanel | undefined;
    private readonly hostId = getMachineId();
    private readonly sessionid = randomUUID();
    private readonly _os_type = os.type();
    private readonly _os_release = os.release();
    private readonly _os_arch = os.arch();
    private readonly _os_version = os.version();
    private readonly _os_platform = os.platform();
    private readonly version = getVersion();
    private readonly prismaVersion = this.getPrismaVersion();
    private readonly isDocker = isDocker();
    private readonly isWsl = isWsl();
    private readonly isContainer = isInContainer();
    private readonly isCi = isInCi;

    constructor() {
        // if (process.env['DO_NOT_TRACK'] !== '1' && TELEMETRY_TRACKING_TOKEN) {
        //     this.mixpanel = init(TELEMETRY_TRACKING_TOKEN, {
        //         geolocate: true,
        //     });
        // }

        // Telemetry is currently muted
        return;
    }

    get isTracking() {
        return !!this.mixpanel;
    }

    track(event: TelemetryEvents, properties: Record<string, unknown> = {}) {
        if (this.mixpanel) {
            const payload = {
                distinct_id: this.hostId,
                session: this.sessionid,
                time: new Date(),
                $os: this._os_type,
                osType: this._os_type,
                osRelease: this._os_release,
                osPlatform: this._os_platform,
                osArch: this._os_arch,
                osVersion: this._os_version,
                nodeVersion: process.version,
                version: this.version,
                prismaVersion: this.prismaVersion,
                isDocker: this.isDocker,
                isWsl: this.isWsl,
                isContainer: this.isContainer,
                isCi: this.isCi,
                ...properties,
            };
            this.mixpanel.track(event, payload);
        }
    }

    trackError(err: Error) {
        this.track('cli:error', {
            message: err.message,
            stack: err.stack,
        });
    }

    async trackSpan<T>(
        startEvent: TelemetryEvents,
        completeEvent: TelemetryEvents,
        errorEvent: TelemetryEvents,
        properties: Record<string, unknown>,
        action: () => Promise<T> | T,
    ) {
        this.track(startEvent, properties);
        const start = Date.now();
        let success = true;
        try {
            return await action();
        } catch (err: any) {
            this.track(errorEvent, {
                message: err.message,
                stack: err.stack,
                ...properties,
            });
            success = false;
            throw err;
        } finally {
            this.track(completeEvent, {
                duration: Date.now() - start,
                success,
                ...properties,
            });
        }
    }

    async trackCommand(command: string, action: () => Promise<void> | void) {
        await this.trackSpan('cli:command:start', 'cli:command:complete', 'cli:command:error', { command }, action);
    }

    async trackCli(action: () => Promise<void> | void) {
        await this.trackSpan('cli:start', 'cli:complete', 'cli:error', {}, action);
    }

    getPrismaVersion() {
        try {
            const packageJsonPath = import.meta.resolve('prisma/package.json');
            const packageJsonUrl = new URL(packageJsonPath);
            const packageJson = JSON.parse(fs.readFileSync(packageJsonUrl, 'utf8'));
            return packageJson.version;
        } catch {
            return undefined;
        }
    }
}

export const telemetry = new Telemetry();
