import { DEFAULT_RUNTIME_LOAD_PATH, type PolicyOperationKind } from '@zenstackhq/runtime';
import { PluginGlobalOptions } from '@zenstackhq/sdk';
import fs from 'fs';
import path from 'path';
import { PluginRunnerOptions } from '../cli/plugin-runner';

export const ALL_OPERATION_KINDS: PolicyOperationKind[] = ['create', 'update', 'postUpdate', 'read', 'delete'];

/**
 * Gets the nearest "node_modules" folder by walking up from start path.
 */
export function getNodeModulesFolder(startPath?: string): string | undefined {
    startPath = startPath ?? process.cwd();
    if (startPath.endsWith('node_modules')) {
        return startPath;
    } else if (fs.existsSync(path.join(startPath, 'node_modules'))) {
        return path.join(startPath, 'node_modules');
    } else if (startPath !== '/') {
        const parent = path.join(startPath, '..');
        return getNodeModulesFolder(parent);
    } else {
        return undefined;
    }
}

/**
 * Ensure the default output folder is initialized.
 */
export function ensureDefaultOutputFolder(options: PluginRunnerOptions) {
    const output = options.output ? path.resolve(options.output) : getDefaultOutputFolder();
    if (output && !fs.existsSync(output)) {
        fs.mkdirSync(output, { recursive: true });
        if (!options.output) {
            const pkgJson = {
                name: '.zenstack',
                version: '1.0.0',
                exports: {
                    './model-meta': {
                        types: './model-meta.ts',
                        default: './model-meta.js',
                    },
                    './policy': {
                        types: './policy.d.ts',
                        default: './policy.js',
                    },
                    './zod': {
                        types: './zod/index.d.ts',
                        default: './zod/index.js',
                    },
                    './zod/models': {
                        types: './zod/models/index.d.ts',
                        default: './zod/models/index.js',
                    },
                    './zod/input': {
                        types: './zod/input/index.d.ts',
                        default: './zod/input/index.js',
                    },
                    './zod/objects': {
                        types: './zod/objects/index.d.ts',
                        default: './zod/objects/index.js',
                    },
                },
            };
            fs.writeFileSync(path.join(output, 'package.json'), JSON.stringify(pkgJson, undefined, 4));
        }
    }

    return output;
}

/**
 * Gets the default node_modules/.zenstack output folder for plugins.
 * @returns
 */
export function getDefaultOutputFolder(globalOptions?: PluginGlobalOptions) {
    if (typeof globalOptions?.output === 'string') {
        return path.resolve(globalOptions.output);
    }

    // Find the real runtime module path, it might be a symlink in pnpm
    let runtimeModulePath = require.resolve('@zenstackhq/runtime');

    if (process.env.ZENSTACK_TEST === '1') {
        // handling the case when running as tests, resolve relative to CWD
        runtimeModulePath = path.resolve(path.join(process.cwd(), 'node_modules', '@zenstackhq', 'runtime'));
    }

    if (runtimeModulePath) {
        // start with the parent folder of @zenstackhq, supposed to be a node_modules folder
        while (!runtimeModulePath.endsWith('@zenstackhq') && runtimeModulePath !== '/') {
            runtimeModulePath = path.join(runtimeModulePath, '..');
        }
        runtimeModulePath = path.join(runtimeModulePath, '..');
    }
    const modulesFolder = getNodeModulesFolder(runtimeModulePath);
    return modulesFolder ? path.join(modulesFolder, DEFAULT_RUNTIME_LOAD_PATH) : undefined;
}
