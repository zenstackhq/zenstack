import { init, Mixpanel } from 'mixpanel';
import * as os from 'os';
import * as vscode from 'vscode';
import { getMachineId } from '../utils/machine-id-utils';
import { v5 as uuidv5 } from 'uuid';
import { TELEMETRY_TRACKING_TOKEN } from '../constants';

export type TelemetryEvents =
    | 'extension:activate'
    | 'extension:zmodel-preview'
    | 'extension:zmodel-save'
    | 'extension:signin:show'
    | 'extension:signin:start'
    | 'extension:signin:error'
    | 'extension:signin:complete';

export class VSCodeTelemetry {
    private readonly mixpanel: Mixpanel | undefined;
    private readonly deviceId = this.getDeviceId();
    private readonly _os_type = os.type();
    private readonly _os_release = os.release();
    private readonly _os_arch = os.arch();
    private readonly _os_version = os.version();
    private readonly _os_platform = os.platform();
    private readonly vscodeAppName = vscode.env.appName;
    private readonly vscodeVersion = vscode.version;
    private readonly vscodeAppHost = vscode.env.appHost;

    constructor() {
        if (vscode.env.isTelemetryEnabled) {
            this.mixpanel = init(TELEMETRY_TRACKING_TOKEN, {
                geolocate: true,
            });
        }
    }

    private getDeviceId() {
        const hostId = getMachineId();
        // namespace UUID for generating UUIDv5 from DNS 'zenstack.dev'
        return uuidv5(hostId, '133cac15-3efb-50fa-b5fc-4b90e441e563');
    }

    track(event: TelemetryEvents, properties: Record<string, unknown> = {}) {
        if (this.mixpanel) {
            const payload = {
                distinct_id: this.deviceId,
                time: new Date(),
                $os: this._os_type,
                osType: this._os_type,
                osRelease: this._os_release,
                osPlatform: this._os_platform,
                osArch: this._os_arch,
                osVersion: this._os_version,
                nodeVersion: process.version,
                vscodeAppName: this.vscodeAppName,
                vscodeVersion: this.vscodeVersion,
                vscodeAppHost: this.vscodeAppHost,
                ...properties,
            };
            this.mixpanel.track(event, payload);
        }
    }

    identify(userId: string) {
        if (this.mixpanel) {
            this.mixpanel.track('$identify', {
                $identified_id: userId,
                $anon_id: this.deviceId,
                token: TELEMETRY_TRACKING_TOKEN,
            });
        }
    }
}
export default new VSCodeTelemetry();
