import { Mixpanel, init } from 'mixpanel';
import { TELEMETRY_TRACKING_TOKEN } from 'env';
import { machineIdSync } from 'node-machine-id';
import cuid from 'cuid';
import * as os from 'os';
import sleep from 'sleep-promise';
import exitHook from 'async-exit-hook';
import { CliError } from './cli/cli-error';
import { CommanderError } from 'commander';

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
    | 'cli:generator:start'
    | 'cli:generator:complete'
    | 'cli:generator:error';

/**
 * Utility class for sending telemetry
 */
export class Telemetry {
    private readonly mixpanel: Mixpanel | undefined;
    private readonly hostId = machineIdSync();
    private readonly sessionid = cuid();
    private readonly trackingToken = TELEMETRY_TRACKING_TOKEN;
    private readonly _os = os.platform();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    private readonly version = require('../package.json').version;
    private exitWait = 200;

    constructor() {
        if (process.env.DO_NOT_TRACK !== '1' && this.trackingToken) {
            this.mixpanel = init(this.trackingToken, {
                geolocate: true,
            });
        }

        exitHook(async (callback) => {
            if (this.mixpanel) {
                // a small delay to ensure telemetry is sent
                await sleep(this.exitWait);
            }
            callback();
        });

        exitHook.uncaughtExceptionHandler(async (err) => {
            this.track('cli:error', {
                message: err.message,
                stack: err.stack,
            });
            if (this.mixpanel) {
                // a small delay to ensure telemetry is sent
                await sleep(this.exitWait);
            }

            if (err instanceof CliError || err instanceof CommanderError) {
                // error already handled
            } else {
                throw err;
            }

            process.exit(1);
        });
    }

    track(event: TelemetryEvents, properties: Record<string, unknown> = {}) {
        if (this.mixpanel) {
            const payload = {
                distinct_id: this.hostId,
                session: this.sessionid,
                time: new Date(),
                $os: this._os,
                nodeVersion: process.version,
                version: this.version,
                ...properties,
            };
            this.mixpanel.track(event, payload);
        }
    }

    async trackSpan(
        startEvent: TelemetryEvents,
        completeEvent: TelemetryEvents,
        errorEvent: TelemetryEvents,
        properties: Record<string, unknown>,
        action: () => Promise<unknown> | void
    ) {
        this.track(startEvent, properties);
        const start = Date.now();
        let success = true;
        try {
            await Promise.resolve(action());
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
}

export default new Telemetry();
