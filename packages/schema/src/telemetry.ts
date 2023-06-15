import { createId } from '@paralleldrive/cuid2';
import exitHook from 'async-exit-hook';
import { CommanderError } from 'commander';
import { init, Mixpanel } from 'mixpanel';
import { machineIdSync } from 'node-machine-id';
import * as os from 'os';
import sleep from 'sleep-promise';
import { CliError } from './cli/cli-error';
import { TELEMETRY_TRACKING_TOKEN } from './constants';
import { getVersion } from './utils/version-utils';

/**
 * Telemetry events
 */
export type TelemetryEvents =
    | 'cli:start'
    | 'cli:complete'
    | 'cli:error'
    | 'cli:crash'
    | 'cli:command:start'
    | 'cli:command:complete'
    | 'cli:command:error'
    | 'cli:plugin:start'
    | 'cli:plugin:complete'
    | 'cli:plugin:error'
    | 'prisma:error';

/**
 * Utility class for sending telemetry
 */
export class Telemetry {
    private readonly mixpanel: Mixpanel | undefined;
    private readonly hostId = machineIdSync();
    private readonly sessionid = createId();
    private readonly _os = os.platform();
    private readonly version = getVersion();
    private exitWait = 200;

    constructor() {
        if (process.env.DO_NOT_TRACK !== '1' && TELEMETRY_TRACKING_TOKEN) {
            this.mixpanel = init(TELEMETRY_TRACKING_TOKEN, {
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

        const errorHandler = async (err: Error) => {
            if (err instanceof CliError || err instanceof CommanderError) {
                this.track('cli:error', {
                    message: err.message,
                    stack: err.stack,
                });
                if (this.mixpanel) {
                    // a small delay to ensure telemetry is sent
                    await sleep(this.exitWait);
                }
                // error already logged
            } else {
                console.error('\nAn unexpected error occurred:\n', err);
                this.track('cli:crash', {
                    message: err.message,
                    stack: err.stack,
                });
                if (this.mixpanel) {
                    // a small delay to ensure telemetry is sent
                    await sleep(this.exitWait);
                }
            }

            process.exit(1);
        };

        exitHook.unhandledRejectionHandler(errorHandler);
        exitHook.uncaughtExceptionHandler(errorHandler);
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
