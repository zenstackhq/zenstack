import { machineIdSync } from "node-machine-id";
import { v4 as uuid } from 'uuid';

export function getMachineId() {
    // machineIdSync() is not compatible with non-shell hosts such as Vercel
    try {
        return machineIdSync();
    } catch {
        return uuid();
    }
}
