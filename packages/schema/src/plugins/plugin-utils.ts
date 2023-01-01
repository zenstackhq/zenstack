import fs from 'fs';
import path from 'path';

export const RUNTIME_PACKAGE = '@zenstackhq/runtime';
export const ALL_OPERATION_KINDS = ['create', 'update', 'read', 'delete'];

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

export function ensureFolder(folder: string) {
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
