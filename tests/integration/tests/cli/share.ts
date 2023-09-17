import { getWorkspaceNpmCacheFolder } from '@zenstackhq/testtools';
import fs from 'fs';

export function createNpmrc() {
    fs.writeFileSync('.npmrc', `cache=${getWorkspaceNpmCacheFolder(__dirname)}`);
}
