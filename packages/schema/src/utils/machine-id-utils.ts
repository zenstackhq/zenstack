// modified from https://github.com/automation-stack/node-machine-id

import { execSync } from 'child_process';
import { createHash } from 'crypto';
import { v4 as uuid } from 'uuid';

const { platform } = process;
const win32RegBinPath = {
    native: '%windir%\\System32',
    mixed: '%windir%\\sysnative\\cmd.exe /c %windir%\\System32',
};
const guid = {
    darwin: 'ioreg -rd1 -c IOPlatformExpertDevice',
    win32:
        `${win32RegBinPath[isWindowsProcessMixedOrNativeArchitecture()]}\\REG.exe ` +
        'QUERY HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography ' +
        '/v MachineGuid',
    linux: '( cat /var/lib/dbus/machine-id /etc/machine-id 2> /dev/null || hostname 2> /dev/null) | head -n 1 || :',
    freebsd: 'kenv -q smbios.system.uuid || sysctl -n kern.hostuuid',
};

function isWindowsProcessMixedOrNativeArchitecture() {
    // eslint-disable-next-line no-prototype-builtins
    if (process.arch === 'ia32' && process.env.hasOwnProperty('PROCESSOR_ARCHITEW6432')) {
        return 'mixed';
    }
    return 'native';
}

function hash(guid: string): string {
    return createHash('sha256').update(guid).digest('hex');
}

function expose(result: string): string {
    switch (platform) {
        case 'darwin':
            return result
                .split('IOPlatformUUID')[1]
                .split('\n')[0]
                .replace(/=|\s+|"/gi, '')
                .toLowerCase();
        case 'win32':
            return result
                .toString()
                .split('REG_SZ')[1]
                .replace(/\r+|\n+|\s+/gi, '')
                .toLowerCase();
        case 'linux':
            return result
                .toString()
                .replace(/\r+|\n+|\s+/gi, '')
                .toLowerCase();
        case 'freebsd':
            return result
                .toString()
                .replace(/\r+|\n+|\s+/gi, '')
                .toLowerCase();
        default:
            throw new Error(`Unsupported platform: ${process.platform}`);
    }
}

export function getMachineId() {
    if (!(platform in guid)) {
        return uuid();
    }
    try {
        const value = execSync(guid[platform as keyof typeof guid]);
        const id = expose(value.toString());
        return hash(id);
    } catch {
        return uuid();
    }
}
