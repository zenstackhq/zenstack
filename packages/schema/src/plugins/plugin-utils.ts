import { DEFAULT_RUNTIME_LOAD_PATH, type PolicyOperationKind } from '@zenstackhq/runtime';
import { PluginGlobalOptions, ensureEmptyDir, getLiteral } from '@zenstackhq/sdk';
import fs from 'fs';
import path from 'path';
import { PluginRunnerOptions } from '../cli/plugin-runner';
import { isPlugin, Model, Plugin } from '@zenstackhq/sdk/ast';

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
    if (output) {
        ensureEmptyDir(output);
        if (!options.output) {
            const pkgJson = {
                name: '.zenstack',
                version: '1.0.0',
                exports: {
                    './enhance': {
                        types: './enhance.d.ts',
                        default: './enhance.js',
                    },
                    './enhance-edge': {
                        types: './enhance-edge.d.ts',
                        default: './enhance-edge.js',
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
                    './model-meta': {
                        types: './model-meta.d.ts',
                        default: './model-meta.js',
                    },
                    './models': {
                        types: './models.d.ts',
                    },
                },
            };

            // create stubs for zod exports to make bundlers that statically
            // analyze imports (like Next.js) happy
            for (const zodFolder of ['models', 'input', 'objects']) {
                fs.mkdirSync(path.join(output, 'zod', zodFolder), { recursive: true });
                fs.writeFileSync(path.join(output, 'zod', zodFolder, 'index.js'), '');
            }

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

    // for testing, use the local node_modules
    if (process.env.ZENSTACK_TEST === '1') {
        return path.join(process.cwd(), 'node_modules', DEFAULT_RUNTIME_LOAD_PATH);
    }

    // find the real runtime module path, it might be a symlink in pnpm
    let runtimeModulePath = require.resolve('@zenstackhq/runtime');

    // start with the parent folder of @zenstackhq, supposed to be a node_modules folder
    while (!runtimeModulePath.endsWith('@zenstackhq') && runtimeModulePath !== '/') {
        runtimeModulePath = path.join(runtimeModulePath, '..');
    }
    runtimeModulePath = path.join(runtimeModulePath, '..');

    const modulesFolder = getNodeModulesFolder(runtimeModulePath);
    return modulesFolder ? path.join(modulesFolder, DEFAULT_RUNTIME_LOAD_PATH) : undefined;
}

/**
 * Core plugin providers
 */
export enum CorePlugins {
    Prisma = '@core/prisma',
    Zod = '@core/zod',
    Enhancer = '@core/enhancer',
}

/**
 * Gets the custom output folder for a plugin.
 */
export function getPluginCustomOutputFolder(zmodel: Model, provider: string) {
    const plugin = zmodel.declarations.find(
        (d): d is Plugin =>
            isPlugin(d) && d.fields.some((f) => f.name === 'provider' && getLiteral<string>(f.value) === provider)
    );
    if (!plugin) {
        return undefined;
    }
    const output = plugin.fields.find((f) => f.name === 'output');
    return output && getLiteral<string>(output.value);
}
