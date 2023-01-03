import { PolicyOperationKind } from '@zenstackhq/runtime';
import fs from 'fs';
import path from 'path';

export const RUNTIME_PACKAGE = '@zenstackhq/runtime';
export const ALL_OPERATION_KINDS: PolicyOperationKind[] = ['create', 'update', 'postUpdate', 'read', 'delete'];

/**
 * Gets the nearest "node_modules" folder by walking up froma start path.
 */
export function getNodeModulesFolder(startPath?: string): string | undefined {
    startPath = startPath ?? process.cwd();
    if (fs.existsSync(path.join(startPath, 'node_modules'))) {
        return path.join(startPath, 'node_modules');
    } else if (startPath !== '/') {
        const parent = path.join(startPath, '..');
        return getNodeModulesFolder(parent);
    } else {
        return undefined;
    }
}

/**
 * Gets the default node_modules/.zenstack output folder for plugins.
 * @returns
 */
export function getDefaultOutputFolder() {
    const modulesFolder = getNodeModulesFolder();
    return modulesFolder ? path.join(modulesFolder, '.zenstack') : undefined;
}

/**
 * Ensure a folder exists and has a package.json in it.
 */
export function ensureNodeModuleFolder(folder: string) {
    if (!fs.existsSync(folder)) {
        fs.mkdirSync(folder, { recursive: true });
    }
    if (!fs.existsSync(path.join(folder, 'package.json'))) {
        fs.writeFileSync(
            path.join(folder, 'package.json'),
            JSON.stringify({
                name: '.zenstack',
                version: '1.0.0',
            })
        );
    }
}
